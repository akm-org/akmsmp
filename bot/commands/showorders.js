const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Users, Orders } = require('../../lib/db');
const { isAdminUser } = require('../../lib/auth');
const { uniqueCode, formatCode } = require('../../lib/codes');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('showorders')
    .setDescription('[Admin] Show pending orders with approve/reject buttons'),

  async execute(interaction) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser || !isAdminUser(linkedUser)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const pending = Orders.pending();
    if (!pending.length) {
      return interaction.reply({ content: '✅ No pending orders right now.', ephemeral: true });
    }

    await interaction.reply({ content: `🔔 **${pending.length} pending order(s):**`, ephemeral: true });

    for (const order of pending.slice(0, 10)) {
      const buyer = Users.findById(order.userId);
      const embed = new EmbedBuilder()
        .setTitle(`📦 Order: ${order.id.slice(-8)}`)
        .setColor(0xF1A208)
        .addFields(
          { name: 'Buyer', value: buyer ? `${buyer.email}` : 'Unknown', inline: true },
          { name: 'Pack', value: order.itemName, inline: true },
          { name: 'Price', value: `₹${order.priceInr}`, inline: true },
          { name: 'UTR', value: `\`${order.utr || 'not submitted'}\``, inline: false },
          { name: 'Placed', value: new Date(Number(order.createdAt)).toLocaleString('en-IN'), inline: false },
        );

      const approve = new ButtonBuilder()
        .setCustomId(`approve_${order.id}`)
        .setLabel('✅ Approve')
        .setStyle(ButtonStyle.Success);

      const reject = new ButtonBuilder()
        .setCustomId(`reject_${order.id}`)
        .setLabel('❌ Reject')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(approve, reject);
      await interaction.followUp({ embeds: [embed], components: [row], ephemeral: true });
    }
  },

  // Called from bot/index.js for approve/reject button presses
  async handleApprove(interaction, orderId) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser || !isAdminUser(linkedUser)) {
      return interaction.update({ content: '❌ Admin only.', components: [] });
    }

    const order = Orders.findById(orderId);
    if (!order) return interaction.update({ content: '❌ Order not found.', components: [] });
    if (order.status !== 'processing') return interaction.update({ content: '⚠️ Order is no longer pending.', components: [] });

    const code = uniqueCode();
    const expiresAt = Date.now() + 48 * 3600 * 1000;
    Orders.update(orderId, { code, status: 'paid', used: 'false', expiresAt, decidedAt: Date.now() });

    // DM the buyer
    const buyer = Users.findById(order.userId);
    if (buyer && buyer.discordId) {
      try {
        const client = require('../client');
        const discordUser = await client.users.fetch(buyer.discordId);
        const embed = new EmbedBuilder()
          .setTitle('🎉 Order Approved!')
          .setColor(0x57F287)
          .addFields(
            { name: 'Pack', value: order.itemName, inline: true },
            { name: 'Amount', value: `${Number(order.akmValue).toLocaleString()} AKM$`, inline: true },
            { name: '🔑 Magic Code', value: `\`\`\`${formatCode(code)}\`\`\``, inline: false },
            { name: 'Expires', value: `${new Date(expiresAt).toLocaleString('en-IN')} (48h)`, inline: false },
          )
          .setDescription('Use `/redeem ' + formatCode(code).replace(/-/g,'') + '` in Minecraft!\n(Dashes are optional — any format works)')
          .setFooter({ text: 'Code expires 48h after approval.' });
        await discordUser.send({ embeds: [embed] });
      } catch (e) {
        console.error('[showorders] DM buyer failed:', e.message);
      }
    }

    // Notify via webhook
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const fetch = require('node-fetch');
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '✅ Order Approved',
            color: 0x57F287,
            fields: [
              { name: 'Buyer', value: buyer ? buyer.email : 'Unknown', inline: true },
              { name: 'Pack', value: order.itemName, inline: true },
              { name: 'Code (partial)', value: `\`${formatCode(code).slice(0,9)}...\``, inline: false },
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(console.error);
    }

    await interaction.update({
      content: `✅ Approved! Code sent to ${buyer ? buyer.email : 'buyer'} via DM.`,
      embeds: [],
      components: [],
    });
  },

  async handleReject(interaction, orderId) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser || !isAdminUser(linkedUser)) {
      return interaction.update({ content: '❌ Admin only.', components: [] });
    }

    const order = Orders.findById(orderId);
    if (!order) return interaction.update({ content: '❌ Order not found.', components: [] });
    if (order.status === 'paid') return interaction.update({ content: '⚠️ Cannot reject an already approved order.', components: [] });

    Orders.update(orderId, { status: 'rejected', decidedAt: Date.now() });

    const buyer = Users.findById(order.userId);
    if (buyer && buyer.discordId) {
      try {
        const client = require('../client');
        const discordUser = await client.users.fetch(buyer.discordId);
        await discordUser.send(`❌ **Order rejected.**\nYour order for **${order.itemName}** (₹${order.priceInr}) was rejected.\nIf you believe this is a mistake, please contact an admin.`);
      } catch (e) { console.error('[showorders] DM reject failed:', e.message); }
    }

    await interaction.update({
      content: `❌ Order rejected and buyer notified.`,
      embeds: [],
      components: [],
    });
  },
};
