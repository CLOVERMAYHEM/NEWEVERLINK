const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getBattleData, setBattleData, removeBattleData, getActiveBattles, addActiveBattle, removeActiveBattle, updateBattleParticipants } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("battle")
    .setDescription("Challenge another faction to battle!")
    .addStringOption(option =>
      option.setName("faction")
        .setDescription("Which faction to challenge")
        .setRequired(true)
        .addChoices(
          { name: "Laughing Meeks", value: "Laughing_Meeks" },
          { name: "Unicorn Rapists", value: "Unicorn_Rapists" },
          { name: "Special Activities Directive", value: "Special_Activities_Directive" }
        )),
  async execute(interaction) {
    const targetFaction = interaction.options.getString("faction");
    const member = interaction.member;
    
    // Check if user is in a faction
    const factions = {
      "Laughing_Meeks": "Laughing Meeks",
      "Unicorn_Rapists": "Unicorn Rapists",
      "Special_Activities_Directive": "Special Activities Directive"
    };
    
    let userFaction = null;
    for (const [key, displayName] of Object.entries(factions)) {
      const role = interaction.guild.roles.cache.find(r => r.name === displayName);
      if (role && member.roles.cache.has(role.id)) {
        userFaction = key;
        break;
      }
    }
    
    if (!userFaction) {
      return interaction.reply({ content: "❌ You must be in a faction to start battles!", ephemeral: true });
    }
    
    if (userFaction === targetFaction) {
      return interaction.reply({ content: "❌ You can't battle your own faction!", ephemeral: true });
    }
    
    const battleId = `${userFaction}_vs_${targetFaction}_${Date.now()}`;
    
    const activeBattles = await getActiveBattles();
    if (activeBattles.has(`${userFaction}_${targetFaction}`) || activeBattles.has(`${targetFaction}_${userFaction}`)) {
      return interaction.reply({ content: "❌ These factions are already in battle!", ephemeral: true });
    }
    
    await addActiveBattle(`${userFaction}_${targetFaction}`);
    await setBattleData(battleId, {
      challenger: userFaction,
      target: targetFaction,
      participants: { [userFaction]: [interaction.user.id], [targetFaction]: [] },
      startTime: Date.now(),
      duration: 60000, // 1 minute battle
      active: true
    });
    
    const embed = new EmbedBuilder()
      .setTitle("⚔️ FACTION BATTLE INITIATED!")
      .setColor(0xFF6B6B)
      .setDescription(`**${factions[userFaction]}** has challenged **${factions[targetFaction]}** to battle!\n\n🕐 Battle Duration: 1 minute\n👥 Click the buttons to join your faction in battle!`)
      .addFields(
        { name: `⚔️ ${factions[userFaction]}`, value: "1 warrior ready", inline: true },
        { name: `⚔️ ${factions[targetFaction]}`, value: "0 warriors ready", inline: true }
      )
      .setTimestamp();
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`battle_join_${battleId}_${userFaction}`)
          .setLabel(`Fight for ${factions[userFaction]}!`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji("⚔️"),
        new ButtonBuilder()
          .setCustomId(`battle_join_${battleId}_${targetFaction}`)
          .setLabel(`Fight for ${factions[targetFaction]}!`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji("⚔️")
      );
    
    await interaction.reply({ embeds: [embed], components: [row] });
    
    // End battle after duration  
    setTimeout(async () => {
      const battle = await getBattleData(battleId);
      if (battle && battle.active) {
        endBattle(battleId, interaction);
      }
    }, 60000);
  },
};

