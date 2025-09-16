const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("Set the channel where faction join requests are sent")
    .addChannelOption(option => 
      option.setName("channel")
        .setDescription("The channel to send notifications to")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
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
      // Get current guild settings
      const currentSettings = await getGuildSettings(guildId);
      
      // Update guild settings with the new notification channel
      const updatedSettings = {
        ...currentSettings,
        notificationChannelId: channel.id
      };
      
      await updateGuildSettings(guildId, updatedSettings);
      
      await interaction.reply({ 
        content: `✅ Faction join requests will now be sent to ${channel}!`, 
        ephemeral: true 
      });
      
    } catch (error) {
      console.error('❌ Error updating channel settings:', error);
      return interaction.reply({ 
        content: "❌ Error updating settings. Please try again.", 
        ephemeral: true 
      });
    }
  },
};