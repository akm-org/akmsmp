const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');

const { init, Users, Items, Orders, Settings } = require('./lib/db');
const { setSession, clearSession, getUser, requireAuth, requireAdmin, isAdminUser, hash, compare, adminEmails } = require('./lib/auth');
const { uniqueCode, formatCode } = require('./lib/codes');

init();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function rid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- Rate limiting for public code endpoints ----------
const redeemLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests — slow down and try again.' },
});

// ---------- Discord webhook helper ----------
async function notifyWebhook(embed) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) {
    console.error('[webhook]', e.message);
  }
}

// Helper to DM a user via the Discord bot when an order is approved/rejected via the web admin
async function dmDiscordUser(discordId, content) {
  if (!discordId) return;
  try {
    const botClient = require('./bot/client');
    if (!botClient.isReady()) return;
    const user = await botClient.users.fetch(discordId);
    await user.send(content);
  } catch (e) {
    console.error('[dm]', e.message);
  }
}

// ---------- Auth ----------
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  if (Users.findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

  const allUsers = Users.all();
  const isFirst = allUsers.filter(u => !adminEmails().includes(u.email)).length === 0;
  const isAdminEmail = adminEmails().includes(String(email).toLowerCase());
  const user = {
    id: rid(),
    email: String(email).toLowerCase(),
    passwordHash: await hash(password),
    isAdmin: (isFirst || isAdminEmail) ? 'true' : 'false',
    createdAt: String(Date.now()),
  };
  Users.add(user);
  setSession(res, user.id);
  res.json({ ok: true, user: { id: user.id, email: user.email, isAdmin: isAdminUser(user) } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = Users.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  setSession(res, user.id);
  res.json({ ok: true, user: { id: user.id, email: user.email, isAdmin: isAdminUser(user) } });
});

app.post('/api/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = getUser(req);
  if (!u) return res.json({ user: null });
  res.json({ user: { id: u.id, email: u.email, isAdmin: isAdminUser(u) } });
});

// ---------- Shop ----------
app.get('/api/items', (req, res) => {
  res.json({ items: Items.visible() });
});

app.get('/api/settings/public', (req, res) => {
  res.json({
    upiId: Settings.get('upiId'),
    upiName: Settings.get('upiName'),
    serverName: Settings.get('serverName') || 'AKMSMP',
    qrImagePath: Settings.get('qrImagePath') || '',
    playerCount: Settings.get('mcPlayerCount') || '0',
  });
});

app.post('/api/orders', requireAuth, (req, res) => {
  const { itemId } = req.body || {};
  const item = Items.findById(itemId);
  if (!item || item.visible === 'false') return res.status(404).json({ error: 'Item not found' });
  const order = {
    id: rid(),
    userId: req.user.id,
    itemId: item.id,
    itemName: item.name,
    priceInr: item.priceInr,
    akmValue: item.akmValue,
    utr: '',
    status: 'awaiting_utr',
    code: '',
    used: 'false',
    createdAt: String(Date.now()),
    decidedAt: '',
  };
  Orders.add(order);
  res.json({ ok: true, order });
});

app.post('/api/orders/:id/utr', requireAuth, (req, res) => {
  const { utr } = req.body || {};
  if (!utr || String(utr).length < 6) return res.status(400).json({ error: 'Enter a valid UTR / Transaction ID' });
  const order = Orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: 'Not your order' });
  if (order.status !== 'awaiting_utr') return res.status(400).json({ error: 'UTR already submitted' });
  Orders.update(order.id, { utr: String(utr).trim(), status: 'processing' });

  notifyWebhook({
    title: '🔔 Payment Submitted (Web)',
    color: 0xF1A208,
    fields: [
      { name: 'User', value: req.user.email, inline: true },
      { name: 'Pack', value: order.itemName, inline: true },
      { name: 'UTR', value: `\`${utr}\``, inline: false },
    ],
    footer: { text: 'Use /showorders in Discord to approve' },
    timestamp: new Date().toISOString(),
  });

  res.json({ ok: true, order: Orders.findById(order.id) });
});

app.get('/api/orders/mine', requireAuth, (req, res) => {
  res.json({ orders: Orders.forUser(req.user.id) });
});

// ---------- Admin ----------
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const status = req.query.status;
  let rows = Orders.all();
  if (status) rows = rows.filter(o => o.status === status);
  const usersById = Object.fromEntries(Users.all().map(u => [u.id, u.email]));
  res.json({ orders: rows.map(o => ({ ...o, userEmail: usersById[o.userId] || '(deleted)' })) });
});

