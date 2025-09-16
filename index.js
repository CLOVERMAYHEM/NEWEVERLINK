// Load environment variables
require('dotenv').config();

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Check critical environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN environment variable');
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error('❌ Missing MONGO_URI environment variable');
  process.exit(1);
}

const fs = require("fs");
const express = require("express");
const {
  Client,
  Collection,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

// Import database functions
let dbFunctions;
try {
  dbFunctions = require('./db');
  console.log('✅ Database functions imported successfully');
} catch (error) {
  console.error('❌ Failed to import database functions:', error);
  process.exit(1);
}

const { 
  connectDB, 
  getGuildSettings, 
  updateGuildSettings, 
  getStickyMessages, 
  setStickyMessage,
  removeStickyMessage,
  getUserTimes,
  updateUserTimes,
  incrementUserTimes,
  getFactionTimes,
  updateFactionTime,
  incrementFactionTime,
  getFactionLeaders,
  getCalendarSettings,
  updateCalendarSettings,
  getCalendarEvents,
  addCalendarEvent,
  updateCalendarEvent,
  removeCalendarEvent,
  getCalendarEventsByWeek,
  getUserTimezone,
  setUserTimezone,
  getGuildTimezone,
  setGuildTimezone,
  getPrioritySettings,
  updatePrioritySettings,
  setPriorityCooldown,
  clearPriorityCooldown
} = dbFunctions;

// In-memory storage for transient data (voice tracking, message counters)
if (!global.timeTracking) global.timeTracking = {};
if (!global.messageCounters) global.messageCounters = {}; // Track messages per channel for sticky system

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

// Load command files
try {
  console.log('🔄 Loading command files...');
  const commandFiles = fs
    .readdirSync("./commands")
    .filter((f) => f.endsWith(".js"));
  
  for (const file of commandFiles) {
    try {
      const command = require(`./commands/${file}`);
      if (command?.data?.name) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
      } else {
        console.warn(`⚠️ Command file ${file} is missing 'data.name'`);
      }
    } catch (error) {
      console.error(`❌ Failed to load command file ${file}:`, error);
      // Don't exit here, just skip the problematic command
    }
  }
  console.log(`✅ Loaded ${client.commands.size} commands successfully`);
} catch (error) {
  console.error('❌ Failed to read commands directory:', error);
  process.exit(1);
}

// Import sticky message functions
const { isUserBotAdmin } = require('./commands/stick.js');

// Import priority tracker functions
const { createPriorityTrackerEmbed } = require('./commands/setprioritytracker.js');

// Utility function to format time duration
function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// Utility function to check if factions are enabled for a guild
async function areFactionsEnabled(guild) {
  const guildId = guild.id;
  const settings = await getGuildSettings(guildId);
  return settings.factionsEnabled;
}

// Utility function to get user's faction
async function getUserFaction(member) {
  // Return null if factions are disabled for this guild
  if (!(await areFactionsEnabled(member.guild))) {
    return null;
  }
  
  const factions = [
    "Laughing Meeks",
    "Unicorn Rapists",
    "Special Activities Directive",
  ];
  for (const factionName of factions) {
    const role = member.guild.roles.cache.find((r) => r.name === factionName);
    if (role && member.roles.cache.has(role.id)) {
      return {
        name: factionName,
        key: factionName.replace(/\s+/g, "_"), // Replace ALL spaces with underscores
      };
    }
  }
  return null;
}

// Send clock-in message
async function sendClockInMessage(member, channel) {
  try {
    const guild = member.guild;
    const settings = await getGuildSettings(guild.id);
    if (!settings.clockInChannelId) return;
    
    const clockInChannel = guild.channels.cache.get(settings.clockInChannelId);
    if (!clockInChannel) {
      console.warn(`⚠️ Clock-in channel not found: ${settings.clockInChannelId}`);
      return;
    }

    const faction = await getUserFaction(member);
    const embed = new EmbedBuilder()
      .setTitle("🟢 Voice Channel Join")
      .setColor(0x00ff00)
      .setDescription(`${member} joined **${channel.name}**`)
      .addFields(
        {
          name: "👤 User",
          value: `${member.displayName} (${member.user.username})`,
          inline: true,
        },
        { name: "🔊 Channel", value: channel.name, inline: true },
        {
          name: "👥 Faction",
          value: faction ? faction.name : "No Faction",
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: "Clock-in System" });

    await clockInChannel.send({ embeds: [embed] });
    console.log(
      `📝 Sent clock-in message for ${member.user.username} in ${channel.name}`,
    );
  } catch (error) {
    console.error(`❌ Error sending clock-in message:`, error);
  }
}

