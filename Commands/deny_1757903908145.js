const { SlashCommandBuilder } = require("discord.js");
const { getPendingRequests, removePendingRequest, getFactionLeaders } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("deny")
    .setDescription("Deny a user's faction request")
    .addUserOption(option => option.setName("user").setDescription("User to deny").setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    const member = await interaction.guild.members.fetch(interaction.user.id);

    // Check if user is a faction leader
    const factionLeaders = await getFactionLeaders();
    const leaderFactions = Object.entries(factionLeaders || {}).filter(
      ([faction, leaderRoleId]) => member.roles.cache.has(leaderRoleId)
    ).map(([faction]) => faction);

    if (leaderFactions.length === 0) {
      return interaction.reply({ content: "❌ You are not authorized to deny faction requests.", ephemeral: true });
    }

    try {
      // Get pending requests from database
      const pendingRequests = await getPendingRequests();
      
      if (!pendingRequests || !pendingRequests[target.id]) {
        return interaction.reply({ content: "❌ This user has no pending requests.", ephemeral: true });
      }

      const requestedFaction = pendingRequests[target.id];

      // Make sure the leader can only deny their own faction requests
      if (!leaderFactions.includes(requestedFaction)) {
        return interaction.reply({ content: "❌ You can only deny requests for your own faction.", ephemeral: true });
      }

      // Remove pending request from database
      await removePendingRequest(target.id);

      await interaction.reply({ content: `❌ Denied <@${target.id}> from joining **${requestedFaction.replace("_", " ")}**.`, ephemeral: true });
      
    } catch (error) {
      console.error('❌ Error processing deny request:', error);
      return interaction.reply({ 
        content: "❌ Error processing request. Please try again.", 
        ephemeral: true 
      });
    }
  },
};
