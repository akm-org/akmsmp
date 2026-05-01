const { Events, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const client = require('./client');
const { tryResolve } = require('./dmFlow');
const { deployCommands } = require('./deploy');
const { Items } = require('../lib/db'); // Added to fetch items for !deploy

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1499610921792962672';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
  console.log('[bot] DISCORD_BOT_TOKEN not set — bot disabled.');
  module.exports = client;
  return;
}

const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data) commands.set(cmd.data.name, cmd);
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Handle !deploy with Select Menu Options
  if (message.guild && message.content.toLowerCase() === '!deploy') {
    if (!message.member.permissions.has('Administrator')) return;

    const items = Items.visible();
    const shopEmbed = new EmbedBuilder()
      .setTitle('🛒 AKMSMP Quick Shop')
      .setDescription('Select a pack from the menu below to start your purchase!')
      .setColor(0xFFD700)
      .setFooter({ text: 'Type /redeem [code] in-game to claim after purchase.' });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('shop_select_instant')
      .setPlaceholder('Choose a pack to buy...')
      .addOptions(items.map(i => ({
        label: i.name,
        description: `Price: ₹${i.priceInr}`,
        value: i.id,
      })));

    const row = new ActionRowBuilder().addComponents(menu);

    await message.channel.send({ embeds: [shopEmbed], components: [row] });
    await message.delete().catch(() => {}); 
    return;
  }

  if (!message.guild) {
    tryResolve(message.author.id, message.content);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const buyCommand = commands.get('buy');

    // --- Select Menu Handling (From !deploy) ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'shop_select_instant') {
      if (buyCommand) await buyCommand.handleInstantSelect(interaction);
      return;
    }

    // --- Slash commands ---
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
      return;
    }

    // --- Button presses ---
    if (interaction.isButton()) {
      const { customId } = interaction;

      // Handle Link Account redirection
      if (customId === 'start_login_flow') {
        const loginCmd = commands.get('login');
        if (loginCmd) await loginCmd.execute(interaction);
        return;
      }

      if (customId.startsWith('utr_') && !customId.startsWith('utr_modal_')) {
        if (buyCommand) await buyCommand.handleUtrButton(interaction);
        return;
      }
      
      // Admin Approval/Rejection
      const showOrders = commands.get('showorders');
      if (customId.startsWith('approve_')) {
        if (showOrders) await showOrders.handleApprove(interaction, customId.replace('approve_', ''));
      } else if (customId.startsWith('reject_')) {
        if (showOrders) await showOrders.handleReject(interaction, customId.replace('reject_', ''));
      }
    }

    // --- Modal submits ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('utr_modal_')) {
      if (buyCommand) await buyCommand.handleUtrModal(interaction);
    }

  } catch (err) {
    console.error('[bot] Interaction error:', err);
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Logged in as ${c.user.tag}`);
  await deployCommands(TOKEN, CLIENT_ID, GUILD_ID);
});

client.login(TOKEN);
