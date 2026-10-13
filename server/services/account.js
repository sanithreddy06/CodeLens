const store = require('./store');
const { verifyPassword } = require('./passwords');
async function reauthenticate(req, res, next) {
  const user = store.getUser(req.user.email);
  if (!user || !await verifyPassword(req.body?.password, user.password_hash)) return res.status(403).json({ error: 'Enter your current password to continue.' });
  // Recheck after asynchronous hashing, in case another request reset/deleted the account.
  if (store.getUser(req.user.email)?.password_hash !== user.password_hash) return res.status(403).json({ error: 'Your account changed. Sign in again.' });
  req.accountHash = user.password_hash;
  next();
}
function revokeOtherSessions(email, currentToken) {
  const crypto = require('node:crypto');
  const digest = crypto.createHash('sha256').update(currentToken).digest('hex');
  store.getDb().prepare("DELETE FROM sessions WHERE json_extract(user_json, '$.email') = ? AND token != ?").run(email, digest);
}
function remove(email) {
  const db = store.getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const job of store.listJobs(email, -1)) store.deleteJob(job.id);
    // Include superseded/unreferenced cache versions owned by the account.
    db.prepare("DELETE FROM analyses WHERE json_valid(source_key) AND json_extract(source_key, '$[0]') = ?").run(email);
    db.prepare("DELETE FROM sessions WHERE json_extract(user_json, '$.email') = ?").run(email);
    db.prepare('DELETE FROM ai_usage WHERE email = ?').run(email);
    db.prepare('DELETE FROM policy_acceptances WHERE email = ?').run(email);
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'password_resets'").get()) db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    db.prepare('DELETE FROM users WHERE email = ?').run(email);
    db.exec('COMMIT');
    require('./retrieval').clearIndexes();
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
async function exportData(req, res) {
  const email = req.user.email;
  const db = store.getDb();
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="codelens-data.json"' });
  const write = async value => {
    if (res.destroyed) throw new Error('Export disconnected');
    if (!res.write(value)) await new Promise((resolve, reject) => {
      const cleanup = () => { res.off('drain', done); res.off('close', closed); };
      const done = () => { cleanup(); resolve(); };
      const closed = () => { cleanup(); reject(new Error('Export disconnected')); };
      res.once('drain', done); res.once('close', closed);
    });
  };
  const user = store.getUser(email);
  await write(JSON.stringify({ exportedAt: new Date().toISOString(), account: { email, createdAt: user.created_at }, policies: db.prepare('SELECT version, accepted_at FROM policy_acceptances WHERE email = ?').all(email), aiUsage: db.prepare('SELECT day, calls FROM ai_usage WHERE email = ?').all(email) }).slice(0, -1) + ',"projects":[');
  let comma = '';
  for (const job of store.listJobs(email, -1)) {
    await write(comma + JSON.stringify({ ...job, messages: store.getMessages(job.id, -1), analysis: store.getAnalysis(job.resultKey) }));
    comma = ',';
  }
  await write('],"cachedAnalyses":[');
  comma = '';
  const cached = db.prepare("SELECT key FROM analyses WHERE json_valid(source_key) AND json_extract(source_key, '$[0]') = ? AND NOT EXISTS (SELECT 1 FROM jobs WHERE result_key = analyses.key)").all(email);
  for (const row of cached) { await write(comma + JSON.stringify(store.getAnalysis(row.key))); comma = ','; }
  res.end(']}');
}
module.exports = { reauthenticate, revokeOtherSessions, remove, exportData };