// Send clock-out message
async function sendClockOutMessage(member, channel, sessionDuration) {
  try {
    const guild = member.guild;
    const settings = await getGuildSettings(guild.id);
    if (!settings.clockInChannelId) return;
    
    const clockInChannel = guild.channels.cache.get(settings.clockInChannelId);
    if (!clockInChannel) {
      console.warn(`⚠️ Clock-in channel not found: ${settings.clockInChannelId}`);
      return;
    }

    const faction = await getUserFaction(member);
    const durationText = formatDuration(sessionDuration);

    const embed = new EmbedBuilder()
      .setTitle("🔴 Voice Channel Leave")
      .setColor(0xff0000)
      .setDescription(`${member} left **${channel.name}**`)
      .addFields(
        {
          name: "👤 User",
          value: `${member.displayName} (${member.user.username})`,
          inline: true,
        },
        { name: "🔊 Channel", value: channel.name, inline: true },
        {
          name: "👥 Faction",
          value: faction ? faction.name : "No Faction",
          inline: true,
        },
        { name: "⏱️ Session Duration", value: durationText, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: "Clock-out System" });

    await clockInChannel.send({ embeds: [embed] });
    console.log(
      `📝 Sent clock-out message for ${member.user.username} from ${channel.name} (${durationText})`,
    );
  } catch (error) {
    console.error(`❌ Error sending clock-out message:`, error);
  }
}

// Send motivational DM to user after voice session
async function sendMotivationalDM(member, sessionDuration) {
  // Only send motivational DMs if factions are enabled for this guild
  if (!(await areFactionsEnabled(member.guild))) {
    return;
  }
  
  try {
    const faction = await getUserFaction(member);
    const durationText = formatDuration(sessionDuration);
    
    // Motivational messages based on faction
    const motivationalMessages = {
      "Laughing Meeks": [
        "Keep laughing in the face of adversity! Your faction is proud of your dedication!",
        "Another victory for the Laughing Meeks! Your time and effort strengthen the brotherhood!",
        "The Meeks legacy grows stronger with warriors like you! Keep up the amazing work!",
        "Laughter echoes through the ranks - your faction salutes your commitment!"
      ],
      "Unicorn Rapists": [
        "Magnificent work, warrior! Your faction's power grows with every moment you contribute!",
        "The unicorns bow to your dedication! Keep charging forward for glory!",
        "Your commitment brings honor to the Unicorn Rapists! Stay fierce!",
        "Legend in the making! Your faction celebrates your unwavering spirit!"
      ],
      "Special Activities Directive": [
        "Mission accomplished, operative! Your dedication to the directive is exemplary!",
        "Special activities require special dedication - and you've delivered! Outstanding work!",
        "The directive recognizes your exceptional commitment! Keep executing with precision!",
        "Your service to the Special Activities Directive is commendable! Stay focused!"
      ],
      "No Faction": [
        "Great work in voice! Consider joining a faction to maximize your impact!",
        "Impressive dedication! A faction would be lucky to have someone with your commitment!",
        "Keep up the excellent work! Your potential could shine even brighter with a faction!",
        "Outstanding effort! Think about which faction could benefit from your dedication!"
      ]
    };

    const factionName = faction ? faction.name : "No Faction";
    const messages = motivationalMessages[factionName] || motivationalMessages["No Faction"];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    // Create faction-themed embed
    const factionColors = {
      "Laughing Meeks": 0xFF6B6B,
      "Unicorn Rapists": 0x9B59B6,
      "Special Activities Directive": 0x3498DB,
      "No Faction": 0x95A5A6
    };

    const embed = new EmbedBuilder()
      .setTitle("🏆 Session Complete!")
      .setColor(factionColors[factionName])
      .setDescription(randomMessage)
      .addFields(
        { name: "⏱️ Time Clocked", value: durationText, inline: true },
        { name: "🏴 Faction", value: factionName, inline: true }
      )
      .setFooter({ text: "Every minute counts for your faction's glory!" })
      .setTimestamp();

    // Send DM to user
    await member.send({ embeds: [embed] });
    console.log(`📨 Sent motivational DM to ${member.user.username} (${durationText})`);
    
  } catch (error) {
    // User might have DMs disabled or blocked the bot
    console.log(`⚠️ Could not send DM to ${member.user.username}: ${error.message}`);
  }
}

