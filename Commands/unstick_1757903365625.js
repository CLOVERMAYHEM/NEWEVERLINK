const { SlashCommandBuilder } = require("discord.js");
const { isUserBotAdmin } = require('./stick.js');
const { getStickyMessages, removeStickyMessage } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unstick")
    .setDescription("Remove sticky message from a channel")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel to remove sticky message from (default: current)")
        .setRequired(false)),
  async execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    
    // Check if user is bot admin
    if (!await isUserBotAdmin(interaction.member)) {
      return interaction.reply({ 
        content: "❌ Only bot administrators can remove sticky messages!", 
        ephemeral: true 
      });
    }
    
    try {
      // Get sticky messages from database
      const stickyMessages = await getStickyMessages();
      
      if (!stickyMessages || !stickyMessages[targetChannel.id]) {
        return interaction.reply({ 
          content: "❌ No sticky message found in that channel!", 
          ephemeral: true 
        });
      }
      
      // Try to delete the Discord message (but don't fail if it's already gone)
      const stickyData = stickyMessages[targetChannel.id];
      let messageDeleted = false;
      try {
        const message = await targetChannel.messages.fetch(stickyData.messageId);
        await message.delete();
        messageDeleted = true;
        console.log(`✅ Deleted sticky message from Discord in ${targetChannel.name}`);
      } catch (error) {
        console.log(`⚠️ Could not delete sticky message from Discord (may already be deleted): ${error.message}`);
      }
      
      // Always remove from database regardless of Discord message deletion
      await removeStickyMessage(targetChannel.id);
      console.log(`✅ Removed sticky message from database for ${targetChannel.name}`);
      
      // Clear message counter for this channel
      if (global.messageCounters) {
        delete global.messageCounters[targetChannel.id];
      }
      
      // Provide feedback based on what happened
      const feedbackMessage = messageDeleted 
        ? `✅ Sticky message removed from ${targetChannel}!`
        : `✅ Sticky message record removed from ${targetChannel}! (Discord message was already deleted)`;
      
      await interaction.reply({ 
        content: feedbackMessage, 
        ephemeral: true 
      });
      
    } catch (error) {
      console.error("❌ Error removing sticky message:", error);
      await interaction.reply({ 
        content: "❌ Failed to remove sticky message from database!", 
        ephemeral: true 
      });
    }
  },
};