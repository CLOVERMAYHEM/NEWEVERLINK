const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { getGuildTimezone, setGuildTimezone } = require('../db.js');
const { isUserBotAdmin } = require('./stick');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setguildtimezone")
    .setDescription("Set the default timezone for this server's calendar events")
    .addStringOption(option =>
      option.setName("timezone")
        .setDescription("Server timezone for calendar events")
        .setRequired(true)
        .addChoices(
          { name: "🇺🇸 Eastern (EST/EDT) - New York", value: "America/New_York" },
          { name: "🇺🇸 Central (CST/CDT) - Chicago", value: "America/Chicago" },
          { name: "🇺🇸 Mountain (MST/MDT) - Denver", value: "America/Denver" },
          { name: "🇺🇸 Pacific (PST/PDT) - Los Angeles", value: "America/Los_Angeles" },
          { name: "🇬🇧 UK (GMT/BST) - London", value: "Europe/London" },
          { name: "🇩🇪 Central Europe (CET/CEST) - Berlin", value: "Europe/Berlin" },
          { name: "🇫🇷 France (CET/CEST) - Paris", value: "Europe/Paris" },
          { name: "🇯🇵 Japan (JST) - Tokyo", value: "Asia/Tokyo" },
          { name: "🇦🇺 Australia (AEST/AEDT) - Sydney", value: "Australia/Sydney" },
          { name: "🇨🇦 Eastern Canada - Toronto", value: "America/Toronto" },
          { name: "🌍 UTC (Coordinated Universal Time)", value: "UTC" }
        )),
    // No default permissions - rely on runtime check for administrators or botadmins
  async execute(interaction) {
    // Check if user has admin permissions (Discord admin or bot admin)
    const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const isBotAdmin = await isUserBotAdmin(interaction.member);
    
    if (!hasDiscordPerm && !isBotAdmin) {
      return interaction.reply({ 
        content: "❌ You need 'Administrator' permission or be a bot administrator to use this command!", 
        ephemeral: true 
      });
    }

    const timezone = interaction.options.getString("timezone");
    const guildId = interaction.guild.id;
    
    try {
      // Validate timezone by trying to create a date with it
      const testDate = new Date();
      try {
        testDate.toLocaleString("en-US", { timeZone: timezone });
      } catch (error) {
        return interaction.reply({
          content: "❌ Invalid timezone! Please select one from the provided options.",
          ephemeral: true
        });
      }
      
      // Save guild timezone to database
      await setGuildTimezone(guildId, timezone);
      
      // Get current time in guild timezone for confirmation
      const now = new Date();
      const guildTime = now.toLocaleString("en-US", {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      
      const confirmEmbed = new EmbedBuilder()
        .setTitle("🌍 Guild Timezone Updated!")
        .setColor(0x00ff00)
        .setDescription(`This server's default timezone has been set to **${timezone}**`)
        .addFields(
          { name: "🕐 Current Server Time", value: guildTime, inline: false },
          { name: "📅 Event Creation", value: "When admins create events with `/rpset`, times will be interpreted in this timezone and converted to UTC for storage.", inline: false },
          { name: "👥 User Display", value: "Each user will still see event times in their own timezone (set with `/settimezone`), but this sets the default for event creation.", inline: false }
        )
        .setFooter({ text: "Admins can change this anytime using /setguildtimezone" })
        .setTimestamp();
      
      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
      
    } catch (error) {
      console.error('❌ Error setting guild timezone:', error);
      return interaction.reply({
        content: "❌ Error setting server timezone. Please try again.",
        ephemeral: true
      });
    }
  },
};