const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getFactionPoints } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("factionpoints")
    .setDescription("View faction points and achievements"),
  async execute(interaction) {
    const factionData = await getFactionPoints();
    
    // Convert to array and sort by points
    const sortedFactions = Object.entries(factionData)
      .map(([key, data]) => ({
        name: key.replace(/_/g, " "), // Replace ALL underscores with spaces
        key: key,
        ...data
      }))
      .sort((a, b) => b.points - a.points);
    
    const embed = new EmbedBuilder()
      .setTitle("🏆 Faction Points & Achievements")
      .setColor(0xFFD700)
      .setDescription("Compete for faction supremacy!")
      .setTimestamp();
    
    let leaderboardText = "";
    sortedFactions.forEach((faction, index) => {
      const medals = ["🥇", "🥈", "🥉"];
      const medal = medals[index] || "🏅";
      
      // Calculate faction level based on points
      let level = Math.floor(faction.points / 100) + 1;
      let levelEmoji = "⭐";
      if (level >= 10) levelEmoji = "🌟";
      if (level >= 20) levelEmoji = "💫";
      if (level >= 50) levelEmoji = "✨";
      
      leaderboardText += `${medal} **${faction.name}**\n`;
      leaderboardText += `${levelEmoji} Level ${level} • ${faction.points} points\n`;
      leaderboardText += `⚔️ Victories: ${faction.victories} • 📈 Activities: ${faction.activities}\n\n`;
    });
    
    embed.addFields({ 
      name: "🏴 Faction Rankings", 
      value: leaderboardText, 
      inline: false 
    });
    
    // Add point earning info
    embed.addFields({
      name: "📊 How to Earn Points",
      value: `🎯 Voice time: 1 pt/hour\n⚔️ Battle victory: 50 pts\n🏆 Daily #1: 25 pts\n🎲 Command usage: 1 pt\n💬 Activity: 0.5 pts/msg`,
      inline: false
    });
    
    await interaction.reply({ embeds: [embed] });
  },
};