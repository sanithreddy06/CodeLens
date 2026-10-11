const crypto = require('node:crypto');
const store = require('./store');
const config = require('./config');
const { aiAvailability } = require('./aiAvailability');
const { hashPassword, verifyPassword } = require('./passwords');
const COOKIE = 'codelens_session';
let dummyHash;
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value) && value.length <= 254;
async function initialize() {
  dummyHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
  // Bootstrap only missing accounts. Password changes use the account command.
  for (const entry of String(process.env.LOGIN_USERS || '').split(',').filter(Boolean)) {
    const index = entry.indexOf(':');
    const email = normalizeEmail(entry.slice(0, index));
    const password = entry.slice(index + 1);
    if (index < 1 || !validEmail(email)) throw new Error('LOGIN_USERS contains an invalid account');
    if (!store.getUser(email)) store.saveUser(email, await hashPassword(password));
  }
  if (config.production && !store.getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n) {
    throw new Error('Create an account before deployment: set LOGIN_USERS=email:password (12–256 characters), or run the account creation command against this database.');
  }
}
function allowedMember(email) {
  const emails = String(process.env.MEMBER_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean);
  return !emails.length || emails.includes(email);
}
function cookieOptions() {
  return { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/api', maxAge: config.sessionTtl };
}
function readToken(req) {
  const entry = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  const token = entry?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}
const csrfToken = token => crypto.createHash('sha256').update(`csrf:${token}`).digest('hex');
async function login(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!validEmail(email) || typeof password !== 'string' || !password || password.length > 256) return res.status(400).json({ error: 'Enter a valid email and password (up to 256 characters).' });
  const user = store.getUser(email);
  const valid = await verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!allowedMember(email)) return res.status(403).json({ error: 'This account does not have access.' });
  const previous = readToken(req);
  if (previous) store.deleteSession(previous);
  const token = crypto.randomBytes(32).toString('hex');
  const publicUser = { email, name: email.split('@')[0] };
  store.createSession(token, publicUser, Date.now() + config.sessionTtl);
  res.cookie(COOKIE, token, cookieOptions());
  return res.json({ success: true, user: publicUser, csrfToken: csrfToken(token), ai: aiAvailability() });
}
function required(req, res, next) {
  const token = readToken(req);
  const session = token && store.getSession(token);
  if (!session || session.expiresAt <= Date.now() || !store.getUser(session.user.email) || !allowedMember(session.user.email)) {
    if (token) store.deleteSession(token);
    res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  req.user = session.user;
  req.sessionToken = token;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== csrfToken(token)) return res.status(403).json({ error: 'Invalid request token. Refresh the page and try again.' });
  next();
}
function me(req, res) { res.json({ success: true, user: req.user, csrfToken: csrfToken(req.sessionToken), ai: aiAvailability() }); }
function logout(req, res) {
  store.deleteSession(req.sessionToken);
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ success: true });
}
module.exports = { initialize, login, required, me, logout, normalizeEmail, validEmail };
