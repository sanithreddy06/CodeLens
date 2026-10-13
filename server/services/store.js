const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { integer } = require('./config');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'codelens.db');
const MAX_ANALYSES = integer('MAX_ANALYSES', 50, 1, 10000);
let db;
function getDb() {
  if (db) return db;
  if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
  db = new DatabaseSync(DB_PATH);
  if (DB_PATH !== ':memory:') fs.chmodSync(DB_PATH, 0o600);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS policy_acceptances (email TEXT PRIMARY KEY, version TEXT NOT NULL, accepted_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_json TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS analyses (
      key TEXT PRIMARY KEY, project_name TEXT NOT NULL, source_type TEXT NOT NULL,
      input_hash TEXT NOT NULL, files_json TEXT, result_json TEXT NOT NULL,
      cached INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, input_json TEXT,
      progress_json TEXT, result_key TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);`);
  db.exec(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, sources_json TEXT NOT NULL DEFAULT '[]');
    CREATE INDEX IF NOT EXISTS idx_messages_job ON messages(job_id, id);
    CREATE TABLE IF NOT EXISTS ai_usage (email TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY(email, day));`);
  const columns = db.prepare('PRAGMA table_info(analyses)').all().map(row => row.name);
  if (!columns.includes('source_key')) db.exec('ALTER TABLE analyses ADD COLUMN source_key TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_analyses_source ON analyses(source_key)');
  return db;
}
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
function analysisKey(email, source) {
  return JSON.stringify([String(email).trim().toLowerCase(), String(source).trim().replace(/\/$/, '').replace(/\.git$/, '').toLowerCase()]);
}
function getUser(email) { return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email); }
function createUser(email, passwordHash) {
  return getDb().prepare('INSERT INTO users VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING').run(email, passwordHash, Date.now()).changes === 1;
}
function saveUser(email, passwordHash) {
  getDb().prepare('INSERT INTO users VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash').run(email, passwordHash, Date.now());
  getDb().prepare("DELETE FROM sessions WHERE json_extract(user_json, '$.email') = ?").run(email);
}
function createSession(token, user, expiresAt = Date.now() + 86400000) {
  getDb().prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), JSON.stringify(user), expiresAt);
}
function getSession(token) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE token = ?').get(digest(token));
  return row ? { user: JSON.parse(row.user_json), expiresAt: row.expires_at } : null;
}
function deleteSession(token) { getDb().prepare('DELETE FROM sessions WHERE token = ?').run(digest(token)); }
function sweepExpiredSessions() {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  if (getDb().prepare("SELECT 1 FROM sqlite_master WHERE name = 'password_resets'").get()) getDb().prepare('DELETE FROM password_resets WHERE expires_at <= ?').run(Date.now());
}
function countSessions() { return Number(getDb().prepare('SELECT COUNT(*) AS n FROM sessions').get().n); }
function analysisFromRow(row) {
  return row ? {
    key: row.key, sourceKey: row.source_key, projectName: row.project_name,
    sourceType: row.source_type, inputHash: row.input_hash,
    files: JSON.parse(row.files_json || '[]'), result: JSON.parse(row.result_json),
    cached: Boolean(row.cached), createdAt: row.created_at, updatedAt: row.updated_at,
  } : null;
}
function getAnalysis(key) { return analysisFromRow(getDb().prepare('SELECT * FROM analyses WHERE key = ?').get(key)); }
function hasAnalysis(key) { return Boolean(getDb().prepare('SELECT 1 FROM analyses WHERE key=?').get(key)); }
function checkStorageQuota(email, additionalBytes = 0) {
  const row = getDb().prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(length(CAST(files_json AS BLOB)) + length(CAST(result_json AS BLOB))),0) AS bytes FROM analyses
    WHERE key IN (SELECT result_key FROM jobs WHERE json_extract(input_json, '$.userEmail')=?)`).get(email);
  if (row.n >= integer('MAX_USER_ANALYSES', 100, 1, 10000) || row.bytes + additionalBytes > integer('MAX_USER_STORAGE_BYTES', 200 * 1024 * 1024)) {
    const error = new Error('Saved analysis storage limit reached. Delete an older analysis before importing another project.');
    error.status = 429; throw error;
  }
}
function chargeAiCall(email) {
  if (!email) return;
  const day = new Date().toISOString().slice(0, 10);
  const limit = integer('AI_DAILY_REQUEST_LIMIT', 100, 1, 100000);
  const result = getDb().prepare(`INSERT INTO ai_usage VALUES (?, ?, 1) ON CONFLICT(email, day) DO UPDATE SET calls=calls+1 WHERE calls < ?`).run(email, day, limit);
  if (!result.changes) { const error = new Error('Daily AI request allowance reached. Try again tomorrow.'); error.status = 429; throw error; }
  getDb().prepare('DELETE FROM ai_usage WHERE day < ?').run(new Date(Date.now() - 32 * 86400000).toISOString().slice(0, 10));
}
function getMessages(jobId, limit = 40) {
  return getDb().prepare('SELECT * FROM (SELECT * FROM messages WHERE job_id=? ORDER BY id DESC LIMIT ?) ORDER BY id').all(jobId, limit)
    .map(row => ({ role: row.role, text: row.text, sources: JSON.parse(row.sources_json) }));
}
function saveExchange(jobId, question, answer, sources) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const insert = db.prepare('INSERT INTO messages(job_id,role,text,sources_json) VALUES (?,?,?,?)');
    insert.run(jobId, 'user', question, '[]'); insert.run(jobId, 'ai', answer, JSON.stringify(sources));
    db.prepare('DELETE FROM messages WHERE job_id=? AND id NOT IN (SELECT id FROM messages WHERE job_id=? ORDER BY id DESC LIMIT 40)').run(jobId, jobId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function latestAnalysis(sourceKey) { return analysisFromRow(getDb().prepare('SELECT * FROM analyses WHERE source_key = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1').get(sourceKey)); }
function upsertAnalysis({ key, sourceKey = key, projectName, sourceType, inputHash, files, result, cached = false }) {
  const now = Date.now();
  getDb().prepare(`INSERT INTO analyses (key, source_key, project_name, source_type, input_hash, files_json, result_json, cached, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET
    files_json=excluded.files_json, result_json=excluded.result_json, updated_at=excluded.updated_at`)
    .run(key, sourceKey, projectName, sourceType, inputHash, JSON.stringify(files || []), JSON.stringify(result), Number(cached), now, now);
  // Saved job results are durable; only unreferenced cache entries may be evicted.
  getDb().prepare(`DELETE FROM analyses WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE result_key=analyses.key)
    AND key NOT IN (SELECT key FROM analyses WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE result_key=analyses.key) ORDER BY updated_at DESC, rowid DESC LIMIT ?)`).run(MAX_ANALYSES);
}
function jobFromRow(row) {
  return row ? { id: row.id, type: row.type, status: row.status, input: JSON.parse(row.input_json || '{}'), progress: JSON.parse(row.progress_json || '{}'), resultKey: row.result_key, error: row.error, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}
function createJob(id, type, input) {
  const now = Date.now();
  getDb().prepare("INSERT INTO jobs (id,type,status,input_json,progress_json,created_at,updated_at) VALUES (?,?,'queued',?,?,?,?)")
    .run(id, type, JSON.stringify(input), JSON.stringify({ step: 0, total: 6, message: 'Queued...' }), now, now);
}
function getJob(id) { return jobFromRow(getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id)); }
function listJobs(email, limit = 50, offset = 0) {
  return getDb().prepare("SELECT * FROM jobs WHERE json_extract(input_json, '$.userEmail') = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?").all(email, limit, offset).map(jobFromRow);
}
function pendingCount(email) {
  const query = "SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')";
  return Number((email ? getDb().prepare(query + " AND json_extract(input_json, '$.userEmail') = ?").get(email) : getDb().prepare(query).get()).n);
}
function nextJob() { return jobFromRow(getDb().prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1").get()); }
function recoverInterruptedJobs() {
  getDb().prepare("UPDATE jobs SET status='queued', updated_at=? WHERE status='running'").run(Date.now());
}
function updateJobProgress(id, progress) {
  getDb().prepare("UPDATE jobs SET progress_json=?, status='running', updated_at=? WHERE id=? AND status IN ('queued','running')").run(JSON.stringify(progress), Date.now(), id);
}
function completeJob(id, resultKey, meta = {}) {
  const job = getJob(id);
  getDb().prepare("UPDATE jobs SET status='done', result_key=?, input_json=?, progress_json=?, updated_at=? WHERE id=? AND status IN ('queued','running')")
    .run(resultKey, JSON.stringify({ ...job.input, resultMeta: meta }), JSON.stringify({ step: 6, total: 6, message: 'Analysis complete' }), Date.now(), id);
}
function failJob(id, error) {
  getDb().prepare("UPDATE jobs SET status='failed', error=?, updated_at=? WHERE id=? AND status IN ('queued','running')").run(String(error).slice(0, 1000), Date.now(), id);
}
function cancelJob(id) {
  getDb().prepare("UPDATE jobs SET status='cancelled', error='Cancelled by user', updated_at=? WHERE id=? AND status IN ('queued','running')").run(Date.now(), id);
}
function deleteJob(id) {
  const job = getJob(id);
  getDb().prepare('DELETE FROM messages WHERE job_id=?').run(id);
  getDb().prepare('DELETE FROM jobs WHERE id=?').run(id);
  if (job?.resultKey) getDb().prepare('DELETE FROM analyses WHERE key=? AND NOT EXISTS (SELECT 1 FROM jobs WHERE result_key=?)').run(job.resultKey, job.resultKey);
}
function close() { db?.close(); db = null; }
module.exports = { DB_PATH, getDb, getUser, saveUser, createUser, analysisKey, createSession, getSession, deleteSession, sweepExpiredSessions, countSessions, getAnalysis, hasAnalysis, checkStorageQuota, chargeAiCall, getMessages, saveExchange, latestAnalysis, upsertAnalysis, createJob, getJob, listJobs, pendingCount, nextJob, recoverInterruptedJobs, updateJobProgress, completeJob, failJob, cancelJob, deleteJob, close };
