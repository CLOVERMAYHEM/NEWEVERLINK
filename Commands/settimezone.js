const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserTimezone, setUserTimezone } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("settimezone")
    .setDescription("Set your timezone for calendar events")
    .addStringOption(option =>
      option.setName("timezone")
        .setDescription("Your timezone (e.g., America/New_York, Europe/London, Asia/Tokyo)")
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
  async execute(interaction) {
    const timezone = interaction.options.getString("timezone");
    const userId = interaction.user.id;
    
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
      
      // Save user timezone to database
      await setUserTimezone(userId, timezone);
      
      // Get current time in user's timezone for confirmation
      const now = new Date();
      const userTime = now.toLocaleString("en-US", {
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
        .setTitle("⏰ Timezone Updated!")
        .setColor(0x00ff00)
        .setDescription(`Your timezone has been set to **${timezone}**`)
        .addFields(
          { name: "🕐 Current Time in Your Timezone", value: userTime, inline: false },
          { name: "📅 Calendar Display", value: "All event times in the roleplay calendar will now be shown in your local timezone!", inline: false }
        )
        .setFooter({ text: "You can change your timezone anytime using /settimezone" })
        .setTimestamp();
      
      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
      
    } catch (error) {
      console.error('❌ Error setting user timezone:', error);
      return interaction.reply({
        content: "❌ Error setting your timezone. Please try again.",
        ephemeral: true
      });
    }
  },
};