// Send channel switch message
async function sendChannelSwitchMessage(
  member,
  oldChannel,
  newChannel,
  sessionDuration,
) {
  try {
    const guild = member.guild;
    const settings = await getGuildSettings(guild.id);
    if (!settings.clockInChannelId) return;
    
    const clockInChannel = guild.channels.cache.get(settings.clockInChannelId);
    if (!clockInChannel) {
      console.warn(`⚠️ Clock-in channel not found: ${settings.clockInChannelId}`);
      return;
    }

    const faction = await getUserFaction(member);
    const durationText = formatDuration(sessionDuration);

    const embed = new EmbedBuilder()
      .setTitle("🔄 Voice Channel Switch")
      .setColor(0xffaa00)
      .setDescription(`${member} switched voice channels`)
      .addFields(
        {
          name: "👤 User",
          value: `${member.displayName} (${member.user.username})`,
          inline: true,
        },
        {
          name: "👥 Faction",
          value: faction ? faction.name : "No Faction",
          inline: true,
        },
        { name: "📤 Left Channel", value: oldChannel.name, inline: false },
        { name: "📥 Joined Channel", value: newChannel.name, inline: true },
        { name: "⏱️ Previous Session", value: durationText, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: "Channel Switch System" });

    await clockInChannel.send({ embeds: [embed] });
    console.log(
      `📝 Sent channel switch message for ${member.user.username}: ${oldChannel.name} → ${newChannel.name} (${durationText})`,
    );
  } catch (error) {
    console.error(`❌ Error sending channel switch message:`, error);
  }
}

// Handle new messages for sticky message system
async function handleStickyMessageCheck(message) {
  // Skip bot messages and non-text channels
  if (message.author.bot || message.channel.type !== ChannelType.GuildText) {
    return;
  }

  const channelId = message.channel.id;
  
  try {
    // Get sticky messages from database
    const stickyMessages = await getStickyMessages();
    
    // Check if there's a sticky message for this channel
    if (!stickyMessages[channelId]) {
      return;
    }

    // Skip if this message is the sticky message itself to prevent infinite loops
    if (message.id === stickyMessages[channelId].messageId) {
      return;
    }

    // Initialize message counter for this channel if it doesn't exist
    if (typeof global.messageCounters[channelId] !== 'number') {
      global.messageCounters[channelId] = 0;
    }

    // Increment message counter atomically
    const currentCount = ++global.messageCounters[channelId];

    console.log(`📊 Message count in ${message.channel.name}: ${currentCount}/3`);

    // Check if we've reached 3 messages since last sticky repost
    if (currentCount >= 3) {
      // Use a lock mechanism to prevent multiple simultaneous reposts
      const lockKey = `sticky_lock_${channelId}`;
      if (global[lockKey]) {
        console.log(`📌 Sticky repost already in progress for ${message.channel.name}, skipping`);
        return;
      }
      
      try {
        // Set lock
        global[lockKey] = true;
        
        // Reset counter first
        global.messageCounters[channelId] = 0;
        
        // Repost sticky message
        await repostStickyMessage(message.channel, channelId, stickyMessages[channelId]);
        
        console.log(`📌 Reposted sticky message in ${message.channel.name} after 3 messages`);
      } catch (error) {
        console.error(`❌ Error reposting sticky message in ${channelId}:`, error);
        // If reposting fails, remove the sticky message to prevent further errors
        await removeStickyMessage(channelId);
        delete global.messageCounters[channelId];
      } finally {
        // Always release the lock
        delete global[lockKey];
      }
    }
  } catch (error) {
    console.error(`❌ Error checking sticky messages:`, error);
  }
}