app.post('/api/admin/orders/:id/accept', requireAdmin, async (req, res) => {
  const order = Orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'processing') return res.status(400).json({ error: 'Order not in processing state' });
  const code = uniqueCode();
  const expiresAt = Date.now() + 48 * 3600 * 1000;
  Orders.update(order.id, { code, status: 'paid', used: 'false', expiresAt: String(expiresAt), decidedAt: String(Date.now()) });
  const updated = Orders.findById(order.id);

  // DM buyer if linked Discord account
  const buyer = Users.findById(order.userId);
  if (buyer && buyer.discordId) {
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('🎉 Order Approved!')
      .setColor(0x57F287)
      .addFields(
        { name: 'Pack', value: order.itemName, inline: true },
        { name: '🔑 Magic Code', value: `\`\`\`${formatCode(code)}\`\`\``, inline: false },
        { name: 'Expires', value: `${new Date(expiresAt).toLocaleString('en-IN')} (48h)`, inline: false },
      )
      .setDescription(`Use \`/redeem ${code}\` in Minecraft!`);
    dmDiscordUser(buyer.discordId, { embeds: [embed] });
  }

  notifyWebhook({
    title: '✅ Order Approved (Web Admin)',
    color: 0x57F287,
    fields: [
      { name: 'Buyer', value: buyer ? buyer.email : 'Unknown', inline: true },
      { name: 'Pack', value: order.itemName, inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  res.json({ ok: true, order: updated });
});

app.post('/api/admin/orders/:id/reject', requireAdmin, async (req, res) => {
  const order = Orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'paid') return res.status(400).json({ error: 'Cannot reject a paid order' });
  Orders.update(order.id, { status: 'rejected', decidedAt: String(Date.now()) });

  const buyer = Users.findById(order.userId);
  if (buyer && buyer.discordId) {
    dmDiscordUser(buyer.discordId, `❌ **Order rejected** — ${order.itemName} (₹${order.priceInr}). Contact an admin if you believe this is a mistake.`);
  }

  res.json({ ok: true, order: Orders.findById(order.id) });
});

app.get('/api/admin/items', requireAdmin, (req, res) => {
  res.json({ items: Items.all() });
});

app.post('/api/admin/items', requireAdmin, (req, res) => {
  const { name, priceInr, akmValue, sortOrder, visible } = req.body || {};
  if (!name || !priceInr || !akmValue) return res.status(400).json({ error: 'Missing fields' });
  Items.add({
    id: 'pack_' + rid(),
    name: String(name),
    priceInr: Number(priceInr),
    akmValue: Number(akmValue),
    sortOrder: Number(sortOrder || 0),
    visible: visible === false ? 'false' : 'true',
  });
  res.json({ ok: true });
});

app.put('/api/admin/items/:id', requireAdmin, (req, res) => {
  const item = Items.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { name, priceInr, akmValue, sortOrder, visible } = req.body || {};
  const update = {};
  if (name !== undefined) update.name = String(name);
  if (priceInr !== undefined) update.priceInr = Number(priceInr);
  if (akmValue !== undefined) update.akmValue = Number(akmValue);
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);
  if (visible !== undefined) update.visible = Boolean(visible);
  Items.update(req.params.id, update);
  res.json({ ok: true });
});

app.delete('/api/admin/items/:id', requireAdmin, (req, res) => {
  Items.delete(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({ settings: Settings.all() });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const updates = req.body || {};
  for (const [k, v] of Object.entries(updates)) Settings.set(k, String(v ?? ''));
  res.json({ ok: true });
});

// ---------- Minecraft player count (push from Skript) ----------
// Minecraft server POSTs here every minute: { "count": 5, "players": ["Alex", "Steve"] }
// Secured by MC_PUSH_SECRET env var (set same value in Skript)
app.post('/api/mc/player-count', (req, res) => {
  const secret = process.env.MC_PUSH_SECRET;
  if (secret && req.headers['x-mc-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { count, players } = req.body || {};
  Settings.set('mcPlayerCount', String(Number(count) || 0));
  Settings.set('mcPlayerCountUpdated', String(Date.now()));
  if (players && Array.isArray(players)) Settings.set('mcPlayerList', players.slice(0, 50).join(','));
  res.json({ ok: true });
});

app.get('/api/mc/player-count', (req, res) => {
  res.json({
    count: Number(Settings.get('mcPlayerCount') || 0),
    players: (Settings.get('mcPlayerList') || '').split(',').filter(Boolean),
    updatedAt: Settings.get('mcPlayerCountUpdated') || null,
  });
});

// ---------- Public code endpoints (rate limited) ----------
function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

app.get('/api/peek-code/:code', redeemLimiter, (req, res) => {
  const code = normalizeCode(req.params.code);
  if (!code) return res.status(400).json({ status: 'error', message: 'Code required' });
  const o = Orders.findByCode(code);
  if (!o) return res.status(404).json({ status: 'error', message: 'Code not found', queriedCode: code });
  const expired = o.expiresAt && Number(o.expiresAt) < Date.now();
  res.json({
    status: 'ok',
    code: o.code,
    formatted: formatCode(o.code),
    value: Number(o.akmValue),
    itemName: o.itemName,
    orderStatus: o.status,
    used: o.used === 'true',
    expired,
    expiresAt: o.expiresAt || null,
    createdAt: o.createdAt,
    decidedAt: o.decidedAt,
  });
});

app.get('/api/verify-code/:code', redeemLimiter, async (req, res) => {
  const raw = String(req.params.code || '');
  const code = normalizeCode(raw);
  const player = req.query.player || 'Unknown';
  console.log(`[verify-code] raw="${raw}" normalized="${code}" player="${player}" from ${req.ip}`);
  if (!code) return res.status(400).json({ status: 'error', message: 'Code required' });
  const o = Orders.findByCode(code);
  if (!o) {
    console.log(`[verify-code] NOT FOUND: ${code}`);
    return res.status(404).json({ status: 'error', message: 'Code not found' });
  }
  if (o.status !== 'paid') return res.status(400).json({ status: 'error', message: 'Code not active' });
  if (o.used === 'true') return res.status(400).json({ status: 'error', message: 'Code already redeemed' });
  if (o.expiresAt && Number(o.expiresAt) < Date.now()) return res.status(400).json({ status: 'error', message: 'Code expired' });

  Orders.update(o.id, { used: 'true' });
  console.log(`[verify-code] REDEEMED: ${o.code} value=${o.akmValue} player="${player}"`);

  notifyWebhook({
    title: '🎮 Code Redeemed In-Game!',
    color: 0x57F287,
    fields: [
      { name: 'Player', value: player, inline: true },
      { name: 'Pack', value: o.itemName, inline: true },
      { name: 'Amount', value: `${Number(o.akmValue).toLocaleString()} AKM$`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  res.json({ status: 'success', code: o.code, value: Number(o.akmValue), itemName: o.itemName });
});

app.get('/api/redeem/:code', redeemLimiter, async (req, res) => {
  const raw = String(req.params.code || '');
  const code = normalizeCode(raw);
  const player = req.query.player || 'Unknown';
  console.log(`[redeem] raw="${raw}" normalized="${code}" player="${player}" from ${req.ip}`);
  res.type('text/plain');
  if (!code) return res.status(400).send('error:missing-code');
  const o = Orders.findByCode(code);
  if (!o) {
    console.log(`[redeem] NOT FOUND: ${code}`);
    return res.status(404).send('error:not-found');
  }
  if (o.status !== 'paid') return res.status(400).send('error:not-active');
  if (o.used === 'true') return res.status(410).send('error:already-redeemed');
  if (o.expiresAt && Number(o.expiresAt) < Date.now()) return res.status(410).send('error:expired');

  Orders.update(o.id, { used: 'true' });
  console.log(`[redeem] REDEEMED: ${o.code} value=${o.akmValue} player="${player}"`);

  notifyWebhook({
    title: '🎮 Code Redeemed In-Game!',
    color: 0x57F287,
    fields: [
      { name: 'Player', value: player, inline: true },
      { name: 'Pack', value: o.itemName, inline: true },
      { name: 'Amount', value: `${Number(o.akmValue).toLocaleString()} AKM$`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  res.status(200).send(String(Number(o.akmValue) || 0));
});

app.get('/api/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// SPA fallback
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = Number(process.env.PORT) || 5000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AKMSMP v2 running on http://0.0.0.0:${PORT}`);
    // Start Discord bot (only if token is set)
    require('./bot/index');
  });
}

module.exports = app;
