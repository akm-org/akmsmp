// Shared Discord.js client
// Required privileged intents (must be enabled in Discord Developer Portal → Bot):
//   ✅ Message Content Intent  — for reading DM replies in /register and /login flows
//
// NOT required (removed to avoid "DisallowedIntents" errors):
//   ❌ Presence Intent    — not needed; setting bot's own presence doesn't require it
//   ❌ Server Members Intent — not needed; we use REST API to fetch users, not gateway events

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // slash commands, guild info
    GatewayIntentBits.DirectMessages,   // DM-based /register and /login flows
    GatewayIntentBits.MessageContent,   // read DM replies (PRIVILEGED — enable in portal)
  ],
  partials: [Partials.Channel, Partials.Message], // required for DM events
});

module.exports = client;
