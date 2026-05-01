const db = require('./sqliteStore');
const bcrypt = require('bcryptjs');

const PERMANENT_ADMIN_EMAILS = [
  'adwaithkm896@gmail.com',
  'akmsmpadmin@gmail.com',
];

const DEFAULT_ITEMS = [
  { id: 'pack_10k',  name: '10,000 AKM Dollars',  priceInr: 100,  akmValue: 10000,  sortOrder: 1 },
  { id: 'pack_25k',  name: '25,000 AKM Dollars',  priceInr: 225,  akmValue: 25000,  sortOrder: 2 },
  { id: 'pack_50k',  name: '50,000 AKM Dollars',  priceInr: 400,  akmValue: 50000,  sortOrder: 3 },
  { id: 'pack_100k', name: '100,000 AKM Dollars', priceInr: 750,  akmValue: 100000, sortOrder: 4 },
];

const DEFAULT_SETTINGS = [
  { key: 'upiId',             value: 'akmsmp@upi' },
  { key: 'upiName',           value: 'AKMSMP' },
  { key: 'serverName',        value: 'AKMSMP' },
  { key: 'qrImagePath',       value: '' },
  { key: 'mcPlayerCount',     value: '0' },
  { key: 'mcPlayerCountUpdated', value: '' },
  { key: 'mcPlayerList',      value: '' },
];

// ---- Row mapping (SQLite INTEGER booleans → string 'true'/'false' for API compat) ----
function mapUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash,
    isAdmin: u.isAdmin ? 'true' : 'false',
    discordId: u.discordId || '',
    createdAt: String(u.createdAt),
  };
}

function mapItem(i) {
  if (!i) return null;
  return {
    id: i.id,
    name: i.name,
    priceInr: String(i.priceInr),
    akmValue: String(i.akmValue),
    sortOrder: String(i.sortOrder),
    visible: i.visible ? 'true' : 'false',
  };
}

function mapOrder(o) {
  if (!o) return null;
  return {
    id: o.id,
    userId: o.userId || '',
    itemId: o.itemId || '',
    itemName: o.itemName || '',
    priceInr: String(o.priceInr || 0),
    akmValue: String(o.akmValue || 0),
    utr: o.utr || '',
    code: o.code || '',
    status: o.status || 'awaiting_utr',
    used: o.used ? 'true' : 'false',
    expiresAt: o.expiresAt ? String(o.expiresAt) : '',
    createdAt: String(o.createdAt),
    decidedAt: o.decidedAt ? String(o.decidedAt) : '',
  };
}

// ---- Seed ----
async function seedAdmins() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'akm2009@';
  for (const email of PERMANENT_ADMIN_EMAILS) {
    const existing = db.query('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      if (!existing.isAdmin) db.prepare('UPDATE users SET isAdmin = 1 WHERE email = ?').run(email);
    } else {
      const hash = await bcrypt.hash(seedPassword, 10);
      const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      db.prepare('INSERT OR IGNORE INTO users (id,email,passwordHash,isAdmin,createdAt) VALUES (?,?,?,1,?)').run(id, email, hash, Date.now());
    }
  }
}

function seedDefaults() {
  if (db.query('SELECT COUNT(*) as n FROM items').get().n === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO items (id,name,priceInr,akmValue,sortOrder,visible) VALUES (?,?,?,?,?,1)');
    for (const i of DEFAULT_ITEMS) ins.run(i.id, i.name, i.priceInr, i.akmValue, i.sortOrder);
  }
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  for (const s of DEFAULT_SETTINGS) ins.run(s.key, s.value);
}

function init() {
  seedDefaults();
  seedAdmins().catch(err => console.error('[seedAdmins] failed:', err));
}

