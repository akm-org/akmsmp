const { readCsv, writeCsv, appendCsv } = require('./csvStore');

const USER_HEADERS = ['id', 'email', 'passwordHash', 'isAdmin', 'createdAt'];
const ITEM_HEADERS = ['id', 'name', 'priceInr', 'akmValue', 'sortOrder', 'visible'];
const ORDER_HEADERS = ['id', 'userId', 'itemId', 'itemName', 'priceInr', 'akmValue', 'utr', 'status', 'code', 'used', 'createdAt', 'decidedAt'];
const SETTING_HEADERS = ['key', 'value'];

const DEFAULT_ITEMS = [
  { id: 'pack_10k',   name: '10,000 AKM Dollars',  priceInr: '100',  akmValue: '10000',  sortOrder: '1', visible: 'true' },
  { id: 'pack_25k',   name: '25,000 AKM Dollars',  priceInr: '225',  akmValue: '25000',  sortOrder: '2', visible: 'true' },
  { id: 'pack_50k',   name: '50,000 AKM Dollars',  priceInr: '400',  akmValue: '50000',  sortOrder: '3', visible: 'true' },
  { id: 'pack_100k',  name: '100,000 AKM Dollars', priceInr: '750',  akmValue: '100000', sortOrder: '4', visible: 'true' },
];

const DEFAULT_SETTINGS = [
  { key: 'upiId',        value: 'akmsmp@upi' },
  { key: 'upiName',      value: 'AKMSMP' },
  { key: 'serverName',   value: 'AKMSMP' },
  { key: 'qrImagePath',  value: '' },
];

function init() {
  const items = readCsv('items.csv', ITEM_HEADERS);
  if (items.length === 0) writeCsv('items.csv', ITEM_HEADERS, DEFAULT_ITEMS);

  const settings = readCsv('settings.csv', SETTING_HEADERS);
  if (settings.length === 0) writeCsv('settings.csv', SETTING_HEADERS, DEFAULT_SETTINGS);

  const users = readCsv('users.csv', USER_HEADERS);
  if (users.length === 0) writeCsv('users.csv', USER_HEADERS, []);

  const orders = readCsv('orders.csv', ORDER_HEADERS);
  if (orders.length === 0) writeCsv('orders.csv', ORDER_HEADERS, []);
}

const Users = {
  all: () => readCsv('users.csv', USER_HEADERS),
  findByEmail: (email) => readCsv('users.csv', USER_HEADERS).find(u => u.email.toLowerCase() === String(email).toLowerCase()),
  findById: (id) => readCsv('users.csv', USER_HEADERS).find(u => u.id === id),
  add: (user) => appendCsv('users.csv', USER_HEADERS, user),
  save: (rows) => writeCsv('users.csv', USER_HEADERS, rows),
};

const Items = {
  all: () => readCsv('items.csv', ITEM_HEADERS),
  visible: () => readCsv('items.csv', ITEM_HEADERS).filter(i => i.visible !== 'false').sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
  findById: (id) => readCsv('items.csv', ITEM_HEADERS).find(i => i.id === id),
  save: (rows) => writeCsv('items.csv', ITEM_HEADERS, rows),
};

const Orders = {
  all: () => readCsv('orders.csv', ORDER_HEADERS),
  findById: (id) => readCsv('orders.csv', ORDER_HEADERS).find(o => o.id === id),
  findByCode: (code) => readCsv('orders.csv', ORDER_HEADERS).find(o => o.code && o.code.toUpperCase() === String(code).toUpperCase()),
  forUser: (userId) => readCsv('orders.csv', ORDER_HEADERS).filter(o => o.userId === userId).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
  pending: () => readCsv('orders.csv', ORDER_HEADERS).filter(o => o.status === 'processing').sort((a, b) => Number(a.createdAt) - Number(b.createdAt)),
  add: (order) => appendCsv('orders.csv', ORDER_HEADERS, order),
  save: (rows) => writeCsv('orders.csv', ORDER_HEADERS, rows),
};

const Settings = {
  all: () => readCsv('settings.csv', SETTING_HEADERS),
  get: (key) => {
    const row = readCsv('settings.csv', SETTING_HEADERS).find(s => s.key === key);
    return row ? row.value : '';
  },
  set: (key, value) => {
    const rows = readCsv('settings.csv', SETTING_HEADERS);
    const idx = rows.findIndex(s => s.key === key);
    if (idx === -1) rows.push({ key, value });
    else rows[idx].value = value;
    writeCsv('settings.csv', SETTING_HEADERS, rows);
  },
};

module.exports = { init, Users, Items, Orders, Settings, USER_HEADERS, ITEM_HEADERS, ORDER_HEADERS, SETTING_HEADERS };
