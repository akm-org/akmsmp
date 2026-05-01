/**
 * DM all admin Discord accounts when a payment event occurs.
 * This keeps notifications completely private — no public channel needed.
 */
const { Users } = require('../lib/db');
const { isAdminUser } = require('../lib/auth');

async function dmAdmins(content) {
  try {
    const client = require('./client');
    if (!client.isReady()) return;
    const admins = Users.all().filter(u => isAdminUser(u) && u.discordId);
    for (const admin of admins) {
      try {
        const discordUser = await client.users.fetch(admin.discordId);
        if (typeof content === 'string') {
          await discordUser.send(content);
        } else {
          await discordUser.send(content); // EmbedBuilder object or {embeds:[...]}
        }
      } catch (e) {
        console.error(`[dmAdmins] Failed to DM admin ${admin.email}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[dmAdmins] Error:', e.message);
  }
}

module.exports = { dmAdmins };
