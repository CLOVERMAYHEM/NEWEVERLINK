const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { 
  getCalendarSettings, 
  getCalendarEvents 
} = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rplist")
    .setDescription("List all roleplay events with their IDs for editing/deleting"),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    
    try {
      // Get calendar settings to check if calendar is set up
      const calendarSettings = await getCalendarSettings(guildId);
      
      if (!calendarSettings.calendarChannelId) {
        return interaction.reply({
          content: "❌ No calendar is set up for this server! An admin needs to use `/setcalendarchannel` first.",
          ephemeral: true
        });
      }
      
      // Get all events
      const events = await getCalendarEvents(guildId);
      
      if (events.length === 0) {
        return interaction.reply({
          content: "📅 No events found! Use `/rpset` to add events to the calendar.",
          ephemeral: true
        });
      }
      
      // Sort events by date and time
      events.sort((a, b) => {
        // First sort by date
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        
        // Then by time (UTC timestamp if available, fallback to time string)
        if (a.utcTimestamp && b.utcTimestamp) {
          return a.utcTimestamp - b.utcTimestamp;
        }
        return (a.time || a.inputTime || "").localeCompare(b.time || b.inputTime || "");
      });
      
      // Create embed with event list
      const listEmbed = new EmbedBuilder()
        .setTitle("📅 Roleplay Events List")
        .setColor(0x5865F2)
        .setDescription("Use the Event ID with `/rpedit` or `/rpdelete` commands")
        .setTimestamp()
        .setFooter({ text: `Total events: ${events.length}` });
      
      // Split events into chunks to avoid embed field limits
      const maxFieldsPerEmbed = 25;
      const eventChunks = [];
      for (let i = 0; i < events.length; i += maxFieldsPerEmbed) {
        eventChunks.push(events.slice(i, i + maxFieldsPerEmbed));
      }
      
      // Add events to embed (first chunk only, warn if more exist)
      const eventsToShow = eventChunks[0];
      
      eventsToShow.forEach((event, index) => {
        // Format time display
        let timeDisplay;
        if (event.utcTimestamp) {
          timeDisplay = `<t:${event.utcTimestamp}:t>`;
        } else {
          timeDisplay = formatDisplayTime(event.time || event.inputTime || "00:00");
        }
        
        // Format date display
        const eventDate = new Date(event.date);
        const dateDisplay = eventDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        });
        
        const fieldName = `${event.title}`;
        let fieldValue = `**ID:** \`${event.id}\`\n`;
        fieldValue += `**Date:** ${dateDisplay}\n`;
        fieldValue += `**Time:** ${timeDisplay}\n`;
        fieldValue += `**Day:** ${event.day.charAt(0).toUpperCase() + event.day.slice(1)}\n`;
        if (event.description) {
          fieldValue += `**Description:** ${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}\n`;
        }
        fieldValue += `**Author:** <@${event.author}>`;
        
        listEmbed.addFields({
          name: fieldName,
          value: fieldValue,
          inline: false
        });
      });
      
      // Warn if there are more events than shown
      if (eventChunks.length > 1) {
        listEmbed.setDescription(
          `Use the Event ID with \`/rpedit\` or \`/rpdelete\` commands\n\n⚠️ **Note:** Showing first ${maxFieldsPerEmbed} events. Total events: ${events.length}`
        );
      }
      
      await interaction.reply({ embeds: [listEmbed], ephemeral: true });
      
    } catch (error) {
      console.error('❌ Error listing RP events:', error);
      return interaction.reply({
        content: "❌ Error loading events list. Please try again.",
        ephemeral: true
      });
    }
  },
};

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