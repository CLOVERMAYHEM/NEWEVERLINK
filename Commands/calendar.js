const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const moment = require('moment-timezone');
const { 
  getCalendarSettings, 
  getCalendarEvents, 
  getUserTimezone,
  getGuildTimezone
} = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("calendar")
    .setDescription("View the roleplay calendar in your timezone"),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    
    try {
      // Get calendar settings
      const calendarSettings = await getCalendarSettings(guildId);
      
      if (!calendarSettings.calendarChannelId) {
        return interaction.reply({
          content: "❌ No calendar is set up for this server! An admin needs to use `/setcalendarchannel` first.",
          ephemeral: true
        });
      }
      
      // Get user's timezone
      const userTimezone = await getUserTimezone(userId);
      
      // Get guild timezone and current week's Monday in that timezone
      const guildTimezone = await getGuildTimezone(guildId);
      const nowInGuildTz = moment.tz(guildTimezone);
      const dayOfWeek = nowInGuildTz.day() === 0 ? 7 : nowInGuildTz.day();
      const mondayInGuildTz = nowInGuildTz.clone().subtract(dayOfWeek - 1, 'days').startOf('day');
      const sundayInGuildTz = mondayInGuildTz.clone().add(6, 'days').endOf('day');
      
      // Get events for current week
      const events = await getCalendarEvents(guildId);
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
      
      // Generate calendar embed with user's timezone
      const mondayDate = mondayInGuildTz.toDate();
      const calendarEmbed = generatePersonalizedCalendarEmbed(mondayDate, weekEvents, userTimezone, guildTimezone);
      
      await interaction.reply({ embeds: [calendarEmbed], ephemeral: true });
      
    } catch (error) {
      console.error('❌ Error displaying calendar:', error);
      return interaction.reply({
        content: "❌ Error loading calendar. Please try again.",
        ephemeral: true
      });
    }
  },
};

// Helper function to generate personalized calendar embed
function generatePersonalizedCalendarEmbed(monday, events, userTimezone, guildTimezone) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const embed = new EmbedBuilder()
    .setTitle("📅 Roleplay Calendar")
    .setColor(0x5865F2)
    .setDescription(`**Week of ${monday.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: userTimezone 
    })}**\n⏰ *Times shown in your timezone: ${userTimezone}*`)
    .setTimestamp()
    .setFooter({ text: "Use /settimezone to change your timezone • /rpset to add events (admin only)" });
  
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
        return (a.time || "").localeCompare(b.time || "");
      });
      
      dayEvents.forEach(event => {
        let timeDisplay;
        if (event.utcTimestamp) {
          // Use Discord timestamp for proper timezone display
          timeDisplay = `<t:${event.utcTimestamp}:t>`;
        } else {
          // Fallback for old events without UTC timestamp
          // Reconstruct UTC timestamp from stored guild timezone data
          const eventGuildTz = event.guildTimezone || guildTimezone;
          const eventDateTimeString = `${event.date} ${event.time || event.inputTime || '00:00'}`;
          
          try {
            const eventMoment = moment.tz(eventDateTimeString, 'YYYY-MM-DD HH:mm', eventGuildTz);
            const reconstructedUtcTimestamp = eventMoment.utc().unix();
            timeDisplay = `<t:${reconstructedUtcTimestamp}:t>`;
          } catch (error) {
            // Final fallback - display as stored
            timeDisplay = event.time || event.inputTime || 'Unknown time';
          }
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

// Helper function to get day emoji
function getDayEmoji(dayIndex) {
  const emojis = ["🟦", "🟩", "🟨", "🟧", "🟪", "🟫", "🟥"];
  return emojis[dayIndex] || "📅";
}