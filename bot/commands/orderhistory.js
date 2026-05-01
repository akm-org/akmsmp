const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Users, Orders } = require('../../lib/db');
const { isAdminUser } = require('../../lib/auth');
const { formatCode } = require('../../lib/codes');

const STATUS_EMOJI = {
  awaiting_utr: '⏳',
  processing:   '🔄',
  paid:         '✅',
  rejected:     '❌',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orderhistory')
    .setDescription('[Admin] View all recent shop orders'),

  async execute(interaction) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser || !isAdminUser(linkedUser)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const orders = Orders.all().slice(0, 25);
    if (!orders.length) return interaction.reply({ content: '📭 No orders yet.', ephemeral: true });

    const users = Object.fromEntries(Users.all().map(u => [u.id, u.email]));

    const embed = new EmbedBuilder()
      .setTitle('📋 Full Order History (Last 25)')
      .setColor(0xEB459E)
      .setFooter({ text: 'Use /adminlookup to filter by email' });

    const chunks = [];
    let current = '';
    for (const o of orders) {
      const s = STATUS_EMOJI[o.status] || '?';
      const code = o.code ? formatCode(o.code) : '—';
      const used = o.used === 'true' ? ' ♻️' : '';
      const line = `${s} \`${o.id.slice(-6)}\` **${users[o.userId] || '?'}** — ${o.itemName} ₹${o.priceInr} ${o.code ? `[\`${code}\`${used}]` : ''}\n`;
      if ((current + line).length > 1000) { chunks.push(current); current = ''; }
      current += line;
    }
    if (current) chunks.push(current);

    embed.setDescription(chunks[0] || '—');
    for (let i = 1; i < chunks.length; i++) embed.addFields({ name: '\u200b', value: chunks[i] });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
