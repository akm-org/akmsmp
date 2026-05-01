const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Users, Items, Orders, Settings } = require('../../lib/db');

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
        content: `❌ You need to link your account first!\nUse \`/login\` or \`/register\` to get started.`,
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

    // Use interaction.reply if it's a slash command, or a fresh interaction if it's from a button
    const response = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    const collector = response.createMessageComponentCollector({
      filter: i => i.customId === `buy_select_${interaction.user.id}` && i.user.id === interaction.user.id,
      time: 60_000,
      max: 1,
    });

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

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`utr_${order.id}`).setLabel('📝 Submit UTR / Payment ID').setStyle(ButtonStyle.Primary)
      );

      const payEmbed = new EmbedBuilder()
        .setTitle('💳 Payment Instructions')
        .setColor(0xF1A208)
        .addFields(
          { name: 'Pack', value: item.name, inline: true },
          { name: 'Amount', value: `₹${item.priceInr}`, inline: true },
          { name: 'UPI ID', value: `\`${upiId}\``, inline: false },
          { name: 'Order ID', value: `\`${order.id}\``, inline: false },
        )
        .setDescription(`1. Open your UPI app\n2. Pay **₹${item.priceInr}** to \`${upiId}\`\n3. Click the button below to submit your UTR ID.`)
        .setFooter({ text: 'Admin will verify and DM your Magic Code!' });

      await sel.update({ embeds: [payEmbed], components: [row2] });
    });
  },

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
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  },

  async handleUtrModal(interaction) {
    const orderId = interaction.customId.replace('utr_modal_', '');
    const utr = interaction.fields.getTextInputValue('utr_value').trim();
    const order = Orders.findById(orderId);

    if (!order) return interaction.reply({ content: '❌ Order not found.', ephemeral: true });

    Orders.update(orderId, { utr, status: 'processing' });

    // Admin Notification Logic
    const { dmAdmins } = require('../dmAdmins');
    const adminEmbed = new EmbedBuilder()
      .setTitle('🔔 New Payment Submitted')
      .setColor(0xF1A208)
      .addFields(
        { name: 'User', value: interaction.user.tag, inline: true },
        { name: 'Pack', value: order.itemName, inline: true },
        { name: 'UTR', value: `\`${utr}\``, inline: false },
      );
    dmAdmins({ embeds: [adminEmbed] });

    await interaction.reply({ content: `✅ UTR **${utr}** submitted! Wait for admin approval.`, ephemeral: true });
  },
};
