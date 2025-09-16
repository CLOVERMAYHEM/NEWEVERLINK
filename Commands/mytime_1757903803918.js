const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserTimes, getGuildSettings } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mytime")
    .setDescription("View your personal voice channel time and statistics")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("View another user's time (optional)")
        .setRequired(false)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id);
    
    // Check if factions are enabled for faction-related features
    const guildSettings = await getGuildSettings(interaction.guild.id);
    const factionsEnabled = guildSettings?.factionsEnabled !== false;
    
    // Get user time data
    let userData = await getUserTimes(targetUser.id);
    if (!userData || userData.totalTime === undefined) {
      userData = {
        totalTime: 0,
        sessions: 0,
        longestSession: 0,
        todayTime: 0,
        lastActive: null
      };
    }
    
    // Calculate times
    const totalHours = Math.floor(userData.totalTime / 3600000);
    const totalMinutes = Math.floor((userData.totalTime % 3600000) / 60000);
    const longestHours = Math.floor(userData.longestSession / 3600000);
    const longestMinutes = Math.floor((userData.longestSession % 3600000) / 60000);
    const todayHours = Math.floor(userData.todayTime / 3600000);
    const todayMinutes = Math.floor((userData.todayTime % 3600000) / 60000);
    
    // Get user's faction (only if factions are enabled)
    let userFaction = "None";
    if (factionsEnabled) {
      const factions = [
        "Laughing Meeks",
        "Unicorn Rapists", 
        "Special Activities Directive"
      ];
      
      for (const factionName of factions) {
        const role = interaction.guild.roles.cache.find(r => r.name === factionName);
        if (role && member.roles.cache.has(role.id)) {
          userFaction = factionName;
          break;
        }
      }
    }
    
    const factionColors = {
      "Laughing Meeks": 0xFF6B6B,
      "Unicorn Rapists": 0x9B59B6,
      "Special Activities Directive": 0x3498DB,
      "None": 0x95A5A6
    };
    
    // Calculate average session time
    const avgSession = userData.sessions > 0 ? userData.totalTime / userData.sessions : 0;
    const avgHours = Math.floor(avgSession / 3600000);
    const avgMinutes = Math.floor((avgSession % 3600000) / 60000);
    
    // Determine activity level
    let activityLevel = "🔸 Casual";
    if (totalHours >= 50) activityLevel = "🔥 Legendary";
    else if (totalHours >= 25) activityLevel = "⭐ Elite";
    else if (totalHours >= 10) activityLevel = "🎯 Active";
    else if (totalHours >= 5) activityLevel = "📈 Regular";
    
    const embed = new EmbedBuilder()
      .setTitle(`⏱️ ${targetUser.username}'s Time Statistics`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(factionColors[userFaction])
      .addFields(
        { name: "📊 Total Voice Time", value: `${totalHours}h ${totalMinutes}m`, inline: true },
        { name: "🎯 Sessions Completed", value: `${userData.sessions}`, inline: true },
        { name: "🏆 Longest Session", value: `${longestHours}h ${longestMinutes}m`, inline: true },
        { name: "📅 Today's Time", value: `${todayHours}h ${todayMinutes}m`, inline: true },
        { name: "📈 Average Session", value: `${avgHours}h ${avgMinutes}m`, inline: true },
        { name: "🔥 Activity Level", value: activityLevel, inline: true },
        { name: "🏴 Faction", value: userFaction, inline: true },
        { name: "🕐 Last Active", value: userData.lastActive ? `<t:${Math.floor(userData.lastActive / 1000)}:R>` : "Never", inline: true }
      )
      .setFooter({ text: `${targetUser.username === interaction.user.username ? "Your" : targetUser.username + "'s"} faction dedication!` })
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },
};
