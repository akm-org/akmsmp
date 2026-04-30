const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { init, Users, Items, Orders, Settings, ITEM_HEADERS, ORDER_HEADERS } = require('./lib/db');
const { setSession, clearSession, getUser, requireAuth, requireAdmin, hash, compare, adminEmails } = require('./lib/auth');
const { uniqueCode } = require('./lib/codes');

init();

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function rid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- Auth ----------
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  if (Users.findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

  const allUsers = Users.all();
  const isFirst = allUsers.length === 0;
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
  res.json({ ok: true, user: { id: user.id, email: user.email, isAdmin: user.isAdmin === 'true' } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = Users.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  setSession(res, user.id);
  res.json({ ok: true, user: { id: user.id, email: user.email, isAdmin: user.isAdmin === 'true' } });
});

app.post('/api/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = getUser(req);
  if (!u) return res.json({ user: null });
  res.json({ user: { id: u.id, email: u.email, isAdmin: u.isAdmin === 'true' } });
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
  const orders = Orders.all();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  if (orders[idx].userId !== req.user.id) return res.status(403).json({ error: 'Not your order' });
  if (orders[idx].status !== 'awaiting_utr') return res.status(400).json({ error: 'UTR already submitted' });
  orders[idx].utr = String(utr).trim();
  orders[idx].status = 'processing';
  Orders.save(orders);
  res.json({ ok: true, order: orders[idx] });
});

app.get('/api/orders/mine', requireAuth, (req, res) => {
  res.json({ orders: Orders.forUser(req.user.id) });
});

// ---------- Admin ----------
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const status = req.query.status;
  let rows = Orders.all().sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  if (status) rows = rows.filter(o => o.status === status);
  const usersById = Object.fromEntries(Users.all().map(u => [u.id, u.email]));
  res.json({ orders: rows.map(o => ({ ...o, userEmail: usersById[o.userId] || '(deleted)' })) });
});

app.post('/api/admin/orders/:id/accept', requireAdmin, (req, res) => {
  const orders = Orders.all();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  if (orders[idx].status !== 'processing') return res.status(400).json({ error: 'Order not in processing state' });
  orders[idx].code = uniqueCode();
  orders[idx].status = 'paid';
  orders[idx].used = 'false';
  orders[idx].decidedAt = String(Date.now());
  Orders.save(orders);
  res.json({ ok: true, order: orders[idx] });
});

app.post('/api/admin/orders/:id/reject', requireAdmin, (req, res) => {
  const orders = Orders.all();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  if (orders[idx].status === 'paid') return res.status(400).json({ error: 'Cannot reject a paid order' });
  orders[idx].status = 'rejected';
  orders[idx].decidedAt = String(Date.now());
  Orders.save(orders);
  res.json({ ok: true, order: orders[idx] });
});

app.get('/api/admin/items', requireAdmin, (req, res) => {
  res.json({ items: Items.all() });
});

app.post('/api/admin/items', requireAdmin, (req, res) => {
  const { name, priceInr, akmValue, sortOrder, visible } = req.body || {};
  if (!name || !priceInr || !akmValue) return res.status(400).json({ error: 'Missing fields' });
  const items = Items.all();
  items.push({
    id: 'pack_' + rid(),
    name: String(name),
    priceInr: String(priceInr),
    akmValue: String(akmValue),
    sortOrder: String(sortOrder || (items.length + 1)),
    visible: visible === false ? 'false' : 'true',
  });
  Items.save(items);
  res.json({ ok: true });
});

app.put('/api/admin/items/:id', requireAdmin, (req, res) => {
  const items = Items.all();
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, priceInr, akmValue, sortOrder, visible } = req.body || {};
  if (name !== undefined) items[idx].name = String(name);
  if (priceInr !== undefined) items[idx].priceInr = String(priceInr);
  if (akmValue !== undefined) items[idx].akmValue = String(akmValue);
  if (sortOrder !== undefined) items[idx].sortOrder = String(sortOrder);
  if (visible !== undefined) items[idx].visible = visible ? 'true' : 'false';
  Items.save(items);
  res.json({ ok: true });
});

app.delete('/api/admin/items/:id', requireAdmin, (req, res) => {
  const items = Items.all().filter(i => i.id !== req.params.id);
  Items.save(items);
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

// ---------- Public verify (for Discord bot / Minecraft plugin) ----------
// Marks the code as used on the FIRST successful verify; subsequent calls fail.
app.get('/api/verify-code/:code', (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ status: 'error', message: 'Code required' });
  const orders = Orders.all();
  const idx = orders.findIndex(o => o.code && o.code.toUpperCase() === code.toUpperCase());
  if (idx === -1) return res.status(404).json({ status: 'error', message: 'Code not found' });
  const o = orders[idx];
  if (o.status !== 'paid') return res.status(400).json({ status: 'error', message: 'Code not active' });
  if (o.used === 'true') return res.status(400).json({ status: 'error', message: 'Code already redeemed' });
  orders[idx].used = 'true';
  Orders.save(orders);
  res.json({ status: 'success', code: o.code, value: Number(o.akmValue), itemName: o.itemName });
});

// SPA fallback - serve index.html for non-API routes
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = Number(process.env.PORT) || 5000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AKMSMP running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