// ---- Users ----
const Users = {
  all: () => db.query('SELECT * FROM users ORDER BY createdAt').all().map(mapUser),
  findByEmail: (email) => mapUser(db.query('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).toLowerCase())),
  findById: (id) => mapUser(db.query('SELECT * FROM users WHERE id = ?').get(id)),
  findByDiscordId: (discordId) => mapUser(db.query('SELECT * FROM users WHERE discordId = ?').get(discordId)),
  add: (user) => {
    db.prepare('INSERT INTO users (id,email,passwordHash,isAdmin,discordId,createdAt) VALUES (?,?,?,?,?,?)').run(
      user.id, user.email, user.passwordHash, user.isAdmin === 'true' ? 1 : 0,
      user.discordId || null, Number(user.createdAt) || Date.now()
    );
  },
  setDiscordId: (userId, discordId) => db.prepare('UPDATE users SET discordId = ? WHERE id = ?').run(discordId, userId),
  setAdmin: (userId, isAdmin) => db.prepare('UPDATE users SET isAdmin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId),
};

// ---- Items ----
const Items = {
  all: () => db.query('SELECT * FROM items ORDER BY sortOrder').all().map(mapItem),
  visible: () => db.query('SELECT * FROM items WHERE visible = 1 ORDER BY sortOrder').all().map(mapItem),
  findById: (id) => mapItem(db.query('SELECT * FROM items WHERE id = ?').get(id)),
  add: (item) => {
    db.prepare('INSERT INTO items (id,name,priceInr,akmValue,sortOrder,visible) VALUES (?,?,?,?,?,?)').run(
      item.id, item.name, Number(item.priceInr), Number(item.akmValue),
      Number(item.sortOrder)||0, item.visible === 'false' ? 0 : 1
    );
  },
  update: (id, fields) => {
    const allowed = { name: 'text', priceInr: 'num', akmValue: 'num', sortOrder: 'num', visible: 'bool' };
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed[k]) continue;
      sets.push(`${k} = ?`);
      if (allowed[k] === 'bool') vals.push(v ? 1 : 0);
      else if (allowed[k] === 'num') vals.push(Number(v));
      else vals.push(String(v));
    }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  delete: (id) => db.prepare('DELETE FROM items WHERE id = ?').run(id),
};

// ---- Orders ----
const Orders = {
  all: () => db.query('SELECT * FROM orders ORDER BY createdAt DESC').all().map(mapOrder),
  findById: (id) => mapOrder(db.query('SELECT * FROM orders WHERE id = ?').get(id)),
  findByCode: (code) => {
    const norm = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rows = db.query("SELECT * FROM orders WHERE code != '' AND code IS NOT NULL").all();
    return mapOrder(rows.find(o => o.code && o.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === norm) || null);
  },
  forUser: (userId) => db.query('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(userId).map(mapOrder),
  pending: () => db.query("SELECT * FROM orders WHERE status = 'processing' ORDER BY createdAt").all().map(mapOrder),
  add: (order) => {
    db.prepare(`INSERT INTO orders (id,userId,itemId,itemName,priceInr,akmValue,utr,code,status,used,expiresAt,createdAt,decidedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      order.id, order.userId||null, order.itemId||'', order.itemName||'',
      Number(order.priceInr)||0, Number(order.akmValue)||0,
      order.utr||'', order.code||'', order.status||'awaiting_utr',
      order.used === 'true' ? 1 : 0,
      order.expiresAt ? Number(order.expiresAt) : null,
      Number(order.createdAt)||Date.now(),
      order.decidedAt ? Number(order.decidedAt) : null
    );
  },
  update: (id, fields) => {
    const types = { utr:'text', code:'text', status:'text', used:'bool', expiresAt:'num', decidedAt:'num' };
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!types[k]) continue;
      sets.push(`${k} = ?`);
      if (types[k] === 'bool') vals.push(v === 'true' || v === true ? 1 : 0);
      else if (types[k] === 'num') vals.push(v ? Number(v) : null);
      else vals.push(v);
    }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
};

// ---- Settings ----
const Settings = {
  all: () => db.query('SELECT * FROM settings').all().map(r => ({ key: r.key, value: r.value })),
  get: (key) => { const r = db.query('SELECT value FROM settings WHERE key = ?').get(key); return r ? r.value : ''; },
  set: (key, value) => db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, String(value ?? '')),
};

module.exports = { init, Users, Items, Orders, Settings, PERMANENT_ADMIN_EMAILS };