// Repost sticky message function
async function repostStickyMessage(channel, channelId, stickyData) {
  const styles = {
    info: { color: 0x3498DB, emoji: "🎯", title: "Information" },
    warning: { color: 0xF39C12, emoji: "⚠️", title: "Warning" },
    important: { color: 0xE74C3C, emoji: "🚨", title: "Important Notice" },
    announcement: { color: 0x9B59B6, emoji: "📢", title: "Announcement" },
    event: { color: 0x2ECC71, emoji: "🎉", title: "Event" }
  };
  
  const styleConfig = styles[stickyData.style] || styles.info;
  
  try {
    // First delete old sticky message if it exists
    if (stickyData.messageId) {
      try {
        const oldMessage = await channel.messages.fetch(stickyData.messageId);
        if (oldMessage) {
          await oldMessage.delete();
          console.log(`🗑️ Deleted old sticky message in ${channel.name}`);
        }
      } catch (error) {
        console.log(`⚠️ Could not delete old sticky message: ${error.message}`);
        // Continue anyway, old message might already be deleted
      }
    }

    // Fetch user for footer
    let user;
    try {
      user = await channel.client.users.fetch(stickyData.author);
    } catch (error) {
      console.log(`⚠️ Could not fetch sticky message author: ${error.message}`);
      user = { username: "Unknown User", displayAvatarURL: () => null };
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`${styleConfig.emoji} ${styleConfig.title}`)
      .setDescription(stickyData.content)
      .setColor(styleConfig.color)
      .addFields({
        name: "📌 Sticky Message",
        value: "This message will automatically reappear every 3 messages.",
        inline: false
      })
      .setFooter({ 
        text: `Sticky message by ${user.username} • Reposted automatically`,
        iconURL: user.displayAvatarURL ? user.displayAvatarURL() : null
      })
      .setTimestamp();

    // Send new sticky message
    const newMessage = await channel.send({ embeds: [embed] });
    console.log(`✅ Posted new sticky message in ${channel.name}`);
    
    // Update stored message ID and timestamp in database
    const stickyMessages = await getStickyMessages();
    if (stickyMessages[channelId]) {
      const updatedStickyData = {
        ...stickyMessages[channelId],
        messageId: newMessage.id,
        lastReposted: Date.now()
      };
      await setStickyMessage(channelId, updatedStickyData);
    }
    
  } catch (error) {
    console.error(`❌ Error in repostStickyMessage for ${channel.name}:`, error);
    // If we can't send the message, remove the sticky to prevent further errors
    await removeStickyMessage(channelId);
    delete global.messageCounters[channelId];
    console.log(`🧹 Removed broken sticky message from ${channel.name}`);
    throw error; // Re-throw so caller knows it failed
  }
}

// Client ready
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  // Connect to MongoDB
  try {
    await connectDB();
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    console.log('⚠️ Bot will continue with limited functionality (using in-memory storage)');
    console.log('🔄 Will retry database connection periodically...');
    
    // Retry connection every 30 seconds
    setInterval(async () => {
      try {
        await connectDB();
        console.log('✅ Database reconnection successful!');
      } catch (retryError) {
        console.log('🔄 Retrying database connection...');
      }
    }, 30000);
  }

  // Register slash commands
  const commands = [];
  for (const [name, command] of client.commands) {
    commands.push(command.data.toJSON());
  }

  try {
    console.log("🔄 Registering slash commands...");
    await client.application.commands.set(commands);
    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error("❌ Error registering commands:", err);
  }

  startDailyLeaderboard();
  console.log("📅 Daily leaderboard scheduling started");
  console.log("📌 Sticky message system initialized");
  
  startWeeklyCalendarUpdater();
  console.log("📅 Weekly calendar update system started");
  
  startPriorityTrackerUpdater();
  console.log("📋 Priority tracker update system started");
});

// Discord invite link detection and warning handler
async function handleInviteLinkDetection(message) {
  // Skip if not in a guild
  if (!message.guild) return;
  
  // Discord invite link patterns
  const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[^\s]+/gi;
  
  // Check if message contains Discord invite links
  if (inviteRegex.test(message.content)) {
    try {
      // Send DM to the user
      try {
        const now = new Date();
        const timeString = now.toLocaleDateString("en-US", { 
          month: "2-digit", 
          day: "2-digit", 
          year: "numeric" 
        }) + " " + now.toLocaleTimeString("en-US", { 
          hour: "2-digit", 
          minute: "2-digit", 
          hour12: true 
        });
        
        const dmEmbed = new EmbedBuilder()
          .setTitle("🚫 **Invite Link Detected**")
          .setColor(0xFF6B00)
          .setDescription(`⚠️ Your message was deleted in **𝐄𝐯𝐞𝐫𝐆𝐥𝐚𝐝𝐞𝐑𝐏™** because it contained a Discord invite link.\n\n**Your message:** ${message.content}\n\nPlease do not share invite links to other servers.`)
          .setFooter({ text: timeString });
          
        await message.author.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(`❌ Could not send DM to ${message.author.tag}: ${dmError.message}`);
      }
      
      // Delete the message
      await message.delete();
      
      // Get guild settings to find the warning channel
      const guildSettings = await getGuildSettings(message.guild.id);
      
      if (guildSettings.warnChannelId) {
        const warnChannel = message.guild.channels.cache.get(guildSettings.warnChannelId);
        
        if (warnChannel) {
          // Create warning embed
          const now = new Date();
          const timeString = now.toLocaleDateString("en-US", { 
            month: "2-digit", 
            day: "2-digit", 
            year: "numeric" 
          }) + " " + now.toLocaleTimeString("en-US", { 
            hour: "2-digit", 
            minute: "2-digit", 
            hour12: true 
          });
          
          const warnEmbed = new EmbedBuilder()
            .setTitle("Invite Link Warning")
            .setColor(0xFF6B00)
            .addFields(
              { name: "User:", value: `<@${message.author.id}>`, inline: false },
              { name: "Channel:", value: `<#${message.channel.id}>`, inline: false },
              { name: "Deleted Message Content:", value: message.content, inline: false }
            )
            .setFooter({ text: `Auto-Moderation System | ${timeString}` });

          // Send warning to the designated channel
          await warnChannel.send({ embeds: [warnEmbed] });
          
          console.log(`🚨 Discord invite link detected from ${message.author.tag} in #${message.channel.name} - message deleted`);
        }
      }
    } catch (error) {
      console.error('❌ Error handling invite link detection:', error);
    }
  }
}

