const { Events, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');
const client = require('./client');
const { tryResolve } = require('./dmFlow');
const { deployCommands } = require('./deploy');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1499610921792962672';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
  console.log('[bot] DISCORD_BOT_TOKEN not set — bot disabled.');
  module.exports = client;
  return;
}

// Load all commands
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data) commands.set(cmd.data.name, cmd);
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 1. Handle !deploy command to create the permanent shop message
  if (message.guild && message.content.toLowerCase() === '!deploy') {
    if (!message.member.permissions.has('Administrator')) return;

    const shopEmbed = new EmbedBuilder()
      .setTitle('🛒 AKMSMP Quick Shop')
      .setDescription('Select a bundle below to generate a magic code instantly!')
      .setColor(0xFFD700)
      .setFooter({ text: 'Type /redeem [code] in-game to claim.' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('trigger_shop')
          .setLabel('Buy AKM Dollars')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💵')
      );

    await message.channel.send({ embeds: [shopEmbed], components: [row] });
    await message.delete(); // Clean up trigger message
    return;
  }

  // 2. Forward DM replies to pending flows
  if (!message.guild) {
    tryResolve(message.author.id, message.content);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const buyCommand = commands.get('buy');

    // --- Slash commands ---
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
      await cmd.execute(interaction);
      return;
    }

    // --- Button presses ---
    if (interaction.isButton()) {
      const { customId } = interaction;

      // Link !deploy button to the buy flow
      if (customId === 'trigger_shop') {
        if (buyCommand) await buyCommand.execute(interaction);
        return;
      }

      if (customId.startsWith('approve_')) {
        const orderId = customId.replace('approve_', '');
        const showOrders = commands.get('showorders');
        if (showOrders) await showOrders.handleApprove(interaction, orderId);
        return;
      }

      if (customId.startsWith('reject_')) {
        const orderId = customId.replace('reject_', '');
        const showOrders = commands.get('showorders');
        if (showOrders) await showOrders.handleReject(interaction, orderId);
        return;
      }

      if (customId.startsWith('utr_') && !customId.startsWith('utr_modal_')) {
        if (buyCommand) await buyCommand.handleUtrButton(interaction);
        return;
      }
    }

    // --- Modal submits ---
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('utr_modal_')) {
        if (buyCommand) await buyCommand.handleUtrModal(interaction);
        return;
      }
    }

  } catch (err) {
    console.error('[bot] Interaction error:', err);
  }
});

// Presence & Startup logic...
client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Logged in as ${c.user.tag}`);
  await deployCommands(TOKEN, CLIENT_ID, GUILD_ID);
});

client.login(TOKEN);
