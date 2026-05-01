const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Users, Items, Orders, Settings } = require('../../lib/db');

function rid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase AKM Dollars for your Minecraft account'),

  // This handles the !deploy buttons (trigger_10k, trigger_100k)
  async execute(interaction, directAmount = null) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    const SHOP = process.env.SHOP_URL || 'https://akmsmp.onrender.com';

    if (!linkedUser) {
      return interaction.reply({
        content: `❌ You need to link your account first!\nUse \`/login\` or \`/register\` to get started.`,
        ephemeral: true,
      });
    }

    // If a direct amount was passed from index.js button
    if (directAmount) {
      const item = Items.visible().find(i => i.akmValue === directAmount);
      if (!item) return interaction.reply({ content: '❌ This bundle is currently unavailable.', ephemeral: true });
      return this.initiateOrder(interaction, item, linkedUser);
    }

    // Otherwise, show the selection menu (Standard /buy flow)
    await this.startPurchaseFlow(interaction, linkedUser);
  },

  // Helper for the selection menu flow
  async startPurchaseFlow(interaction, linkedUser) {
    const items = Items.visible();
    if (!items.length) return interaction.reply({ content: '❌ No items available.', ephemeral: true });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`buy_select_${interaction.user.id}`)
      .setPlaceholder('Choose a pack...')
      .addOptions(items.map(i => ({
        label: i.name,
        description: `₹${i.priceInr}`,
        value: i.id,
      })));

    const embed = new EmbedBuilder()
      .setTitle('🛒 AKMSMP Shop')
      .setColor(0x5865F2)
      .setDescription(items.map(i => `**${i.name}** — ₹${i.priceInr}`).join('\n'));

    await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId === `buy_select_${interaction.user.id}` && i.user.id === interaction.user.id,
      time: 60_000,
      max: 1,
    });

    collector.on('collect', async (sel) => {
      const item = Items.findById(sel.values[0]);
      if (item) await this.initiateOrder(sel, item, linkedUser, true);
    });
  },

  // Final step: Create order and show payment instructions
  async initiateOrder(interaction, item, linkedUser, isUpdate = false) {
    const upiId = Settings.get('upiId') || 'akmsmp@upi';
    const upiName = Settings.get('upiName') || 'AKMSMP';
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

    const payEmbed = new EmbedBuilder()
      .setTitle('💳 Payment Instructions')
      .setColor(0xF1A208)
      .addFields(
        { name: 'Pack', value: item.name, inline: true },
        { name: 'Amount', value: `₹${item.priceInr}`, inline: true },
        { name: 'UPI ID', value: `\`${upiId}\``, inline: false }
      )
      .setDescription(`Pay **₹${item.priceInr}** to the UPI ID above, then click the button below to submit your UTR.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`utr_${order.id}`).setLabel('📝 Submit UTR').setStyle(ButtonStyle.Primary)
    );

    if (isUpdate) await interaction.update({ embeds: [payEmbed], components: [row] });
    else await interaction.reply({ embeds: [payEmbed], components: [row], ephemeral: true });
  },

  async handleUtrButton(interaction) {
    const orderId = interaction.customId.replace('utr_', '');
    const modal = new ModalBuilder().setCustomId(`utr_modal_${orderId}`).setTitle('Submit Payment ID');
    const input = new TextInputBuilder()
      .setCustomId('utr_value').setLabel('UTR / Transaction ID').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  },

  async handleUtrModal(interaction) {
    const orderId = interaction.customId.replace('utr_modal_', '');
    const utr = interaction.fields.getTextInputValue('utr_value').trim();
    const order = Orders.findById(orderId);

    if (!order) return interaction.reply({ content: '❌ Order not found.', ephemeral: true });
    Orders.update(orderId, { utr, status: 'processing' });

    const { dmAdmins } = require('../dmAdmins');
    dmAdmins({ content: `🔔 **New Payment**: ${interaction.user.tag} submitted UTR \`${utr}\` for ${order.itemName}.` });

    await interaction.reply({ content: `✅ UTR submitted! Admin will verify your payment soon.`, ephemeral: true });
  }
};
