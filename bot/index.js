const { Events, ActivityType } = require('discord.js');
const path = require('path');
const fs = require('fs');
const client = require('./client');
const { tryResolve } = require('./dmFlow');
const { deployCommands } = require('./deploy');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1499610921792962672';
const GUILD_ID = process.env.DISCORD_GUILD_ID; // optional: instant registration

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

// Forward DM replies to pending flows
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  if (message.guild) return; // only DMs
  tryResolve(message.author.id, message.content);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
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
        const buy = commands.get('buy');
        if (buy) await buy.handleUtrButton(interaction);
        return;
      }
    }

    // --- Modal submits ---
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('utr_modal_')) {
        const buy = commands.get('buy');
        if (buy) await buy.handleUtrModal(interaction);
        return;
      }
    }

    // --- Select menus (buy command handles its own collector, nothing extra needed) ---

  } catch (err) {
    console.error('[bot] Interaction error:', err);
    const reply = { content: '❌ An error occurred. Try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      interaction.followUp(reply).catch(() => {});
    } else {
      interaction.reply(reply).catch(() => {});
    }
  }
});

const MC_HOST = process.env.MC_HOST || '148.113.2.185';
const MC_PORT = Number(process.env.MC_PORT) || 25565;
const { pingServer } = require('./mcPing');
const { Settings } = require('../lib/db');

async function updatePresence() {
  try {
    const result = await pingServer(MC_HOST, MC_PORT);
    if (result.online) {
      const count = result.players.online;
      const max = result.players.max;
      // Store in DB so /serverstatus and the website can read it
      Settings.set('mcPlayerCount', String(count));
      Settings.set('mcPlayerMax', String(max));
      Settings.set('mcPlayerCountUpdated', String(Date.now()));
      if (result.players.sample?.length) {
        Settings.set('mcPlayerList', result.players.sample.join(','));
      }
      await client.user.setPresence({
        activities: [{ name: `${count}/${max} players online`, type: ActivityType.Watching }],
        status: 'online',
      });
      console.log(`[bot] Presence: ${count}/${max} players online`);
    } else {
      await client.user.setPresence({
        activities: [{ name: 'Server Offline ❌', type: ActivityType.Watching }],
        status: 'idle',
      });
      console.log(`[bot] Server offline: ${result.error}`);
    }
  } catch (err) {
    console.error('[bot] updatePresence error:', err.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Logged in as ${c.user.tag}`);
  await deployCommands(TOKEN, CLIENT_ID, GUILD_ID);
  // Set presence immediately then update every minute
  await updatePresence();
  setInterval(updatePresence, 60_000);
});

client.login(TOKEN).catch(err => console.error('[bot] Login failed:', err.message));

module.exports = client;