async function endBattle(battleId, originalInteraction) {
  const battle = await getBattleData(battleId);
  if (!battle || !battle.active) return;
  
  // Remove from active battles list
  await removeActiveBattle(`${battle.challenger}_${battle.target}`);
  
  const factions = {
    "Laughing_Meeks": "Laughing Meeks",
    "Unicorn_Rapists": "Unicorn Rapists",
    "Special_Activities_Directive": "Special Activities Directive"
  };
  
  const challengerCount = battle.participants[battle.challenger].length;
  const targetCount = battle.participants[battle.target].length;
  
  let winner, loser, winnerCount, loserCount;
  
  if (challengerCount > targetCount) {
    winner = battle.challenger;
    loser = battle.target;
    winnerCount = challengerCount;
    loserCount = targetCount;
  } else if (targetCount > challengerCount) {
    winner = battle.target;
    loser = battle.challenger;
    winnerCount = targetCount;
    loserCount = challengerCount;
  } else {
    // Tie - random winner
    const coinFlip = Math.random() < 0.5;
    winner = coinFlip ? battle.challenger : battle.target;
    loser = coinFlip ? battle.target : battle.challenger;
    winnerCount = challengerCount;
    loserCount = targetCount;
  }
  
  const embed = new EmbedBuilder()
    .setTitle("🏆 BATTLE RESULTS!")
    .setColor(0x00FF00)
    .setDescription(`**${factions[winner]}** emerges victorious!`)
    .addFields(
      { name: `🏆 Winner: ${factions[winner]}`, value: `${winnerCount} warriors`, inline: true },
      { name: `💀 ${factions[loser]}`, value: `${loserCount} warriors`, inline: true }
    )
    .setTimestamp();
  
  if (winnerCount === loserCount) {
    embed.addFields({ name: "⚖️ Result", value: "Tie broken by combat prowess!", inline: false });
  }
  
  originalInteraction.editReply({ embeds: [embed], components: [] });
  
  // Clean up battle data after showing results
  setTimeout(async () => {
    await removeBattleData(battleId);
  }, 10000); // Clean up after 10 seconds
}

// Handle battle join buttons (this would go in your main index.js interaction handler)
module.exports.handleBattleButton = async (interaction) => {
  if (!interaction.customId.startsWith('battle_join_')) return false;
  
  const [, , battleId, faction] = interaction.customId.split('_');
  const battle = await getBattleData(battleId);
  
  if (!battle || !battle.active) {
    return interaction.reply({ content: "❌ This battle has ended!", ephemeral: true });
  }
  
  const member = interaction.member;
  const factions = {
    "Laughing_Meeks": "Laughing Meeks",
    "Unicorn_Rapists": "Unicorn Rapists",
    "Special_Activities_Directive": "Special Activities Directive"
  };
  
  // Check if user is in the faction they're trying to join
  const role = interaction.guild.roles.cache.find(r => r.name === factions[faction]);
  if (!role || !member.roles.cache.has(role.id)) {
    return interaction.reply({ content: "❌ You can only fight for your own faction!", ephemeral: true });
  }
  
  // Check if already joined
  if (battle.participants[faction].includes(interaction.user.id)) {
    return interaction.reply({ content: "❌ You're already in this battle!", ephemeral: true });
  }
  
  await updateBattleParticipants(battleId, faction, interaction.user.id);
  
  // Get updated battle data with new participant
  const updatedBattle = await getBattleData(battleId);
  const challengerCount = updatedBattle.participants[updatedBattle.challenger].length;
  const targetCount = updatedBattle.participants[updatedBattle.target].length;
  
  const embed = new EmbedBuilder()
    .setTitle("⚔️ FACTION BATTLE IN PROGRESS!")
    .setColor(0xFF6B6B)
    .setDescription(`**${factions[updatedBattle.challenger]}** vs **${factions[updatedBattle.target]}**\n\n🕐 Battle ends soon!\n👥 Warriors are joining the fight!`)
    .addFields(
      { name: `⚔️ ${factions[updatedBattle.challenger]}`, value: `${challengerCount} warriors`, inline: true },
      { name: `⚔️ ${factions[updatedBattle.target]}`, value: `${targetCount} warriors`, inline: true }
    )
    .setTimestamp();
  
  await interaction.update({ embeds: [embed] });
  return true;
};