// Message event handler
client.on("messageCreate", async (message) => {
  // Skip bot messages
  if (message.author.bot) return;
  
  // Handle Discord invite link detection and warnings
  await handleInviteLinkDetection(message);
  
  // Handle sticky message checking
  await handleStickyMessageCheck(message);
});

// Daily leaderboard function
function startDailyLeaderboard() {
  const scheduleDaily = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0); // 12:00 PM UTC

    const msUntilTomorrow = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      sendDailyLeaderboard();
      setInterval(sendDailyLeaderboard, 24 * 60 * 60 * 1000);
    }, msUntilTomorrow);
  };

  scheduleDaily();
}

// Weekly calendar updater function
function startWeeklyCalendarUpdater() {
  const scheduleWeekly = () => {
    const now = new Date();
    const nextMonday = new Date(now);
    
    // Calculate next Monday at 00:00 UTC
    const dayOfWeek = now.getUTCDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek; // 1 if Sunday, else 8 - current day
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);
    
    const msUntilNextMonday = nextMonday.getTime() - now.getTime();

    setTimeout(() => {
      updateAllCalendars();
      setInterval(updateAllCalendars, 7 * 24 * 60 * 60 * 1000); // Every 7 days
    }, msUntilNextMonday);
  };

  scheduleWeekly();
}

// Priority tracker updater function
function startPriorityTrackerUpdater() {
  // Update priority trackers every minute (60 seconds)
  setInterval(updateAllPriorityTrackers, 60 * 1000);
}

// Function to update all calendar displays across all guilds
async function updateAllCalendars() {
  try {
    console.log('📅 Starting weekly calendar update...');
    
    // Get all guilds the bot is in
    const guilds = client.guilds.cache;
    
    for (const [guildId, guild] of guilds) {
      try {
        await updateGuildCalendar(guild);
      } catch (error) {
        console.error(`❌ Error updating calendar for guild ${guild.name}:`, error);
      }
    }
    
    console.log('✅ Weekly calendar update completed');
  } catch (error) {
    console.error('❌ Error in weekly calendar update:', error);
  }
}

