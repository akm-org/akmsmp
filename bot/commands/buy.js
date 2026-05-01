const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Users, Items, Orders, Settings } = require('../../lib/db');

function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase AKM Dollars for your Minecraft account'),

  async execute(interaction) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    
    // Check if user is logged in
    if (!linkedUser) return this.sendLoginPrompt(interaction);

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

    const row = new ActionRowBuilder().addComponents(menu);
    const embed = new EmbedBuilder()
      .setTitle('🛒 AKMSMP Shop')
      .setColor(0x5865F2)
      .setDescription('Select a pack below to generate your payment request.');

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    
    // Collector for the /buy command menu
    const response = await interaction.fetchReply();
    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
      max: 1,
    });

    collector.on('collect', async (sel) => {
      await this.processSelection(sel, sel.values[0], linkedUser);
    });
  },

  // Handles the Select Menu from the !deploy message
  async handleInstantSelect(interaction) {
    const linkedUser = Users.findByDiscordId(interaction.user.id);
    if (!linkedUser) return this.sendLoginPrompt(interaction);

    const itemId = interaction.values[0];
    await this.processSelection(interaction, itemId, linkedUser);
  },

  async sendLoginPrompt(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('start_login_flow')
        .setLabel('Link Account / Login')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔑')
    );

    const embed = new EmbedBuilder()
      .setTitle('🔐 Account Required')
      .setDescription('You must link your Minecraft account to the bot before making a purchase so we know where to send your dollars!')
      .setColor(0xFF0000);

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  async processSelection(interaction, itemId, linkedUser) {
    const item = Items.findById(itemId);
    if (!item) return interaction.reply({ content: '❌ Item not found.', ephemeral: true });

    const orderId = rid();
    const upiId = Settings.get('upiId') || 'akmsmp@upi';

    Orders.add({
      id: orderId,
      userId: linkedUser.id,
      itemId: item.id,
      itemName: item.name,
      priceInr: item.priceInr,
      akmValue: item.akmValue,
      status: 'awaiting_utr',
      createdAt: String(Date.now()),
    });

    const payEmbed = new EmbedBuilder()
      .setTitle('💳 Payment Instructions')
      .setColor(0xF1A208)
      .addFields(
        { name: 'Pack', value: item.name, inline: true },
        { name: 'Amount', value: `₹${item.priceInr}`, inline: true },
        { name: 'UPI ID', value: `\`${upiId}\``, inline: false },
      )
      .setDescription(`Pay the amount to the UPI ID above, then click the button to submit your Transaction/UTR ID.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`utr_${orderId}`).setLabel('📝 Submit UTR ID').setStyle(ButtonStyle.Success)
    );

    // If triggered from another menu, use update; if from slash, use reply
    if (interaction.isStringSelectMenu()) {
      await interaction.reply({ embeds: [payEmbed], components: [row], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [payEmbed], components: [row], ephemeral: true });
    }
  },

  async handleUtrButton(interaction) {
    const orderId = interaction.customId.replace('utr_', '');
    const modal = new ModalBuilder().setCustomId(`utr_modal_${orderId}`).setTitle('Payment Verification');
    const input = new TextInputBuilder().setCustomId('utr_value').setLabel('Transaction / UTR ID').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(6);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  },

  async handleUtrModal(interaction) {
    const orderId = interaction.customId.replace('utr_modal_', '');
    const utr = interaction.fields.getTextInputValue('utr_value').trim();
    Orders.update(orderId, { utr, status: 'processing' });

    // Notify Admins
    const { dmAdmins } = require('../dmAdmins');
    dmAdmins({ content: `🔔 **New Payment!** User: ${interaction.user.tag} | UTR: \`${utr}\` | ID: \`${orderId}\`` });

    await interaction.reply({ content: `✅ UTR Submitted! Please wait for admin approval.`, ephemeral: true });
  }
};
