const { SlashCommandBuilder } = require('discord.js');
const bcrypt = require('bcryptjs');
const { Users, PERMANENT_ADMIN_EMAILS } = require('../../lib/db');
const { sendDM, waitForReply } = require('../dmFlow');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Create your AKMSMP shop account via DM'),

  async execute(interaction) {
    const SHOP = process.env.SHOP_URL || 'https://akmsmp.onrender.com';
    await interaction.reply({ content: '📬 Check your DMs — I\'ll walk you through registration!', ephemeral: true });
    const user = interaction.user;

    try {
      await sendDM(user, `👋 Welcome to **AKMSMP Shop**!\n\nLet's create your account. Please type your **email address** now:`);

      const email = (await waitForReply(user.id)).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return await sendDM(user, '❌ That doesn\'t look like a valid email. Run `/register` again to try.');
      }
      if (Users.findByEmail(email)) {
        return await sendDM(user, `❌ That email is already registered. Use \`/login\` instead.\nOr visit ${SHOP} to log in.`);
      }

      await sendDM(user, '🔒 Now choose a **password** (at least 6 characters):');
      const password = await waitForReply(user.id);
      if (password.length < 6) {
        return await sendDM(user, '❌ Password too short (minimum 6 characters). Run `/register` again.');
      }

      const isAdminEmail = PERMANENT_ADMIN_EMAILS.includes(email);
      const allUsers = Users.all();
      const isFirst = allUsers.filter(u => !PERMANENT_ADMIN_EMAILS.includes(u.email)).length === 0;

      const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const passwordHash = await bcrypt.hash(password, 10);
      Users.add({
        id,
        email,
        passwordHash,
        isAdmin: (isFirst || isAdminEmail) ? 'true' : 'false',
        discordId: user.id,
        createdAt: String(Date.now()),
      });

      await sendDM(user, `✅ **Account created!**\n📧 Email: \`${email}\`\n\nYour Discord is now linked to your shop account.\nVisit ${SHOP} to buy AKM Dollars, or use \`/buy\` here!`);
    } catch (err) {
      if (err.message === 'timeout') {
        await sendDM(user, '⏰ Timed out (2 min). Run `/register` again whenever you\'re ready.').catch(() => {});
      } else {
        console.error('[register cmd]', err);
        await sendDM(user, '❌ Something went wrong. Please try again later.').catch(() => {});
      }
    }
  },
};
