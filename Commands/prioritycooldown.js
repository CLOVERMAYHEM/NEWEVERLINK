const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getPrioritySettings, updatePrioritySettings, setPriorityCooldown, clearPriorityCooldown } = require('../db');
const { updatePriorityTrackerMessageByGuild, formatDuration } = require('./setprioritytracker');
const { isUserBotAdmin } = require('./stick');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prioritycooldown")
    .setDescription("Manage priority cooldown settings (Admin only)")
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("Start a priority cooldown")
        .addIntegerOption(option =>
          option.setName("duration")
            .setDescription("Cooldown duration in minutes")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080))) // Max 7 days
    .addSubcommand(subcommand =>
      subcommand
        .setName("clear")
        .setDescription("Clear the current priority cooldown"))
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Check current priority cooldown status"))
    .addSubcommand(subcommand =>
      subcommand
        .setName("setdefault")
        .setDescription("Set the default cooldown duration")
        .addIntegerOption(option =>
          option.setName("duration")
            .setDescription("Default cooldown duration in minutes")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080))) // Max 7 days
    .addSubcommand(subcommand =>
      subcommand
        .setName("activate")
        .setDescription("Activate priority status"))
    .addSubcommand(subcommand =>
      subcommand
        .setName("deactivate")
        .setDescription("Deactivate priority status")),
    // No default permissions - rely on runtime check for administrators or botadmins
  
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const subcommand = interaction.options.getSubcommand();
    
    // Check if user has admin permissions (Discord admin or bot admin)
    const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
    const isBotAdmin = await isUserBotAdmin(interaction.member);
    
    if (!hasDiscordPerm && !isBotAdmin) {
      return interaction.reply({ 
        content: "❌ You need 'Manage Channels' permission or be a bot administrator to use this command!", 
        ephemeral: true 
      });
    }

    try {
      const currentSettings = await getPrioritySettings(guildId);
      
      switch (subcommand) {
        case "start":
          await handleStartCooldown(interaction, guildId, currentSettings);
          break;
        case "clear":
          await handleClearCooldown(interaction, guildId, currentSettings);
          break;
        case "status":
          await handleStatusCheck(interaction, currentSettings);
          break;
        case "setdefault":
          await handleSetDefault(interaction, guildId, currentSettings);
          break;
        case "activate":
          await handleActivatePriority(interaction, guildId, currentSettings);
          break;
        case "deactivate":
          await handleDeactivatePriority(interaction, guildId, currentSettings);
          break;
      }
      
      // Update the priority tracker message after any changes
      if (subcommand !== "status") {
        await updatePriorityTrackerMessageByGuild(interaction.guild);
      }
      
    } catch (error) {
      console.error("Error managing priority cooldown:", error);
      await interaction.reply({ 
        content: "❌ An error occurred while managing the priority cooldown.", 
        ephemeral: true 
      });
    }
  },
};

