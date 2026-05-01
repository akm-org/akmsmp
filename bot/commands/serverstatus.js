const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Settings, Orders, Users } = require('../../lib/db');
const { pingServer } = require('../mcPing');

const MC_HOST = process.env.MC_HOST || '148.113.2.185';
const MC_PORT = Number(process.env.MC_PORT) || 25565;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstatus')
    .setDescription('Check the AKMSMP Minecraft server status and shop stats'),

  async execute(interaction) {
    await interaction.deferReply();

    const serverName = Settings.get('serverName') || 'AKMSMP';

    // Query Minecraft server directly (live ping)
    const mc = await pingServer(MC_HOST, MC_PORT, 5000);

    // Shop stats
    const allOrders = Orders.all();
    const totalPaid = allOrders.filter(o => o.status === 'paid').length;
    const totalRedeemed = allOrders.filter(o => o.used === 'true').length;
    const pending = allOrders.filter(o => o.status === 'processing').length;
    const totalUsers = Users.all().length;

    if (mc.online) {
      const players = mc.players;
      const playerList = players.sample?.length
        ? players.sample.map(n => `• ${n}`).join('\n')
        : '_No player names available_';

      const embed = new EmbedBuilder()
        .setTitle(`🟢 ${serverName} — Online`)
        .setColor(0x57F287)
        .addFields(
          { name: '🎮 Players', value: `**${players.online} / ${players.max}**`, inline: true },
          { name: '🌐 IP', value: `\`${MC_HOST}\``, inline: true },
          { name: '📌 Version', value: mc.version || 'Unknown', inline: true },
          { name: '👥 Online Now', value: playerList || '_Server has player privacy enabled_', inline: false },
          { name: '🛒 Shop Stats', value: `**${totalUsers}** accounts · **${totalPaid}** approved · **${totalRedeemed}** redeemed`, inline: false },
          { name: '⏳ Awaiting Approval', value: `**${pending}** order(s)`, inline: true },
        )
        .setFooter({ text: `Live query to ${MC_HOST}:${MC_PORT}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setTitle(`🔴 ${serverName} — Offline / Unreachable`)
        .setColor(0xED4245)
        .setDescription(`Could not connect to \`${MC_HOST}:${MC_PORT}\`\n\`${mc.error}\``)
        .addFields(
          { name: '🛒 Shop Stats', value: `**${totalUsers}** accounts · **${totalPaid}** approved · **${totalRedeemed}** redeemed`, inline: false },
          { name: '⏳ Awaiting Approval', value: `**${pending}** order(s)`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
