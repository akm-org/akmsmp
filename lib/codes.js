const crypto = require('crypto');
const { Orders } = require('./db');

// 16-character alphanumeric, no ambiguous chars (0/O/1/I), uppercase only.
// Stored flat; displayed in groups of 4 for readability: XXXX-XXXX-XXXX-XXXX
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 16;

function genCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Pretty-print with dashes: XXXX-XXXX-XXXX-XXXX
function formatCode(code) {
  return code.match(/.{1,4}/g).join('-');
}

function uniqueCode() {
  for (let i = 0; i < 50; i++) {
    const c = genCode();
    if (!Orders.findByCode(c)) return c;
  }
  throw new Error('Could not generate unique code after 50 tries');
}

module.exports = { uniqueCode, formatCode };
