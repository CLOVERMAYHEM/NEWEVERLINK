const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { 
  getCalendarSettings, 
  getCalendarEvents, 
  updateCalendarEvent,
  getGuildTimezone 
} = require('../db.js');
const { isUserBotAdmin } = require('./stick');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rpedit")
    .setDescription("Edit an existing roleplay event on the calendar")
    .addStringOption(option =>
      option.setName("event_id")
        .setDescription("ID of the event to edit (use /rplist to see event IDs)")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("day")
        .setDescription("New day of the week for the event")
        .setRequired(false)
        .addChoices(
          { name: "Monday", value: "monday" },
          { name: "Tuesday", value: "tuesday" },
          { name: "Wednesday", value: "wednesday" },
          { name: "Thursday", value: "thursday" },
          { name: "Friday", value: "friday" },
          { name: "Saturday", value: "saturday" },
          { name: "Sunday", value: "sunday" }
        ))
    .addStringOption(option =>
      option.setName("time")
        .setDescription("New time of the event (e.g., 3:00 PM, 15:30, 8 PM)")
        .setRequired(false))
    .addStringOption(option =>
      option.setName("title")
        .setDescription("New title/name of the roleplay event")
        .setRequired(false))
    .addStringOption(option =>
      option.setName("description")
        .setDescription("New description of the roleplay event")
        .setRequired(false)),
    // No default permissions - rely on runtime check for administrators or botadmins
  async execute(interaction) {
    const eventId = interaction.options.getString("event_id");
    const newDay = interaction.options.getString("day");
    const newTime = interaction.options.getString("time");
    const newTitle = interaction.options.getString("title");
    const newDescription = interaction.options.getString("description");
    const guildId = interaction.guild.id;
    
    try {
      // Get calendar settings to check if channel is set
      const calendarSettings = await getCalendarSettings(guildId);
      const guildTimezone = await getGuildTimezone(guildId);
      
      if (!calendarSettings.calendarChannelId) {
        return interaction.reply({
          content: "❌ No calendar channel is set! Please use `/setcalendarchannel` first.",
          ephemeral: true
        });
      }
      
      // Get current events to find the one to edit
      const events = await getCalendarEvents(guildId);
      const eventToEdit = events.find(event => event.id === eventId);
      
      if (!eventToEdit) {
        return interaction.reply({
          content: `❌ Event with ID "${eventId}" not found! Use \`/rplist\` to see all events and their IDs.`,
          ephemeral: true
        });
      }
      
      // Check if user has permission to edit this event (admin, bot admin, or event creator)
      const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      const isBotAdmin = await isUserBotAdmin(interaction.member);
      
      if (eventToEdit.author !== interaction.user.id && !hasDiscordPerm && !isBotAdmin) {
        return interaction.reply({
          content: "❌ You can only edit events you created, unless you're an administrator or bot administrator.",
          ephemeral: true
        });
      }
      
      // Prepare updated event data
      const updatedEventData = { ...eventToEdit };
      
      // Update day and date if provided
      if (newDay) {
        updatedEventData.day = newDay;
        
        // Recalculate date based on new day
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        
        const dayIndex = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(newDay);
        const targetDate = new Date(monday);
        targetDate.setDate(monday.getDate() + dayIndex);
        
        updatedEventData.date = targetDate.toISOString().split('T')[0];
      }
      
      // Update time if provided
      if (newTime) {
        // Validate and parse time
        const timeRegex = /^(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?$/i;
        const timeMatch = newTime.match(timeRegex);
        
        if (!timeMatch) {
          return interaction.reply({
            content: "❌ Invalid time format! Please use formats like: `3:00 PM`, `15:30`, `8 PM`, or `14:00`",
            ephemeral: true
          });
        }
        
        // Convert time to 24-hour format
        let hours = parseInt(timeMatch[1]);
        let minutes = parseInt(timeMatch[2] || "0");
        const period = timeMatch[3]?.toUpperCase();
        
        if (period === "PM" && hours !== 12) {
          hours += 12;
        } else if (period === "AM" && hours === 12) {
          hours = 0;
        }
        
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          return interaction.reply({
            content: "❌ Invalid time! Hours must be 0-23 and minutes must be 0-59.",
            ephemeral: true
          });
        }
        
        const inputTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Convert to UTC timestamp (use existing date if day wasn't changed)
        const targetDate = new Date(updatedEventData.date);
        const properGuildDate = new Date(`${updatedEventData.date}T${inputTime}:00.000`);
        
        // Get what this time would be in UTC from the guild timezone
        const utcEquivalent = new Date(properGuildDate.toLocaleString('en-US', { timeZone: 'UTC' }));
        const guildEquivalent = new Date(properGuildDate.toLocaleString('en-US', { timeZone: guildTimezone }));
        const offsetMs = utcEquivalent.getTime() - guildEquivalent.getTime();
        const finalUtcTime = new Date(properGuildDate.getTime() + offsetMs);
        const finalUtcTimestamp = Math.floor(finalUtcTime.getTime() / 1000);
        
        updatedEventData.utcTimestamp = finalUtcTimestamp;
        updatedEventData.inputTime = inputTime;
        updatedEventData.guildTimezone = guildTimezone;
      }
      
      // Update title if provided
      if (newTitle) {
        updatedEventData.title = newTitle;
      }
      
      // Update description if provided
      if (newDescription !== null) {
        updatedEventData.description = newDescription;
      }
      
      // Update the event in database
      await updateCalendarEvent(guildId, eventId, updatedEventData);
      
      // Update the calendar display
      await updateCalendarDisplay(interaction.guild, calendarSettings);
      
      // Confirm to user
      const confirmEmbed = new EmbedBuilder()
        .setTitle("✏️ Roleplay Event Updated!")
        .setColor(0xffa500)
        .setDescription(`Event **${updatedEventData.title}** has been successfully updated.`)
        .addFields(
          { name: "📌 Title", value: updatedEventData.title, inline: true },
          { name: "📅 Day", value: updatedEventData.day.charAt(0).toUpperCase() + updatedEventData.day.slice(1), inline: true },
          { name: "⏰ Time", value: updatedEventData.utcTimestamp ? `<t:${updatedEventData.utcTimestamp}:t> (${guildTimezone})` : "Not updated", inline: true },
          { name: "📝 Description", value: updatedEventData.description || "No description provided", inline: false }
        )
        .setFooter({ text: `Updated by ${interaction.user.username}` })
        .setTimestamp();
      
      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
      
    } catch (error) {
      console.error('❌ Error editing RP event:', error);
      return interaction.reply({
        content: "❌ Error updating event. Please try again.",
        ephemeral: true
      });
    }
  },
};

