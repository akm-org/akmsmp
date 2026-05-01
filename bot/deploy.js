// Registers slash commands with Discord. Called once at bot startup.
const { REST, Routes } = require('discord.js');
const path = require('path');
const fs = require('fs');

async function deployCommands(token, clientId, guildId) {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data) commands.push(cmd.data.toJSON());
  }

  const rest = new REST().setToken(token);
  try {
    if (guildId) {
      // Guild-scoped (instant update, good for dev/small servers)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`[bot] Registered ${commands.length} guild commands to guild ${guildId}`);
    } else {
      // Global (takes up to 1h to propagate)
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`[bot] Registered ${commands.length} global commands`);
    }
  } catch (err) {
    console.error('[bot] Failed to register commands:', err.message);
  }
}

module.exports = { deployCommands };
