const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Users, Orders } = require('../../lib/db');
const { isAdminUser } = require('../../lib/auth');
const { formatCode } = require('../../lib/codes');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminlookup')
    .setDescription('[Admin] Look up a user\'s full order history')
    .addStringOption(opt =>
      opt.setName('email').setDescription('The user\'s email address').setRequired(true)),

  async execute(interaction) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser || !isAdminUser(linkedUser)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const email = interaction.options.getString('email').toLowerCase().trim();
    const target = Users.findByEmail(email);
    if (!target) {
      return interaction.reply({ content: `❌ No user found with email \`${email}\`.`, ephemeral: true });
    }

    const orders = Orders.forUser(target.id);
    const embed = new EmbedBuilder()
      .setTitle(`👤 Orders for ${target.email}`)
      .setColor(0x5865F2)
      .addFields(
        { name: 'Account Created', value: new Date(Number(target.createdAt)).toLocaleString('en-IN'), inline: true },
        { name: 'Admin', value: isAdminUser(target) ? 'Yes' : 'No', inline: true },
        { name: 'Discord Linked', value: target.discordId ? `✅ <@${target.discordId}>` : '❌ Not linked', inline: true },
        { name: 'Total Orders', value: String(orders.length), inline: true },
      );

    if (orders.length) {
      const totalSpend = orders.filter(o => o.status === 'paid').reduce((s, o) => s + Number(o.priceInr), 0);
      embed.addFields({ name: 'Total Spend (Approved)', value: `₹${totalSpend}`, inline: true });

      let history = '';
      for (const o of orders.slice(0, 10)) {
        const status = { awaiting_utr:'⏳', processing:'🔄', paid:'✅', rejected:'❌' }[o.status] || '?';
        const code = o.code ? `\`${formatCode(o.code)}\`` : '—';
        const used = o.used === 'true' ? '(redeemed)' : '';
        history += `${status} ${o.itemName} — ₹${o.priceInr} — ${new Date(Number(o.createdAt)).toLocaleDateString('en-IN')}`;
        if (o.code) history += ` → ${code} ${used}`;
        history += '\n';
      }
      embed.addFields({ name: 'Order History (last 10)', value: history || '—', inline: false });
    } else {
      embed.addFields({ name: 'Orders', value: 'No orders yet.', inline: false });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