// Helper function to update calendar display
async function updateCalendarDisplay(guild, calendarSettings) {
  try {
    const { getCalendarEvents, updateCalendarSettings, getGuildTimezone } = require('../db.js');
    const moment = require('moment-timezone');
    
    const channel = guild.channels.cache.get(calendarSettings.calendarChannelId);
    if (!channel) return;
    
    // Get events for current week in guild timezone
    const guildTimezone = await getGuildTimezone(guild.id);
    const nowInGuildTz = moment.tz(guildTimezone);
    const dayOfWeek = nowInGuildTz.day() === 0 ? 7 : nowInGuildTz.day();
    const mondayInGuildTz = nowInGuildTz.clone().subtract(dayOfWeek - 1, 'days').startOf('day');
    const sundayInGuildTz = mondayInGuildTz.clone().add(6, 'days').endOf('day');
    
    const events = await getCalendarEvents(guild.id);
    const weekEvents = events.filter(event => {
      if (event.utcTimestamp) {
        // Use UTC timestamp for proper comparison
        const weekStartUTC = mondayInGuildTz.utc().unix();
        const weekEndUTC = sundayInGuildTz.utc().unix();
        return event.utcTimestamp >= weekStartUTC && event.utcTimestamp <= weekEndUTC;
      } else {
        // Fallback for legacy events - compare date strings
        const weekStartDate = mondayInGuildTz.format('YYYY-MM-DD');
        const weekEndDate = sundayInGuildTz.format('YYYY-MM-DD');
        return event.date >= weekStartDate && event.date <= weekEndDate;
      }
    });
    
    // Generate calendar embed - pass monday as regular Date for compatibility
    const mondayDate = mondayInGuildTz.toDate();
    const calendarEmbed = generateCalendarEmbed(mondayDate, weekEvents, guildTimezone);
    
    // Try to edit existing message first, fallback to delete+send
    if (calendarSettings.calendarMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(calendarSettings.calendarMessageId);
        if (existingMessage) {
          await existingMessage.edit({ embeds: [calendarEmbed] });
          console.log('📅 Calendar message updated via edit');
          
          // Update last updated timestamp
          await updateCalendarSettings(guild.id, {
            ...calendarSettings,
            lastUpdated: Date.now()
          });
          return;
        }
      } catch (error) {
        console.log('Could not edit existing calendar message, will create new one:', error.message);
      }
    }
    
    // Fallback: delete old and send new
    if (calendarSettings.calendarMessageId) {
      try {
        const oldMessage = await channel.messages.fetch(calendarSettings.calendarMessageId);
        if (oldMessage) await oldMessage.delete();
      } catch (error) {
        console.log('Could not delete old calendar message:', error.message);
      }
    }
    
    const newMessage = await channel.send({ embeds: [calendarEmbed] });
    
    // Update settings with new message ID
    await updateCalendarSettings(guild.id, {
      ...calendarSettings,
      calendarMessageId: newMessage.id,
      lastUpdated: Date.now()
    });
    
  } catch (error) {
    console.error('Error updating calendar display:', error);
  }
}

// Helper function to generate calendar embed
function generateCalendarEmbed(monday, events, guildTimezone) {
  const moment = require('moment-timezone');
  const { EmbedBuilder } = require("discord.js");
  
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const embed = new EmbedBuilder()
    .setTitle("📅 Roleplay Calendar")
    .setColor(0x5865F2)
    .setDescription(`**Week of ${monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}**`)
    .setTimestamp()
    .setFooter({ text: "Times shown in your local timezone • Use /rpset to add events" });
  
  days.forEach((dayName, index) => {
    // Create day boundaries in guild timezone
    const dayStart = moment.tz(monday, guildTimezone).add(index, 'days').startOf('day');
    const dayEnd = dayStart.clone().endOf('day');
    const dateString = dayStart.format('YYYY-MM-DD');
    
    // Get events for this day using proper timezone-aware filtering
    const dayEvents = events.filter(event => {
      if (event.utcTimestamp) {
        // Compare UTC timestamps with day boundaries
        const dayStartUTC = dayStart.utc().unix();
        const dayEndUTC = dayEnd.utc().unix();
        return event.utcTimestamp >= dayStartUTC && event.utcTimestamp <= dayEndUTC;
      } else {
        // Fallback for legacy events - compare date strings
        return event.date === dateString;
      }
    });
    
    let fieldValue = `📅 ${dayStart.format('MMM D')}\n`;
    
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
          timeDisplay = formatDisplayTime(event.time || event.inputTime || "00:00");
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