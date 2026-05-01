const { Events, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');
const client = require('./client');
const { tryResolve } = require('./dmFlow');
const { deployCommands } = require('./deploy');
// Corrected path to move up from 'bot' folder to 'lib'
const { Users, Settings } = require('../lib/db'); 

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1499610921792962672';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
  console.log('[bot] DISCORD_BOT_TOKEN not set.');
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
  // DEBUG: Check if bot sees messages at all
  console.log(`[MSG] ${message.author.tag} in ${message.guild?.name || 'DM'}: ${message.content}`);

  if (message.author.bot) return;

  // 1. !deploy logic
  if (message.guild && message.content.trim().toLowerCase() === '!deploy') {
    // Check for Administrator permission
    if (!message.member.permissions.has('Administrator')) {
      console.log(`[bot] !deploy rejected: ${message.author.tag} is not an admin.`);
      return;
    }

    const shopEmbed = new EmbedBuilder()
      .setTitle('🛒 AKMSMP Quick Shop')
      .setDescription('Select a bundle below to start your purchase!')
      .setColor(0xFFD700)
      .setFooter({ text: 'Use /redeem in-game once you get your code.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trigger_10k').setLabel('10,000 AKM').setStyle(ButtonStyle.Success).setEmoji('💵'),
      new ButtonBuilder().setCustomId('trigger_100k').setLabel('100,000 AKM').setStyle(ButtonStyle.Primary).setEmoji('💰')
    );

    await message.channel.send({ embeds: [shopEmbed], components: [row] });
    try { await message.delete(); } catch (e) { console.error("Could not delete trigger message:", e.message); }
    return;
  }

  if (!message.guild) tryResolve(message.author.id, message.content);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const buyCommand = commands.get('buy');

    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
    } 

    if (interaction.isButton()) {
      // Direct buy buttons from !deploy
      if (interaction.customId === 'trigger_10k' || interaction.customId === 'trigger_100k') {
        const amount = interaction.customId === 'trigger_10k' ? 10000 : 100000;
        if (buyCommand) await buyCommand.execute(interaction, amount);
      } 
      // UTR submission button
      else if (interaction.customId.startsWith('utr_')) {
        if (buyCommand) await buyCommand.handleUtrButton(interaction);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('utr_modal_')) {
      if (buyCommand) await buyCommand.handleUtrModal(interaction);
    }
  } catch (err) {
    console.error('[bot] Interaction error:', err);
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Online as ${c.user.tag}`);
  await deployCommands(TOKEN, CLIENT_ID, GUILD_ID);
});

client.login(TOKEN);
module.exports = client;
