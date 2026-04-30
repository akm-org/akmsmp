const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Users } = require('./db');

const SECRET = process.env.SESSION_SECRET || 'akmsmp-dev-secret-change-me';
const COOKIE_NAME = 'akmsmp_sess';

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return null; }
}

function setSession(res, userId) {
  const token = sign({ userId, t: Date.now() });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

function getUser(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const payload = verify(token);
  if (!payload || !payload.userId) return null;
  return Users.findById(payload.userId) || null;
}

function requireAuth(req, res, next) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  if (u.isAdmin !== 'true') return res.status(403).json({ error: 'Admin only' });
  req.user = u;
  next();
}

async function hash(password) { return bcrypt.hash(password, 10); }
async function compare(password, hashStr) { return bcrypt.compare(password, hashStr); }

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

module.exports = { setSession, clearSession, getUser, requireAuth, requireAdmin, hash, compare, adminEmails };
