const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Users, Orders } = require('../../lib/db');
const { isAdminUser } = require('../../lib/auth');
const { formatCode } = require('../../lib/codes');

const STATUS_EMOJI = {
  awaiting_utr: '⏳ Waiting for payment',
  processing:   '🔄 Under review',
  paid:         '✅ Approved',
  rejected:     '❌ Rejected',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your order history (admins see all orders)'),

  async execute(interaction) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser) {
      return interaction.reply({
        content: '❌ Link your account first with `/login` or `/register`.',
        ephemeral: true,
      });
    }

    const admin = isAdminUser(linkedUser);
    const orders = admin
      ? Orders.all().slice(0, 20)
      : Orders.forUser(linkedUser.id).slice(0, 10);

    if (!orders.length) {
      return interaction.reply({ content: '📭 No orders found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(admin ? '📋 All Recent Orders (Admin)' : '📋 Your Order History')
      .setColor(admin ? 0xEB459E : 0x5865F2);

    for (const o of orders) {
      const status = STATUS_EMOJI[o.status] || o.status;
      const code = o.code ? `\`${formatCode(o.code)}\`` : '—';
      const used = o.used === 'true' ? ' (redeemed ✅)' : '';
      let val = `**Pack:** ${o.itemName}\n**₹${o.priceInr}** | ${status}`;
      if (o.utr) val += `\n**UTR:** \`${o.utr}\``;
      if (o.code) val += `\n**Code:** ${code}${used}`;
      if (admin) {
        const u = Users.findById(o.userId);
        val += `\n**Buyer:** ${u ? u.email : 'Unknown'}`;
      }
      embed.addFields({ name: `Order \`${o.id.slice(-8)}\` — ${new Date(Number(o.createdAt)).toLocaleDateString('en-IN')}`, value: val, inline: false });
    }

    if (admin) embed.setFooter({ text: 'Showing last 20 orders. Use /adminlookup to search by email.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
