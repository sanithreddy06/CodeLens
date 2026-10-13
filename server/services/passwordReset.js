const crypto = require('node:crypto');
const store = require('./store');
const auth = require('./auth');
const { hashPassword } = require('./passwords');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const message = 'If an account matches that email, a password reset link will arrive shortly.';
function database() {
  const db = store.getDb();
  db.exec('CREATE TABLE IF NOT EXISTS password_resets (token TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  return db;
}
function settings() {
  try {
    const url = new URL(process.env.PUBLIC_APP_URL);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return null;
    return process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? url : null;
  } catch { return null; }
}
async function forgot(req, res) {
  const email = auth.normalizeEmail(req.body?.email);
  if (!auth.validEmail(email)) return res.status(400).json({ error: 'Enter a complete email address.' });
  const url = settings();
  if (!url) return res.status(503).json({ error: 'Password reset emails are not available yet. Contact your workspace administrator for help.' });
  const user = store.getUser(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const db = database();
    db.prepare('DELETE FROM password_resets WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT OR REPLACE INTO password_resets VALUES (?, ?, ?, ?)').run(digest(token), email, user.password_hash, Date.now() + 15 * 60000);
    url.hash = `reset-password?token=${token}`;
    try {
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: 'Reset your CodeLens password', text: `Reset your password using this link:\n\n${url.href}\n\nThis link expires in 15 minutes and can only be used once. If you did not request this, you can ignore this email.` }),
      });
      if (!result.ok) throw new Error('Email delivery failed');
    } catch {
      db.prepare('DELETE FROM password_resets WHERE token = ?').run(digest(token));
      console.error('Password reset email delivery failed. Check email provider configuration.');
    }
  }
  return res.json({ message });
}
let active = 0;
async function reset(req, res) {
  const { token, password } = req.body || {};
  const invalid = () => res.status(400).json({ error: 'This reset link is invalid or expired. Request a new link.' });
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return invalid();
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) return res.status(400).json({ error: 'Use a password with 12–256 characters.' });
  const db = database();
  if (!db.prepare('SELECT 1 FROM password_resets WHERE token = ? AND expires_at > ?').get(digest(token), Date.now())) return invalid();
  if (active >= 2) return res.status(429).json({ error: 'Please try again shortly.' });
  active++;
  try {
    const hash = await hashPassword(password);
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('DELETE FROM password_resets WHERE token = ? AND expires_at > ? RETURNING *').get(digest(token), Date.now());
      if (!row || store.getUser(row.email)?.password_hash !== row.password_hash) { db.exec('COMMIT'); return invalid(); }
      store.saveUser(row.email, hash);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return res.json({ message: 'Your password has been updated. Sign in with your new password.' });
  } finally { active--; }
}
module.exports = { forgot, reset };
