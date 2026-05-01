const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Users, Items, Orders, Settings } = require('../../lib/db');
const { isAdminUser } = require('../../lib/auth');

function rid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase AKM Dollars for your Minecraft account'),

  async execute(interaction) {
    const SHOP = process.env.SHOP_URL || 'https://akmsmp.onrender.com';
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser) {
      return interaction.reply({
        content: `❌ You need to link your account first!\nUse \`/login\` or \`/register\` to get started.\nOr visit ${SHOP} to buy directly.`,
        ephemeral: true,
      });
    }

    const items = Items.visible();
    if (!items.length) {
      return interaction.reply({ content: '❌ No items available right now.', ephemeral: true });
    }

    const upiId = Settings.get('upiId') || 'akmsmp@upi';
    const upiName = Settings.get('upiName') || 'AKMSMP';

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`buy_select_${interaction.user.id}`)
      .setPlaceholder('Choose a pack...')
      .addOptions(items.map(i => ({
        label: i.name,
        description: `₹${i.priceInr}`,
        value: i.id,
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    const embed = new EmbedBuilder()
      .setTitle('🛒 AKMSMP Shop — Buy AKM Dollars')
      .setColor(0x5865F2)
      .setDescription(items.map(i => `**${i.name}** — ₹${i.priceInr}`).join('\n'))
      .setFooter({ text: 'Select a pack below to continue' });

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    // Collect the select menu response
    const collector = interaction.channel
      ? interaction.channel.createMessageComponentCollector({
          filter: i => i.customId === `buy_select_${interaction.user.id}` && i.user.id === interaction.user.id,
          time: 60_000,
          max: 1,
        })
      : null;

    if (!collector) {
      // In DM or thread where collector isn't available, just redirect
      await interaction.followUp({ content: `👉 Visit ${SHOP} to complete your purchase!`, ephemeral: true });
      return;
    }

    collector.on('collect', async (sel) => {
      const itemId = sel.values[0];
      const item = Items.findById(itemId);
      if (!item) return sel.update({ content: '❌ Item not found.', embeds: [], components: [] });

      const order = {
        id: rid(),
        userId: linkedUser.id,
        itemId: item.id,
        itemName: item.name,
        priceInr: item.priceInr,
        akmValue: item.akmValue,
        utr: '',
        code: '',
        status: 'awaiting_utr',
        used: 'false',
        createdAt: String(Date.now()),
        decidedAt: '',
      };
      Orders.add(order);

      const utrBtn = new ButtonBuilder()
        .setCustomId(`utr_${order.id}`)
        .setLabel('📝 Submit UTR / Payment ID')
        .setStyle(ButtonStyle.Primary);

      const row2 = new ActionRowBuilder().addComponents(utrBtn);

      const payEmbed = new EmbedBuilder()
        .setTitle('💳 Payment Instructions')
        .setColor(0xF1A208)
        .addFields(
          { name: 'Pack', value: item.name, inline: true },
          { name: 'Amount', value: `₹${item.priceInr}`, inline: true },
          { name: 'UPI ID', value: `\`${upiId}\``, inline: false },
          { name: 'Name', value: upiName, inline: true },
          { name: 'Order ID', value: `\`${order.id}\``, inline: false },
        )
        .setDescription(`1. Open any UPI app (GPay, PhonePe, Paytm)\n2. Pay **₹${item.priceInr}** to \`${upiId}\`\n3. Click the button below and paste your Transaction/UTR ID\n\nOr visit **${SHOP}** to submit your payment there.`)
        .setFooter({ text: 'Once admin confirms, your Magic Code will be DMed to you!' });

      await sel.update({ embeds: [payEmbed], components: [row2] });
    });

    collector.on('end', (collected) => {
      if (!collected.size) {
        interaction.editReply({ content: '⏰ Selection timed out.', embeds: [], components: [] }).catch(() => {});
      }
    });
  },

  // Handle UTR button (called from bot index)
  async handleUtrButton(interaction) {
    const orderId = interaction.customId.replace('utr_', '');
    const modal = new ModalBuilder()
      .setCustomId(`utr_modal_${orderId}`)
      .setTitle('Submit Payment ID');

    const input = new TextInputBuilder()
      .setCustomId('utr_value')
      .setLabel('Paste your UTR / Transaction ID')
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(50)
      .setPlaceholder('e.g. 312345678901')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  },

  // Handle modal submit (called from bot index)
  async handleUtrModal(interaction) {
    const orderId = interaction.customId.replace('utr_modal_', '');
    const utr = interaction.fields.getTextInputValue('utr_value').trim();

    const order = Orders.findById(orderId);
    if (!order) return interaction.reply({ content: '❌ Order not found.', ephemeral: true });

    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser || order.userId !== linkedUser.id) {
      return interaction.reply({ content: '❌ This is not your order.', ephemeral: true });
    }
    if (order.status !== 'awaiting_utr') {
      return interaction.reply({ content: '✅ UTR already submitted — wait for admin to approve.', ephemeral: true });
    }

    Orders.update(orderId, { utr, status: 'processing' });

    // Notify admins via private DM (not public channel)
    const { EmbedBuilder } = require('discord.js');
    const { dmAdmins } = require('../dmAdmins');
    const adminEmbed = new EmbedBuilder()
      .setTitle('🔔 New Payment Submitted')
      .setColor(0xF1A208)
      .addFields(
        { name: 'User', value: `${interaction.user.tag} (${linkedUser.email})`, inline: true },
        { name: 'Pack', value: order.itemName, inline: true },
        { name: 'Amount', value: `₹${order.priceInr}`, inline: true },
        { name: 'UTR', value: `\`${utr}\``, inline: false },
        { name: 'Order ID', value: `\`${orderId}\``, inline: false },
      )
      .setFooter({ text: 'Use /showorders to approve' })
      .setTimestamp();
    dmAdmins({ embeds: [adminEmbed] });

    await interaction.reply({ content: `✅ UTR **${utr}** submitted! Admin will verify and you'll receive your Magic Code via DM.`, ephemeral: true });
  },
};
