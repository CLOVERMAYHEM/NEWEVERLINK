const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setwarnchannel')
    .setDescription('Sets the channel for invite link warnings.')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send warnings to.')
        .addChannelTypes(ChannelType.GuildText) // Restrict to text channels
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Only allow server managers to use this command

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guild.id;

    // Get current guild settings
    const currentSettings = await getGuildSettings(guildId);
    
    // Update guild settings with the new warn channel
    const updatedSettings = {
      ...currentSettings,
      warnChannelId: channel.id
    };
    
    await updateGuildSettings(guildId, updatedSettings);

    await interaction.reply({
      content: `✅ Warning channel set to ${channel}!`,
      ephemeral: true,
    });
  },
};
