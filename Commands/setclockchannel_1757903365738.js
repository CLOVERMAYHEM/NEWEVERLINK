const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setclockchannel")
    .setDescription("Set the channel where voice time tracking messages are sent")
    .addChannelOption(option => 
      option.setName("channel")
        .setDescription("The channel to send clock-in/out messages to")
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
    
    // Get current guild settings
    const currentSettings = await getGuildSettings(guildId);
    
    // Update guild settings with the new clock-in channel
    const updatedSettings = {
      ...currentSettings,
      clockInChannelId: channel.id
    };
    
    await updateGuildSettings(guildId, updatedSettings);
    
    await interaction.reply({ 
      content: `✅ Voice time tracking messages will now be sent to ${channel}!`, 
      ephemeral: true 
    });
  },
};