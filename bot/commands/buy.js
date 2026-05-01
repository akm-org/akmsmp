const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Users, Items, Orders, Settings } = require('../../lib/db');

function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase AKM Dollars'),

  async execute(interaction, directAmount = null) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser) {
      return interaction.reply({ content: '❌ Link your account first with `/login`.', ephemeral: true });
    }

    // Direct Purchase (from !deploy buttons)
    if (directAmount) {
      const item = Items.visible().find(i => i.akmValue === directAmount);
      if (!item) return interaction.reply({ content: '❌ Pack not found.', ephemeral: true });
      return this.initiateOrder(interaction, item, linkedUser, false);
    }

    // Menu Purchase (from /buy)
    const items = Items.visible();
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`buy_select_${interaction.user.id}`)
      .setPlaceholder('Choose a pack...')
      .addOptions(items.map(i => ({ label: i.name, description: `₹${i.priceInr}`, value: i.id })));

    await interaction.reply({ 
      content: 'Select a pack:', 
      components: [new ActionRowBuilder().addComponents(menu)], 
      ephemeral: true 
    });
  },

  async initiateOrder(interaction, item, linkedUser, isUpdate = false) {
    const upiId = Settings.get('upiId') || 'akmsmp@upi';
    const order = {
      id: rid(),
      userId: linkedUser.id,
      itemId: item.id,
      itemName: item.name,
      priceInr: item.priceInr,
      akmValue: item.akmValue,
      status: 'awaiting_utr',
      createdAt: String(Date.now()),
    };
    Orders.add(order);

    const embed = new EmbedBuilder()
      .setTitle('💳 Payment Instructions')
      .setDescription(`Pay **₹${item.priceInr}** to \`${upiId}\` and submit the UTR.`)
      .setColor(0xF1A208);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`utr_${order.id}`).setLabel('Submit UTR').setStyle(ButtonStyle.Primary)
    );

    if (isUpdate) await interaction.update({ embeds: [embed], components: [row] });
    else await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  async handleUtrButton(interaction) {
    const orderId = interaction.customId.replace('utr_', '');
    const modal = new ModalBuilder().setCustomId(`utr_modal_${orderId}`).setTitle('Submit UTR');
    const input = new TextInputBuilder().setCustomId('utr_value').setLabel('Transaction ID').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  },

  async handleUtrModal(interaction) {
    const orderId = interaction.customId.replace('utr_modal_', '');
    const utr = interaction.fields.getTextInputValue('utr_value').trim();
    Orders.update(orderId, { utr, status: 'processing' });
    await interaction.reply({ content: `✅ UTR submitted. Order ID: ${orderId}`, ephemeral: true });
  }
};
