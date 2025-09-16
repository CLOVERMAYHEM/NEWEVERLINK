const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserAchievements, updateUserAchievements, getUserTimes } = require('../db.js');

const ACHIEVEMENTS = {
  "first_hour": { 
    name: "First Hour", 
    description: "Spend your first hour in voice chat", 
    emoji: "🎯", 
    points: 10 
  },
  "marathon": { 
    name: "Marathon Session", 
    description: "Stay in voice for 3+ hours straight", 
    emoji: "🏃", 
    points: 25 
  },
  "dedicated": { 
    name: "Dedicated Member", 
    description: "Accumulate 10+ total hours", 
    emoji: "⭐", 
    points: 50 
  },
  "veteran": { 
    name: "Faction Veteran", 
    description: "Accumulate 50+ total hours", 
    emoji: "🎖️", 
    points: 100 
  },
  "legend": { 
    name: "Living Legend", 
    description: "Accumulate 100+ total hours", 
    emoji: "🏆", 
    points: 200 
  },
  "battle_winner": { 
    name: "Battle Victor", 
    description: "Win your first faction battle", 
    emoji: "⚔️", 
    points: 30 
  },
  "lucky_roller": { 
    name: "Lucky Roller", 
    description: "Roll maximum on dice 3 times", 
    emoji: "🎲", 
    points: 20 
  },
  "social_butterfly": { 
    name: "Social Butterfly", 
    description: "Use 20 different bot commands", 
    emoji: "🦋", 
    points: 40 
  },
  "early_bird": { 
    name: "Early Bird", 
    description: "Be in voice chat at 6 AM", 
    emoji: "🌅", 
    points: 15 
  },
  "night_owl": { 
    name: "Night Owl", 
    description: "Be in voice chat after midnight", 
    emoji: "🦉", 
    points: 15 
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("achievements")
    .setDescription("View your achievements and progress")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("View another user's achievements")
        .setRequired(false)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id);
    
    // Get user time
    const userTimeData = await getUserTimes(targetUser.id);
    const userTime = userTimeData?.totalTime || 0;
    
    // Check for new achievements based on current stats
    await checkAndUnlockAchievements(targetUser.id, userTime);
    
    // Get user achievements (after potentially unlocking new ones)
    const userAchievements = await getUserAchievements(targetUser.id);
    
    // Get user's faction for color
    const factions = [
      "Laughing Meeks",
      "Unicorn Rapists", 
      "Special Activities Directive"
    ];
    
    let userFaction = "None";
    for (const factionName of factions) {
      const role = interaction.guild.roles.cache.find(r => r.name === factionName);
      if (role && member.roles.cache.has(role.id)) {
        userFaction = factionName;
        break;
      }
    }
    
    const factionColors = {
      "Laughing Meeks": 0xFF6B6B,
      "Unicorn Rapists": 0x9B59B6,
      "Special Activities Directive": 0x3498DB,
      "None": 0x95A5A6
    };
    
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${targetUser.username}'s Achievements`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(factionColors[userFaction])
      .setTimestamp();
    
    // Show unlocked achievements
    let unlockedText = "";
    let lockedText = "";
    
    for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
      if (userAchievements.unlocked.includes(key)) {
        unlockedText += `${achievement.emoji} **${achievement.name}**\n`;
        unlockedText += `*${achievement.description}* (+${achievement.points} pts)\n\n`;
      } else {
        lockedText += `🔒 ${achievement.name}\n`;
        lockedText += `*${achievement.description}* (+${achievement.points} pts)\n\n`;
      }
    }
    
    if (unlockedText) {
      embed.addFields({ 
        name: "✅ Unlocked Achievements", 
        value: unlockedText.slice(0, 1024), 
        inline: false 
      });
    }
    
    if (lockedText && unlockedText.length < 800) {
      embed.addFields({ 
        name: "🔒 Locked Achievements", 
        value: lockedText.slice(0, 1024), 
        inline: false 
      });
    }
    
    // Achievement stats
    const totalAchievements = Object.keys(ACHIEVEMENTS).length;
    const unlockedCount = userAchievements.unlocked.length;
    const completionRate = Math.round((unlockedCount / totalAchievements) * 100);
    
    embed.addFields({
      name: "📊 Progress",
      value: `🏆 ${unlockedCount}/${totalAchievements} achievements (${completionRate}%)\n⭐ ${userAchievements.totalPoints} achievement points\n🏴 Faction: ${userFaction}`,
      inline: false
    });
    
    await interaction.reply({ embeds: [embed] });
  },
};

async function checkAndUnlockAchievements(userId, userTime) {
  const userAchievements = await getUserAchievements(userId);
  if (!userAchievements) return;
  const hours = userTime / 3600000;
  
  const toCheck = [
    { key: "first_hour", condition: hours >= 1 },
    { key: "dedicated", condition: hours >= 10 },
    { key: "veteran", condition: hours >= 50 },
    { key: "legend", condition: hours >= 100 }
  ];
  
  let hasNewAchievements = false;
  for (const check of toCheck) {
    if (check.condition && !userAchievements.unlocked.includes(check.key)) {
      userAchievements.unlocked.push(check.key);
      userAchievements.totalPoints += ACHIEVEMENTS[check.key].points;
      hasNewAchievements = true;
    }
  }
  
  if (hasNewAchievements) {
    await updateUserAchievements(userId, userAchievements);
  }
}

module.exports.checkAndUnlockAchievements = checkAndUnlockAchievements;
module.exports.ACHIEVEMENTS = ACHIEVEMENTS;