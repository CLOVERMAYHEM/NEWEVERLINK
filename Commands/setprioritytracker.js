const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getPrioritySettings, updatePrioritySettings } = require('../db');
const { isUserBotAdmin } = require('./stick');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setprioritytracker")
    .setDescription("Set the channel where priority tracker messages will be displayed (Admin only)")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("The channel for priority tracker messages")
        .setRequired(true)),
    // No default permissions - rely on runtime check for administrators or botadmins
  
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guild.id;
    
    // Check if user has admin permissions (Discord admin or bot admin)
    const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
    const isBotAdmin = await isUserBotAdmin(interaction.member);
    
    if (!hasDiscordPerm && !isBotAdmin) {
      return interaction.reply({ 
        content: "❌ You need 'Manage Channels' permission or be a bot administrator to use this command!", 
        ephemeral: true 
      });
    }

    try {
      // Get current priority settings
      const currentSettings = await getPrioritySettings(guildId);
      
      // Update with new tracker channel
      const updatedSettings = {
        ...currentSettings,
        trackerChannelId: channel.id,
        trackerMessageId: null, // Reset message ID when channel changes
        lastUpdated: Date.now()
      };
      
      await updatePrioritySettings(guildId, updatedSettings);

      const embed = new EmbedBuilder()
        .setTitle("✅ Priority Tracker Channel Set")
        .setColor(0x00ff00)
        .setDescription(`Priority tracker messages will now be sent to ${channel}`)
        .addFields(
          { name: "📺 Channel", value: `${channel}`, inline: true },
          { name: "🔧 Set by", value: `${interaction.user}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: "Priority Tracker System" });

      await interaction.reply({ embeds: [embed] });
      
      // Send initial priority tracker message to the new channel
      await sendPriorityTrackerMessage(channel, guildId);
      
    } catch (error) {
      console.error("Error setting priority tracker channel:", error);
      await interaction.reply({ 
        content: "❌ An error occurred while setting the priority tracker channel.", 
        ephemeral: true 
      });
    }
  },
};

// Function to send/update priority tracker message
async function sendPriorityTrackerMessage(channel, guildId) {
  try {
    const settings = await getPrioritySettings(guildId);
    
    // Create priority tracker embed
    const embed = createPriorityTrackerEmbed(settings);
    
    // Send new priority tracker message
    const message = await channel.send({ embeds: [embed] });
    
    // Update settings with new message ID
    const updatedSettings = {
      ...settings,
      trackerMessageId: message.id,
      lastUpdated: Date.now()
    };
    
    await updatePrioritySettings(guildId, updatedSettings);
    
    console.log(`📋 Priority tracker message sent to ${channel.name} in guild ${guildId}`);
    
  } catch (error) {
    console.error("Error sending priority tracker message:", error);
  }
}

// Function to create priority tracker embed
function createPriorityTrackerEmbed(settings) {
  const currentTime = Date.now();
  let cooldownStatus = "🟢 No Cooldown Active";
  let timeRemaining = "N/A";
  
  if (settings.cooldownActive && settings.cooldownEndTime > currentTime) {
    const remainingMs = settings.cooldownEndTime - currentTime;
    timeRemaining = formatDuration(remainingMs);
    cooldownStatus = "🔴 Cooldown Active";
  } else if (settings.cooldownActive && settings.cooldownEndTime <= currentTime) {
    // Cooldown has expired but hasn't been cleared yet
    cooldownStatus = "🟡 Cooldown Expired";
    timeRemaining = "Ready to Clear";
  }
  
  // Priority status emoji and color
  const priorityConfig = settings.priorityActive 
    ? { emoji: "🔴", color: 0xff0000, status: "Active" }
    : { emoji: "🟢", color: 0x00ff00, status: "Inactive" };
  
  const embed = new EmbedBuilder()
    .setTitle("📋 Priority Tracker")
    .setColor(priorityConfig.color)
    .setDescription("Current server priority status and cooldown information")
    .addFields(
      {
        name: "🎯 Priority Status",
        value: `${priorityConfig.emoji} **${priorityConfig.status}**`,
        inline: true
      },
      {
        name: "⏰ Cooldown Status",
        value: cooldownStatus,
        inline: true
      },
      {
        name: "⏱️ Time Remaining",
        value: timeRemaining,
        inline: true
      },
      {
        name: "⚙️ Cooldown Duration",
        value: formatDuration(settings.cooldownDuration),
        inline: true
      },
      {
        name: "📅 Last Updated",
        value: settings.lastUpdated ? `<t:${Math.floor(settings.lastUpdated / 1000)}:R>` : "Never",
        inline: true
      }
    )
    .setTimestamp()
    .setFooter({ text: "Updates every minute • Priority Tracker System" });

  return embed;
}

// Utility function to format duration
function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds <= 0) return "0s";
  
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

// Function to update existing priority tracker message using guild object
async function updatePriorityTrackerMessageByGuild(guild) {
  try {
    const guildId = guild.id;
    const settings = await getPrioritySettings(guildId);
    
    if (!settings.trackerChannelId || !settings.trackerMessageId) {
      return; // No tracker message to update
    }
    
    const channel = guild.channels.cache.get(settings.trackerChannelId);
    if (!channel) return;
    
    const message = await channel.messages.fetch(settings.trackerMessageId).catch(() => null);
    if (!message) return;
    
    // Get updated settings and create new embed
    const updatedSettings = await getPrioritySettings(guildId);
    const embed = createPriorityTrackerEmbed(updatedSettings);
    
    await message.edit({ embeds: [embed] });
    console.log(`📋 Updated priority tracker message in ${channel.name}`);
    
  } catch (error) {
    console.error("Error updating priority tracker message:", error);
  }
}

// Export the utility functions for use in other files
module.exports.sendPriorityTrackerMessage = sendPriorityTrackerMessage;
module.exports.createPriorityTrackerEmbed = createPriorityTrackerEmbed;
module.exports.updatePriorityTrackerMessageByGuild = updatePriorityTrackerMessageByGuild;
module.exports.formatDuration = formatDuration;