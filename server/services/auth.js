const crypto = require('node:crypto');
const store = require('./store');
const config = require('./config');
const { aiAvailability } = require('./aiAvailability');
const { hashPassword, verifyPassword } = require('./passwords');
const COOKIE = 'codelens_session';
let dummyHash;
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && local.length <= 64 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && domain.split('.').length >= 2 && /^[a-z]{2,63}$/i.test(domain.split('.').at(-1))
    && domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}
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
  return startSession(req, res, email);
}
function startSession(req, res, email) {
  const previous = readToken(req);
  if (previous) store.deleteSession(previous);
  const token = crypto.randomBytes(32).toString('hex');
  const publicUser = { email, name: email.split('@')[0] };
  store.createSession(token, publicUser, Date.now() + config.sessionTtl);
  res.cookie(COOKIE, token, cookieOptions());
  return res.json({ success: true, user: publicUser, csrfToken: csrfToken(token), ai: aiAvailability() });
}
let registrations = 0;
async function signup(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a complete email address, such as you@gmail.com.' });
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) return res.status(400).json({ error: 'Use a password with 12–256 characters.' });
  if (!allowedMember(email)) return res.status(403).json({ error: 'Account creation is restricted for this workspace.' });
  if (registrations >= 2) return res.status(429).json({ error: 'Account creation is busy. Please try again shortly.' });
  registrations++;
  try {
    const hash = await hashPassword(password);
    if (!store.createUser(email, hash)) return res.status(409).json({ error: 'Unable to create this account. If you already have an account, sign in.' });
    res.status(201);
    return startSession(req, res, email);
  } finally { registrations--; }
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
module.exports = { initialize, login, signup, required, me, logout, normalizeEmail, validEmail };
