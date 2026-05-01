const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Settings, Orders, Users } = require('../../lib/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstatus')
    .setDescription('Check the AKMSMP Minecraft server status and shop stats'),

  async execute(interaction) {
    const serverName = Settings.get('serverName') || 'AKMSMP';
    const playerCount = Settings.get('mcPlayerCount') || '0';
    const playerUpdated = Settings.get('mcPlayerCountUpdated') || '';

    const allOrders = Orders.all();
    const totalPaid = allOrders.filter(o => o.status === 'paid').length;
    const totalRedeemed = allOrders.filter(o => o.used === 'true').length;
    const pending = allOrders.filter(o => o.status === 'processing').length;
    const totalUsers = Users.all().length;

    const lastSeen = playerUpdated
      ? `<t:${Math.floor(Number(playerUpdated) / 1000)}:R>`
      : 'Unknown';

    const embed = new EmbedBuilder()
      .setTitle(`🟢 ${serverName} — Server Status`)
      .setColor(0x57F287)
      .addFields(
        { name: '🎮 Players Online', value: `**${playerCount}**\n(Last updated: ${lastSeen})`, inline: true },
        { name: '🛒 Shop Stats', value: `**${totalUsers}** accounts\n**${totalPaid}** approved orders\n**${totalRedeemed}** codes redeemed`, inline: true },
        { name: '⏳ Pending Approval', value: `**${pending}** order(s)`, inline: true },
      )
      .setFooter({ text: 'Player count updated by Minecraft server every minute' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
