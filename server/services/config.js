const path = require('node:path');

function integer(name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = process.env[name] === undefined || process.env[name] === '' ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
const production = process.env.NODE_ENV === 'production';
if (production && (process.env.ALLOW_DEV_AUTH_FALLBACK === 'true' || process.env.FAKE_LLM === 'true')) {
  throw new Error('Development authentication and fake AI responses must be disabled in production');
}
module.exports = {
  integer,
  production,
  port: integer('PORT', 5000, 0, 65535),
  sessionTtl: integer('SESSION_TTL_HOURS', 24, 1, 168) * 3600000,
  jobTimeout: integer('JOB_TIMEOUT_SECONDS', 600, 10, 3600) * 1000,
  maxQueued: integer('MAX_PENDING_JOBS', 20, 1, 100),
  maxUserJobs: integer('MAX_USER_PENDING_JOBS', 2, 1, 10),
  uploadBytes: integer('ZIP_MAX_UPLOAD_BYTES', 50 * 1024 * 1024, 1024, 100 * 1024 * 1024),
  uploadDir: process.env.UPLOAD_DIR || path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'codelens.db')), 'uploads'),
};
