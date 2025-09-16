const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getCalendarSettings, updateCalendarSettings } = require('../db.js');
const { isUserBotAdmin } = require('./stick');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setcalendarchannel")
    .setDescription("Set the channel where the roleplay calendar will be displayed")
    .addChannelOption(option => 
      option.setName("channel")
        .setDescription("The channel to display the RP calendar in")
        .setRequired(true)),
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

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guild.id;
    
    // Check if it's a text channel
    if (channel.type !== 0) {
      return interaction.reply({ 
        content: "❌ Please select a text channel!", 
        ephemeral: true
      });
    }
    
    try {
      // Get current calendar settings
      const currentSettings = await getCalendarSettings(guildId);
      
      // Update calendar settings with the new channel
      const updatedSettings = {
        ...currentSettings,
        calendarChannelId: channel.id,
        calendarMessageId: null, // Reset message ID when changing channel
        lastUpdated: Date.now()
      };
      
      await updateCalendarSettings(guildId, updatedSettings);
      
      await interaction.reply({ 
        content: `✅ The roleplay calendar will now be displayed in ${channel}! Use \`/rpset\` to add events to the calendar.`, 
        ephemeral: true
      });
      
    } catch (error) {
      console.error('❌ Error updating calendar channel settings:', error);
      return interaction.reply({ 
        content: "❌ Error updating settings. Please try again.", 
        ephemeral: true
      });
    }
  },
};