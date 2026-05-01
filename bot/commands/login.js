const { SlashCommandBuilder } = require('discord.js');
const bcrypt = require('bcryptjs');
const { Users } = require('../../lib/db');
const { sendDM, waitForReply } = require('../dmFlow');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('login')
    .setDescription('Link your Discord to your AKMSMP shop account via DM'),

  async execute(interaction) {
    await interaction.reply({ content: '📬 Check your DMs!', ephemeral: true });
    const user = interaction.user;

    try {
      const alreadyLinked = Users.findByDiscordId(user.id);
      if (alreadyLinked) {
        return await sendDM(user, `✅ You're already linked as **${alreadyLinked.email}**.\nUse \`/buy\` or \`/history\` now!`);
      }

      await sendDM(user, '🔑 **Login to AKMSMP Shop**\n\nPlease type your **email address**:');
      const email = (await waitForReply(user.id)).toLowerCase();
      const account = Users.findByEmail(email);
      if (!account) {
        return await sendDM(user, '❌ No account found with that email. Use `/register` to create one.');
      }

      await sendDM(user, '🔒 Now enter your **password**:');
      const password = await waitForReply(user.id);
      const ok = await bcrypt.compare(password, account.passwordHash);
      if (!ok) {
        return await sendDM(user, '❌ Wrong password. Try again with `/login`.');
      }

      Users.setDiscordId(account.id, user.id);
      await sendDM(user, `✅ **Logged in!** Your Discord is now linked to \`${account.email}\`.\n\nUse \`/buy\` to purchase AKM Dollars, or \`/history\` to see your orders.`);
    } catch (err) {
      if (err.message === 'timeout') {
        await sendDM(user, '⏰ Timed out (2 min). Run `/login` again.').catch(() => {});
      } else {
        console.error('[login cmd]', err);
        await sendDM(user, '❌ Something went wrong. Please try again.').catch(() => {});
      }
    }
  },
};
