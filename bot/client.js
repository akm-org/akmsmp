const { Client, GatewayIntentBits, Partials } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // Required for basic server interaction
    GatewayIntentBits.GuildMessages,    // REQUIRED to see messages in server channels
    GatewayIntentBits.DirectMessages,   // For DM flows
    GatewayIntentBits.MessageContent,   // REQUIRED to read the "!deploy" text
  ],
  partials: [Partials.Channel, Partials.Message], 
});

module.exports = client;
