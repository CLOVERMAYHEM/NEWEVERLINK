const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setwelcomechannel")
    .setDescription("Set the channel where welcome messages are sent")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("The channel to send welcome messages to")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guild.id;

    // Validate it's a text channel
    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: "❌ Please provide a valid text channel!",
        ephemeral: true,
      });
    }

    // Check bot permissions
    const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
    const permissions = channel.permissionsFor(botMember);
    if (!permissions.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
      return interaction.reply({
        content: "❌ I don't have permission to send messages in that channel!",
        ephemeral: true,
      });
    }

    // Get current guild settings
    const currentSettings = await getGuildSettings(guildId);
    
    // Update guild settings with the new welcome channel
    const updatedSettings = {
      ...currentSettings,
      welcomeChannelId: channel.id
    };
    
    await updateGuildSettings(guildId, updatedSettings);

    await interaction.reply({
      content: `✅ Welcome messages will now be sent to ${channel}!`,
      ephemeral: true,
    });

    console.log(`✅ Welcome channel set for guild ${interaction.guild.id}: ${channel.name} (${channel.id})`);
  },
};