// Function to update all priority trackers across all guilds
async function updateAllPriorityTrackers() {
  try {
    // Get all guilds the bot is in
    const guilds = client.guilds.cache;
    
    for (const [guildId, guild] of guilds) {
      try {
        await updateGuildPriorityTracker(guild);
      } catch (error) {
        console.error(`❌ Error updating priority tracker for guild ${guild.name}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in priority tracker update:', error);
  }
}

// Function to update priority tracker for a specific guild
async function updateGuildPriorityTracker(guild) {
  try {
    const guildId = guild.id;
    const settings = await getPrioritySettings(guildId);
    
    // Skip if no tracker channel or message is set
    if (!settings.trackerChannelId || !settings.trackerMessageId) {
      return;
    }
    
    const channel = guild.channels.cache.get(settings.trackerChannelId);
    if (!channel) {
      console.warn(`⚠️ Priority tracker channel not found: ${settings.trackerChannelId} in guild ${guild.name}`);
      return;
    }
    
    // Fetch the existing message
    const message = await channel.messages.fetch(settings.trackerMessageId).catch(() => null);
    if (!message) {
      console.warn(`⚠️ Priority tracker message not found: ${settings.trackerMessageId} in channel ${channel.name}`);
      // Reset the message ID in settings since the message doesn't exist
      const updatedSettings = {
        ...settings,
        trackerMessageId: null,
        lastUpdated: Date.now()
      };
      await updatePrioritySettings(guildId, updatedSettings);
      return;
    }
    
    // Check if cooldown has expired and auto-clear it
    const currentTime = Date.now();
    if (settings.cooldownActive && settings.cooldownEndTime && settings.cooldownEndTime <= currentTime) {
      await clearPriorityCooldown(guildId);
      console.log(`⏰ Auto-cleared expired priority cooldown for guild ${guild.name}`);
      
      // Get updated settings after clearing cooldown
      const updatedSettings = await getPrioritySettings(guildId);
      const embed = createPriorityTrackerEmbed(updatedSettings);
      await message.edit({ embeds: [embed] });
    } else {
      // Just update the message with current data
      const embed = createPriorityTrackerEmbed(settings);
      await message.edit({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error(`❌ Error updating priority tracker for guild ${guild.name}:`, error);
  }
}

// Function to update calendar for a specific guild
async function updateGuildCalendar(guild) {
  try {
    const calendarSettings = await getCalendarSettings(guild.id);
    
    if (!calendarSettings.calendarChannelId) {
      return; // No calendar set for this guild
    }
    
    const channel = guild.channels.cache.get(calendarSettings.calendarChannelId);
    if (!channel) {
      console.warn(`⚠️ Calendar channel not found for guild ${guild.name}`);
      return;
    }
    
    // Get current week's Monday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    // Get events for current week
    const events = await getCalendarEvents(guild.id);
    const weekEvents = events.filter(event => {
      const eventDate = new Date(event.date);
      const weekEnd = new Date(monday);
      weekEnd.setDate(monday.getDate() + 6);
      return eventDate >= monday && eventDate <= weekEnd;
    });
    
    // Generate updated calendar embed with Discord timestamps
    const calendarEmbed = generateServerCalendarEmbed(monday, weekEvents);
    
    // Try to edit existing message first, fallback to delete+send
    if (calendarSettings.calendarMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(calendarSettings.calendarMessageId);
        if (existingMessage) {
          await existingMessage.edit({ embeds: [calendarEmbed] });
          console.log(`📅 Calendar message updated via edit for guild: ${guild.name}`);
          
          // Update last updated timestamp
          await updateCalendarSettings(guild.id, {
            ...calendarSettings,
            lastUpdated: Date.now()
          });
          return;
        }
      } catch (error) {
        console.log(`Could not edit existing calendar message for ${guild.name}, will create new one:`, error.message);
      }
    }
    
    // Fallback: delete old and send new
    if (calendarSettings.calendarMessageId) {
      try {
        const oldMessage = await channel.messages.fetch(calendarSettings.calendarMessageId);
        if (oldMessage) await oldMessage.delete();
      } catch (error) {
        console.log(`Could not delete old calendar message for ${guild.name}:`, error.message);
      }
    }
    
    const newMessage = await channel.send({ embeds: [calendarEmbed] });
    
    // Update settings with new message ID
    await updateCalendarSettings(guild.id, {
      ...calendarSettings,
      calendarMessageId: newMessage.id,
      lastUpdated: Date.now()
    });
    
    console.log(`📅 Updated calendar for guild: ${guild.name}`);
    
  } catch (error) {
    console.error(`Error updating calendar for guild ${guild.name}:`, error);
  }
}

// Helper function to generate server calendar embed (UTC times)
function generateServerCalendarEmbed(monday, events) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const embed = new EmbedBuilder()
    .setTitle("📅 Roleplay Calendar")
    .setColor(0x5865F2)
    .setDescription(`**Week of ${monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}**\n⏰ *Times shown in your local timezone*`)
    .setTimestamp()
    .setFooter({ text: "Use /settimezone to set your timezone • /rpset to add events (admin only)" });
  
  days.forEach((dayName, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const dateString = date.toISOString().split('T')[0];
    
    // Get events for this day
    const dayEvents = events.filter(event => event.date === dateString);
    
    let fieldValue = `📅 ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n`;
    
    if (dayEvents.length === 0) {
      fieldValue += "*No events scheduled*";
    } else {
      // Sort by UTC timestamp if available, fallback to time string
      dayEvents.sort((a, b) => {
        if (a.utcTimestamp && b.utcTimestamp) {
          return a.utcTimestamp - b.utcTimestamp;
        }
        return (a.time || a.inputTime || "").localeCompare(b.time || b.inputTime || "");
      });
      
      dayEvents.forEach(event => {
        // Use Discord timestamp if available, fallback to formatted time
        let timeDisplay;
        if (event.utcTimestamp) {
          timeDisplay = `<t:${event.utcTimestamp}:t>`;
        } else {
          // Fallback for old events without UTC timestamp
          timeDisplay = `${formatDisplayTime(event.time || event.inputTime || "00:00")} UTC`;
        }
        
        fieldValue += `⏰ **${timeDisplay}** - ${event.title}\n`;
        if (event.description) {
          fieldValue += `   └ *${event.description}*\n`;
        }
      });
    }
    
    embed.addFields({
      name: `${getDayEmoji(index)} ${dayName}`,
      value: fieldValue,
      inline: true
    });
  });
  
  return embed;
}

// Helper function to format time for display
function formatDisplayTime(time24) {
  const [hours, minutes] = time24.split(':').map(Number);
  let displayHours = hours;
  const period = hours >= 12 ? 'PM' : 'AM';
  
  if (hours === 0) {
    displayHours = 12;
  } else if (hours > 12) {
    displayHours = hours - 12;
  }
  
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Helper function to get day emoji
function getDayEmoji(dayIndex) {
  const emojis = ["🟦", "🟩", "🟨", "🟧", "🟪", "🟫", "🟥"];
  return emojis[dayIndex] || "📅";
}

async function sendDailyLeaderboard() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    // Get guild settings to find clock-in channel
    const guildSettings = await getGuildSettings(guild.id);
    if (!guildSettings.clockInChannelId) return;

    const clockInChannel = guild.channels.cache.get(guildSettings.clockInChannelId);
    if (!clockInChannel) return;

    // Get faction times from database
    const factionTimes = await getFactionTimes();
    const factionData = [];
    
    for (const [factionKey, totalTime] of Object.entries(factionTimes)) {
      const factionDisplay = factionKey.replace(/_/g, " ");
      const role = guild.roles.cache.find((r) => r.name === factionDisplay);
      const memberCount = role ? role.members.size : 0;
      const hours = Math.floor(totalTime / 3600000);
      const minutes = Math.floor((totalTime % 3600000) / 60000);

      factionData.push({
        name: factionDisplay,
        totalTime,
        timeString: `${hours}h ${minutes}m`,
        memberCount,
      });
    }

    factionData.sort((a, b) => b.totalTime - a.totalTime);

    const embed = new EmbedBuilder()
      .setTitle("📊 Daily Faction Leaderboard")
      .setColor(0x3498db)
      .setDescription("Here are today's faction activity standings!")
      .setTimestamp()
      .setFooter({ text: "Daily Leaderboard • Updates every 24 hours" });

    factionData.forEach((faction, index) => {
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
      embed.addFields({
        name: `${medal} ${faction.name}`,
        value: `⏱️ **${faction.timeString}**\n👥 ${faction.memberCount} members`,
        inline: true,
      });
    });

    await clockInChannel.send({ embeds: [embed] });
    console.log("📊 Daily leaderboard sent");

    // Reset daily times in database
    const factionKeys = ["Laughing_Meeks", "Unicorn_Rapists", "Special_Activities_Directive"];
    for (const factionKey of factionKeys) {
      await updateFactionTime(factionKey, 0);
    }

  } catch (error) {
    console.error("❌ Error sending daily leaderboard:", error);
  }
}

// Voice state update handler
client.on("voiceStateUpdate", async (oldState, newState) => {
  const member = newState.member || oldState.member;
  const userId = member.id;
  const now = Date.now();

  // User joined a voice channel
  if (!oldState.channel && newState.channel) {
    global.timeTracking[userId] = {
      startTime: now,
      channel: newState.channel,
    };

    await sendClockInMessage(member, newState.channel);
    console.log(
      `👤 ${member.user.username} joined voice channel: ${newState.channel.name}`,
    );
  }
  // User left a voice channel
  else if (oldState.channel && !newState.channel) {
    if (global.timeTracking[userId]) {
      const sessionDuration = now - global.timeTracking[userId].startTime;
      const faction = await getUserFaction(member);

      // Only track time if factions are enabled for this guild
      if (await areFactionsEnabled(member.guild)) {
        try {
          // Atomic increment user's total time to prevent data loss from concurrent updates
          await incrementUserTimes(userId, sessionDuration);

          // Atomic increment faction time if user has a faction
          if (faction) {
            await incrementFactionTime(faction.key, sessionDuration);
          }
        } catch (error) {
          console.error(`❌ Error updating time data for ${member.user.username}:`, error);
        }
      }

      await sendClockOutMessage(member, oldState.channel, sessionDuration);
      await sendMotivationalDM(member, sessionDuration);

      delete global.timeTracking[userId];
      console.log(
        `👤 ${member.user.username} left voice channel: ${oldState.channel.name} (${formatDuration(sessionDuration)})`,
      );
    }
  }
  // User switched channels
  else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    if (global.timeTracking[userId]) {
      const sessionDuration = now - global.timeTracking[userId].startTime;
      const faction = await getUserFaction(member);

      // Only track time if factions are enabled for this guild
      if (await areFactionsEnabled(member.guild)) {
        try {
          // Atomic increment user's total time to prevent data loss from concurrent updates
          await incrementUserTimes(userId, sessionDuration);

          // Atomic increment faction time if user has a faction
          if (faction) {
            await incrementFactionTime(faction.key, sessionDuration);
          }
        } catch (error) {
          console.error(`❌ Error updating time data for ${member.user.username}:`, error);
        }
      }

      await sendChannelSwitchMessage(
        member,
        oldState.channel,
        newState.channel,
        sessionDuration,
      );

      // Update tracking for new channel
      global.timeTracking[userId] = {
        startTime: now,
        channel: newState.channel,
      };

      console.log(
        `👤 ${member.user.username} switched: ${oldState.channel.name} → ${newState.channel.name} (${formatDuration(sessionDuration)})`,
      );
    }
  }
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing ${interaction.commandName}:`, error);
    const reply = {
      content: "❌ There was an error executing this command!",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Handle member join events for verification messages
client.on("guildMemberAdd", async (member) => {
  try {
    const guildId = member.guild.id;
    
    // Only work in the specific server
    if (guildId !== "1385815113105145997") {
      return; // Not the target server
    }
    
    // Skip bot accounts
    if (member.user.bot) {
      return; // Don't send verification messages to bots
    }
    
    // Create verification message embed
    const embed = new EmbedBuilder()
      .setTitle("🔐 Welcome! Verification Required")
      .setColor(0xff9900)
      .setDescription(`Welcome to the server, ${member}! To gain access, you need to verify yourself.`)
      .addFields(
        { name: "📝 How to Verify", value: "Use the `/verify` command in <#1412200030215082075>", inline: false },
        { name: "🎮 Required Info", value: "You'll need to provide your PlayStation username", inline: false }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: "Verification System" });
    
    // Send private message to the user
    try {
      await member.send({ embeds: [embed] });
      console.log(`🔐 Sent verification message to ${member.user.username}`);
    } catch (dmError) {
      console.log(`⚠️ Could not DM ${member.user.username}, they may have DMs disabled`);
      
      // Try to send a message in the verification channel as fallback
      const verifyChannel = member.guild.channels.cache.get("1412200030215082075");
      if (verifyChannel) {
        const fallbackEmbed = new EmbedBuilder()
          .setTitle("🔐 Verification Required")
          .setColor(0xff9900)
          .setDescription(`${member}, welcome! Since I couldn't DM you, here's your verification info:`)
          .addFields(
            { name: "📝 How to Verify", value: "Use the `/verify` command in this channel", inline: false },
            { name: "🎮 Required Info", value: "You'll need to provide your PlayStation username", inline: false }
          )
          .setTimestamp();
        
        await verifyChannel.send({ embeds: [fallbackEmbed] });
        console.log(`🔐 Sent fallback verification message in channel for ${member.user.username}`);
      }
    }
    
  } catch (error) {
    console.error("❌ Error in verification system:", error);
  }
});

// Start Express server for health checks
const app = express();
app.get('/', (req, res) => {
  res.send('Discord bot is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

// Login to Discord
const token = process.env.DISCORD_TOKEN;
console.log('🔍 Token check:', token ? `Token found (${token.length} characters)` : 'No token found');

if (!token) {
  console.error("❌ No Discord token found! Please set DISCORD_TOKEN environment variable.");
  process.exit(1);
}

console.log('🔐 Attempting to login to Discord...');
client.login(token).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});
