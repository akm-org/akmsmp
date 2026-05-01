const { Events, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');
const client = require('./client');
const { tryResolve } = require('./dmFlow');
const { deployCommands } = require('./deploy');
const { Users, Settings } = require('../lib/db'); //

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1499610921792962672';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
  console.error('[bot] ERROR: DISCORD_BOT_TOKEN is missing!');
  module.exports = client;
  return;
}

const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data) commands.set(cmd.data.name, cmd);
}

// Global Message Listener
client.on(Events.MessageCreate, async (message) => {
  // CRITICAL LOG: If this doesn't show in Render logs, your intents are wrong.
  console.log(`[DEBUG] Message from ${message.author.tag}: "${message.content}"`);

  if (message.author.bot) return;

  // Handle !deploy
  if (message.guild && message.content.trim().toLowerCase() === '!deploy') {
    console.log('[bot] !deploy detected. Checking permissions...');
    
    if (!message.member.permissions.has('Administrator')) {
      console.log(`[bot] !deploy ignored: ${message.author.tag} lacks Administrator perms.`);
      return;
    }

    const shopEmbed = new EmbedBuilder()
      .setTitle('🛒 AKMSMP Quick Shop') //
      .setDescription('Select a bundle to buy AKM Dollars instantly!')
      .setColor(0xFFD700)
      .setFooter({ text: 'Type /redeem [code] in-game to claim.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trigger_10k').setLabel('Buy 10,000 AKM').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trigger_100k').setLabel('Buy 100,000 AKM').setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [shopEmbed], components: [row] });
    console.log('[bot] !deploy message sent successfully.');
    
    try { await message.delete(); } catch (e) { console.log('[bot] Could not delete trigger message (missing perms).'); }
    return;
  }

  if (!message.guild) {
    tryResolve(message.author.id, message.content);
  }
});

// Interaction Listener (Buttons/Commands)
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const buyCommand = commands.get('buy');

    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
    } 

    if (interaction.isButton()) {
      if (interaction.customId === 'trigger_10k' || interaction.customId === 'trigger_100k') {
        const amount = interaction.customId === 'trigger_10k' ? 10000 : 100000;
        if (buyCommand) await buyCommand.execute(interaction, amount);
      } else if (interaction.customId.startsWith('utr_')) {
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
  console.log(`[bot] LOGGED IN AS ${c.user.tag}`);
  await deployCommands(TOKEN, CLIENT_ID, GUILD_ID);
});

client.login(TOKEN).catch(err => console.error('[bot] LOGIN FAILED:', err));

module.exports = client;
