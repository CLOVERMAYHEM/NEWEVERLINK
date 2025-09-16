const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getBotAdmins, addBotAdmin, removeBotAdmin, addBotAdminRole, removeBotAdminRole } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botadmin")
    .setDescription("Manage bot administrators")
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a user as bot administrator")
        .addUserOption(option =>
          option.setName("user")
            .setDescription("User to make bot admin")
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove a user from bot administrators")
        .addUserOption(option =>
          option.setName("user")
            .setDescription("User to remove from bot admins")
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List all bot administrators"))
    .addSubcommand(subcommand =>
      subcommand
        .setName("addrole")
        .setDescription("Add a role as bot administrator")
        .addRoleOption(option =>
          option.setName("role")
            .setDescription("Role to make bot admin")
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("removerole")
        .setDescription("Remove a role from bot administrators")
        .addRoleOption(option =>
          option.setName("role")
            .setDescription("Role to remove from bot admins")
            .setRequired(true))),
  async execute(interaction) {
    // Check if user can manage bot admins (server owner or has Administrator permission)
    if (interaction.guild.ownerId !== interaction.user.id && 
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ 
        content: "❌ Only server administrators can manage bot admins!", 
        ephemeral: true 
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === "add") {
      const user = interaction.options.getUser("user");
      
      const botAdminData = await getBotAdmins();
      const adminUsers = botAdminData.adminUsers || botAdminData.adminIds || [];
      
      if (adminUsers.includes(user.id)) {
        return interaction.reply({ 
          content: `❌ ${user.username} is already a bot administrator!`, 
          ephemeral: true 
        });
      }
      
      await addBotAdmin(user.id);
      
      const embed = new EmbedBuilder()
        .setTitle("✅ Bot Administrator Added")
        .setColor(0x00FF00)
        .setDescription(`**${user.username}** has been granted bot administrator privileges!`)
        .addFields(
          { name: "👤 New Admin", value: `<@${user.id}>`, inline: true },
          { name: "👮 Added by", value: `<@${interaction.user.id}>`, inline: true },
          { name: "🔧 Privileges", value: "• Manage sticky messages\n• Access admin commands\n• Configure bot settings", inline: false }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === "remove") {
      const user = interaction.options.getUser("user");
      
      const botAdminData = await getBotAdmins();
      const adminUsers = botAdminData.adminUsers || botAdminData.adminIds || [];
      
      if (!adminUsers.includes(user.id)) {
        return interaction.reply({ 
          content: `❌ ${user.username} is not a bot administrator!`, 
          ephemeral: true 
        });
      }
      
      await removeBotAdmin(user.id);
      
      const embed = new EmbedBuilder()
        .setTitle("❌ Bot Administrator Removed")
        .setColor(0xFF6B00)
        .setDescription(`**${user.username}** has been removed from bot administrators.`)
        .addFields(
          { name: "👤 Removed Admin", value: `<@${user.id}>`, inline: true },
          { name: "👮 Removed by", value: `<@${interaction.user.id}>`, inline: true }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === "addrole") {
      const role = interaction.options.getRole("role");
      
      const botAdminData = await getBotAdmins();
      const adminRoles = botAdminData.adminRoles || [];
      
      if (adminRoles.includes(role.id)) {
        return interaction.reply({ 
          content: `❌ ${role.name} is already a bot administrator role!`, 
          ephemeral: true 
        });
      }
      
      await addBotAdminRole(role.id);
      
      const embed = new EmbedBuilder()
        .setTitle("✅ Bot Administrator Role Added")
        .setColor(0x00FF00)
        .setDescription(`**${role.name}** has been granted bot administrator privileges!`)
        .addFields(
          { name: "🎭 New Admin Role", value: `<@&${role.id}>`, inline: true },
          { name: "👮 Added by", value: `<@${interaction.user.id}>`, inline: true },
          { name: "🔧 Privileges", value: "• Manage sticky messages\n• Access admin commands\n• Configure bot settings\n• Use priority tracker commands", inline: false }
        )
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === "removerole") {
      const role = interaction.options.getRole("role");
      
      const botAdminData = await getBotAdmins();
      const adminRoles = botAdminData.adminRoles || [];
      
      if (!adminRoles.includes(role.id)) {
        return interaction.reply({ 
          content: `❌ ${role.name} is not a bot administrator role!`, 
          ephemeral: true 
        });
      }
      
      await removeBotAdminRole(role.id);
      
      const embed = new EmbedBuilder()
        .setTitle("❌ Bot Administrator Role Removed")
        .setColor(0xFF6B00)
        .setDescription(`**${role.name}** has been removed from bot administrator roles.`)
        .addFields(
          { name: "🎭 Removed Admin Role", value: `<@&${role.id}>`, inline: true },
          { name: "👮 Removed by", value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === "list") {
      const embed = new EmbedBuilder()
        .setTitle("🔧 Bot Administrators")
        .setColor(0x3498DB)
        .setDescription("Users and roles with bot administration privileges")
        .setTimestamp();
      
      let adminsList = "";
      
      // Server owner is always admin
      const owner = await interaction.guild.fetchOwner();
      adminsList += `👑 **${owner.user.username}** (Server Owner)\n`;
      
      // Members with Administrator permission
      const adminMembers = interaction.guild.members.cache.filter(member => 
        member.permissions.has(PermissionFlagsBits.Administrator) && 
        member.id !== owner.id
      );
      
      for (const [, member] of adminMembers) {
        adminsList += `⚡ **${member.user.username}** (Administrator)\n`;
      }
      
      // Custom bot admins
      const botAdminData = await getBotAdmins();
      const adminUsers = botAdminData.adminUsers || botAdminData.adminIds || [];
      const adminRoles = botAdminData.adminRoles || [];
      
      if (adminUsers.length > 0) {
        adminsList += "\n🤖 **Custom Bot Admin Users:**\n";
        for (const adminId of adminUsers) {
          try {
            const user = await interaction.client.users.fetch(adminId);
            adminsList += `🔧 **${user.username}**\n`;
          } catch (error) {
            adminsList += `🔧 Unknown User (${adminId})\n`;
          }
        }
      }
      
      if (adminRoles.length > 0) {
        adminsList += "\n🎭 **Bot Admin Roles:**\n";
        for (const roleId of adminRoles) {
          try {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
              adminsList += `🔧 **${role.name}**\n`;
            } else {
              adminsList += `🔧 Unknown Role (${roleId})\n`;
            }
          } catch (error) {
            adminsList += `🔧 Unknown Role (${roleId})\n`;
          }
        }
      }
      
      if (!adminsList.trim()) {
        adminsList = "No bot administrators found.";
      }
      
      embed.addFields({
        name: "👥 Current Administrators",
        value: adminsList.slice(0, 1024),
        inline: false
      });
      
      embed.addFields({
        name: "ℹ️ Administrator Privileges",
        value: "• Use `/stick` and `/unstick` commands\n• Manage bot settings\n• Access administrative features\n• Use priority tracker commands\n• Reset faction data",
        inline: false
      });
      
      await interaction.reply({ embeds: [embed] });
    }
  },
};