async function handleStartCooldown(interaction, guildId, settings) {
  const durationMinutes = interaction.options.getInteger("duration");
  const durationMs = durationMinutes * 60 * 1000;
  
  // Check if cooldown is already active
  if (settings.cooldownActive && settings.cooldownEndTime > Date.now()) {
    const remainingMs = settings.cooldownEndTime - Date.now();
    const remainingTime = formatDuration(remainingMs);
    
    return interaction.reply({
      content: `❌ Priority cooldown is already active! Time remaining: **${remainingTime}**\nUse \`/prioritycooldown clear\` to remove it first.`,
      ephemeral: true
    });
  }
  
  const endTime = await setPriorityCooldown(guildId, durationMs);
  const endTimestamp = Math.floor(endTime / 1000);
  
  const embed = new EmbedBuilder()
    .setTitle("⏰ Priority Cooldown Started")
    .setColor(0xff8800)
    .setDescription(`Priority cooldown has been activated for **${durationMinutes} minutes**`)
    .addFields(
      { name: "⏱️ Duration", value: formatDuration(durationMs), inline: true },
      { name: "🏁 Ends At", value: `<t:${endTimestamp}:F>`, inline: true },
      { name: "⏲️ Ends In", value: `<t:${endTimestamp}:R>`, inline: true },
      { name: "👤 Started by", value: `${interaction.user}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Priority Tracker System" });

  await interaction.reply({ embeds: [embed] });
}

async function handleClearCooldown(interaction, guildId, settings) {
  if (!settings.cooldownActive) {
    return interaction.reply({
      content: "❌ No priority cooldown is currently active.",
      ephemeral: true
    });
  }
  
  await clearPriorityCooldown(guildId);
  
  const embed = new EmbedBuilder()
    .setTitle("✅ Priority Cooldown Cleared")
    .setColor(0x00ff00)
    .setDescription("Priority cooldown has been cleared and is no longer active")
    .addFields(
      { name: "👤 Cleared by", value: `${interaction.user}`, inline: true },
      { name: "📅 Cleared at", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Priority Tracker System" });

  await interaction.reply({ embeds: [embed] });
}

async function handleStatusCheck(interaction, settings) {
  const currentTime = Date.now();
  let status = "🟢 No Cooldown Active";
  let timeRemaining = "N/A";
  let statusColor = 0x00ff00;
  
  if (settings.cooldownActive && settings.cooldownEndTime > currentTime) {
    const remainingMs = settings.cooldownEndTime - currentTime;
    timeRemaining = formatDuration(remainingMs);
    status = "🔴 Cooldown Active";
    statusColor = 0xff0000;
  } else if (settings.cooldownActive && settings.cooldownEndTime <= currentTime) {
    status = "🟡 Cooldown Expired (Ready to Clear)";
    timeRemaining = "0s (Expired)";
    statusColor = 0xffff00;
  }
  
  const embed = new EmbedBuilder()
    .setTitle("📊 Priority Cooldown Status")
    .setColor(statusColor)
    .setDescription("Current priority cooldown information")
    .addFields(
      { name: "🔄 Status", value: status, inline: true },
      { name: "⏱️ Time Remaining", value: timeRemaining, inline: true },
      { name: "⚙️ Default Duration", value: formatDuration(settings.cooldownDuration), inline: true }
    );
  
  if (settings.cooldownActive && settings.cooldownEndTime) {
    const endTimestamp = Math.floor(settings.cooldownEndTime / 1000);
    embed.addFields(
      { name: "🏁 End Time", value: `<t:${endTimestamp}:F>`, inline: true }
    );
  }
  
  embed.setTimestamp()
    .setFooter({ text: "Priority Tracker System" });

  await interaction.reply({ embeds: [embed] });
}

async function handleSetDefault(interaction, guildId, settings) {
  const durationMinutes = interaction.options.getInteger("duration");
  const durationMs = durationMinutes * 60 * 1000;
  
  const updatedSettings = {
    ...settings,
    cooldownDuration: durationMs,
    lastUpdated: Date.now()
  };
  
  await updatePrioritySettings(guildId, updatedSettings);
  
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Default Cooldown Duration Updated")
    .setColor(0x3498db)
    .setDescription(`Default priority cooldown duration has been set to **${durationMinutes} minutes**`)
    .addFields(
      { name: "⏱️ New Default", value: formatDuration(durationMs), inline: true },
      { name: "👤 Set by", value: `${interaction.user}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Priority Tracker System" });

  await interaction.reply({ embeds: [embed] });
}

async function handleActivatePriority(interaction, guildId, settings) {
  if (settings.priorityActive) {
    return interaction.reply({
      content: "❌ Priority is already active!",
      ephemeral: true
    });
  }
  
  const updatedSettings = {
    ...settings,
    priorityActive: true,
    lastUpdated: Date.now()
  };
  
  await updatePrioritySettings(guildId, updatedSettings);
  
  const embed = new EmbedBuilder()
    .setTitle("🔴 Priority Activated")
    .setColor(0xff0000)
    .setDescription("Priority status has been activated")
    .addFields(
      { name: "👤 Activated by", value: `${interaction.user}`, inline: true },
      { name: "📅 Activated at", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Priority Tracker System" });

  await interaction.reply({ embeds: [embed] });
}

async function handleDeactivatePriority(interaction, guildId, settings) {
  if (!settings.priorityActive) {
    return interaction.reply({
      content: "❌ Priority is already inactive!",
      ephemeral: true
    });
  }
  
  const updatedSettings = {
    ...settings,
    priorityActive: false,
    lastUpdated: Date.now()
  };
  
  await updatePrioritySettings(guildId, updatedSettings);
  
  const embed = new EmbedBuilder()
    .setTitle("🟢 Priority Deactivated")
    .setColor(0x00ff00)
    .setDescription("Priority status has been deactivated")
    .addFields(
      { name: "👤 Deactivated by", value: `${interaction.user}`, inline: true },
      { name: "📅 Deactivated at", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Priority Tracker System" });

  await interaction.reply({ embeds: [embed] });
}

