const crypto = require('crypto');
const { Orders } = require('./db');

// 6-character alphanumeric code (uppercase, no ambiguous chars: no 0/O/1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function uniqueCode() {
  for (let i = 0; i < 50; i++) {
    const c = genCode();
    if (!Orders.findByCode(c)) return c;
  }
  throw new Error('Could not generate unique code');
}

module.exports = { uniqueCode };
