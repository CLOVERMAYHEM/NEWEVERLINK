const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { 
  getCalendarSettings, 
  getCalendarEvents,
  getGuildTimezone
} = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Debug calendar settings and events (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    
    try {
      // Get calendar settings
      const calendarSettings = await getCalendarSettings(guildId);
      
      // Get guild timezone  
      const guildTimezone = await getGuildTimezone(guildId);
      
      // Get all events
      const events = await getCalendarEvents(guildId);
      
      // Create debug embed
      const debugEmbed = new EmbedBuilder()
        .setTitle("🔧 Calendar Debug Information")
        .setColor(0xFF8C00)
        .addFields(
          { 
            name: "📺 Calendar Channel", 
            value: calendarSettings.calendarChannelId 
              ? `<#${calendarSettings.calendarChannelId}>` 
              : "❌ Not set - use `/setcalendarchannel`", 
            inline: false 
          },
          { 
            name: "🌍 Guild Timezone", 
            value: guildTimezone || "❌ Not set - use `/setguildtimezone`", 
            inline: false 
          },
          { 
            name: "📅 Total Events", 
            value: `${events.length} events in database`, 
            inline: false 
          }
        )
        .setTimestamp();
      
      // Add event details if any exist
      if (events.length > 0) {
        const eventList = events.slice(0, 5).map(event => {
          const date = event.date || "No date";
          const time = event.inputTime || event.time || "No time";
          const title = event.title || "No title";
          return `• ${title} - ${date} at ${time}`;
        }).join('\n');
        
        debugEmbed.addFields({
          name: "🎭 Recent Events",
          value: eventList + (events.length > 5 ? `\n... and ${events.length - 5} more` : ""),
          inline: false
        });
      }
      
      // Add this week's events specifically
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      
      const thisWeekEvents = events.filter(event => {
        if (!event.date) return false;
        const eventDate = new Date(event.date);
        const weekEnd = new Date(monday);
        weekEnd.setDate(monday.getDate() + 6);
        return eventDate >= monday && eventDate <= weekEnd;
      });
      
      debugEmbed.addFields({
        name: "📆 This Week's Events",
        value: thisWeekEvents.length > 0 
          ? thisWeekEvents.map(e => `• ${e.title} on ${e.date}`).join('\n')
          : "No events this week",
        inline: false
      });
      
      await interaction.reply({ embeds: [debugEmbed], ephemeral: true });
      
    } catch (error) {
      console.error('❌ Error in debug command:', error);
      return interaction.reply({
        content: "❌ Error retrieving debug information. Check console logs.",
        ephemeral: true
      });
    }
  },
};