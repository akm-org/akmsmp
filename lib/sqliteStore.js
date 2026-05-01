// Uses Node.js 22+ built-in SQLite (node:sqlite) — no native npm package needed.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'akmsmp.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    isAdmin    INTEGER DEFAULT 0,
    discordId  TEXT UNIQUE,
    createdAt  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    priceInr   REAL NOT NULL,
    akmValue   INTEGER NOT NULL,
    sortOrder  INTEGER DEFAULT 0,
    visible    INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    userId     TEXT,
    itemId     TEXT,
    itemName   TEXT,
    priceInr   REAL,
    akmValue   INTEGER,
    utr        TEXT DEFAULT '',
    code       TEXT DEFAULT '',
    status     TEXT DEFAULT 'awaiting_utr',
    used       INTEGER DEFAULT 0,
    expiresAt  INTEGER,
    createdAt  INTEGER NOT NULL,
    decidedAt  INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// node:sqlite returns [Object: null prototype] — convert to plain objects
function toPlain(row) {
  if (!row) return null;
  return Object.assign({}, row);
}

// Wrap prepare so we always get plain objects back
const _prep = db.prepare.bind(db);
db.query = (sql) => {
  const stmt = _prep(sql);
  return {
    get: (...args) => toPlain(stmt.get(...args)),
    all: (...args) => (stmt.all(...args) || []).map(toPlain),
    run: (...args) => stmt.run(...args),
  };
};

// ---------- CSV migration (one-time import from old CSV files) ----------
function migrateCsv() {
  const csvFile = (name) => path.join(DATA_DIR, name);
  const parseCsv = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
      const cols = line.split(',');
      const obj = {};
      headers.forEach((h, i) => obj[h.trim()] = (cols[i] || '').trim());
      return obj;
    });
  };

  const usersCsv = parseCsv(csvFile('users.csv'));
  if (usersCsv && usersCsv.length > 0 && db.query('SELECT COUNT(*) as n FROM users').get().n === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO users (id,email,passwordHash,isAdmin,createdAt) VALUES (?,?,?,?,?)');
    for (const u of usersCsv) {
      ins.run(u.id, u.email, u.passwordHash, u.isAdmin === 'true' ? 1 : 0, Number(u.createdAt) || Date.now());
    }
    fs.renameSync(csvFile('users.csv'), csvFile('users.csv.bak'));
    console.log(`[migrate] Imported ${usersCsv.length} users from CSV`);
  }

  const ordersCsv = parseCsv(csvFile('orders.csv'));
  if (ordersCsv && ordersCsv.length > 0 && db.query('SELECT COUNT(*) as n FROM orders').get().n === 0) {
    const ins = db.prepare(`INSERT OR IGNORE INTO orders
      (id,userId,itemId,itemName,priceInr,akmValue,utr,code,status,used,createdAt,decidedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const o of ordersCsv) {
      ins.run(o.id, o.userId, o.itemId, o.itemName, Number(o.priceInr)||0,
        Number(o.akmValue)||0, o.utr||'', o.code||'', o.status||'awaiting_utr',
        o.used === 'true' ? 1 : 0, Number(o.createdAt)||Date.now(),
        o.decidedAt ? Number(o.decidedAt) : null);
    }
    fs.renameSync(csvFile('orders.csv'), csvFile('orders.csv.bak'));
    console.log(`[migrate] Imported ${ordersCsv.length} orders from CSV`);
  }

  const itemsCsv = parseCsv(csvFile('items.csv'));
  if (itemsCsv && itemsCsv.length > 0 && db.query('SELECT COUNT(*) as n FROM items').get().n === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO items (id,name,priceInr,akmValue,sortOrder,visible) VALUES (?,?,?,?,?,?)');
    for (const i of itemsCsv) {
      ins.run(i.id, i.name, Number(i.priceInr)||0, Number(i.akmValue)||0, Number(i.sortOrder)||0, i.visible === 'false' ? 0 : 1);
    }
    fs.renameSync(csvFile('items.csv'), csvFile('items.csv.bak'));
    console.log(`[migrate] Imported ${itemsCsv.length} items from CSV`);
  }

  const settingsCsv = parseCsv(csvFile('settings.csv'));
  if (settingsCsv && settingsCsv.length > 0 && db.query('SELECT COUNT(*) as n FROM settings').get().n === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
    for (const s of settingsCsv) ins.run(s.key, s.value);
    fs.renameSync(csvFile('settings.csv'), csvFile('settings.csv.bak'));
    console.log(`[migrate] Imported ${settingsCsv.length} settings from CSV`);
  }
}

migrateCsv();

module.exports = db;
