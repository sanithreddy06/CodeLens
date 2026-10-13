require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const config = require('./services/config');
const store = require('./services/store');
const auth = require('./services/auth');
const jobs = require('./services/jobRunner');
const operation = require('./services/operationContext');
const { aiAvailability, requireAi } = require('./services/aiAvailability');
const { rateLimit } = require('./services/rateLimit');
const { chatWithCodebase } = require('./services/aiService');
const { retrieveSources, sourceContext, validateCitations } = require('./services/retrieval');
const { parseRepoUrl } = require('./services/githubService');
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', config.integer('TRUST_PROXY_HOPS', 0, 0, 5));
const allowedOrigins = new Set(String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
function trustedOrigin(req, origin) {
  if (!origin) return true; // Non-browser callers still need the custom header and session CSRF token.
  return origin === `${req.protocol}://${req.get('host')}` || allowedOrigins.has(origin);
}
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.set({ 'X-Request-Id': req.requestId, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000');
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  if (!trustedOrigin(req, req.get('origin'))) return res.status(403).json({ error: 'Origin is not allowed.' });
  next();
});
app.use(cors({ origin: (origin, cb) => cb(null, origin || false), credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CodeLens-Request') !== '1') return res.status(403).json({ error: 'Missing request header.' });
  next();
});
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const loginIpLimit = rateLimit({ limit: 30, windowMs: 15 * 60000, key: req => req.ip });
const loginAccountLimit = rateLimit({ limit: 10, windowMs: 15 * 60000, key: req => auth.normalizeEmail(req.body?.email) });
const passwordReset = require('./services/passwordReset');
app.post('/api/auth/forgot-password', rateLimit({ limit: 5, windowMs: 15 * 60000, key: req => req.ip }), rateLimit({ limit: 3, windowMs: 15 * 60000, key: req => auth.normalizeEmail(req.body?.email) }), asyncRoute(passwordReset.forgot));
app.post('/api/auth/reset-password', rateLimit({ limit: 10, windowMs: 15 * 60000, key: req => req.ip }), asyncRoute(passwordReset.reset));
app.post('/api/auth/signup', rateLimit({ limit: 5, windowMs: 15 * 60000, key: req => req.ip }), asyncRoute(auth.signup));
app.post('/api/auth/login', loginIpLimit, loginAccountLimit, asyncRoute(auth.login));
app.get('/api/auth/me', auth.required, auth.me);
app.post('/api/auth/logout', auth.required, auth.logout);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/ready', (req, res) => { store.getDb().prepare('SELECT 1').get(); res.json({ status: 'ready' }); });
app.use('/api', auth.required);
const analysisLimit = rateLimit({ limit: 12, windowMs: 3600000 });
app.post('/api/analyze', analysisLimit, (req, res, next) => {
  try { parseRepoUrl(req.body?.repoUrl); } catch (error) { return res.status(400).json({ error: error.message }); }
  try { res.status(202).json({ success: true, jobId: jobs.createGithubJob(req.body.repoUrl, req.user.email) }); } catch (error) { next(error); }
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadBytes, files: 1, fields: 0, parts: 2 } });
let activeUploads = 0;
app.post('/api/analyze-zip', analysisLimit, (req, res, next) => {
  try { jobs.checkCapacity(req.user.email); } catch (error) { return next(error); }
  if (activeUploads >= 2) return res.status(429).json({ error: 'Upload service is busy. Please retry shortly.' });
  activeUploads++;
  upload.single('zip')(req, res, error => {
    activeUploads--;
    if (error) return next(error);
    if (!req.file) return res.status(400).json({ error: 'A ZIP file is required.' });
    try { res.status(202).json({ success: true, jobId: jobs.createZipJob(req.file.buffer, req.user.email, req.file.originalname) }); }
    catch (err) { next(err); }
  });
});
function ownedJob(req, res, next) {
  const job = store.getJob(req.params.jobId || req.body?.jobId || '');
  if (!job || job.input.userEmail !== req.user.email) return res.status(404).json({ error: 'Analysis not found.' });
  req.job = job;
  next();
}
app.get('/api/jobs', (req, res) => {
  const offset = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ error: 'Invalid history offset.' });
  const page = store.listJobs(req.user.email, 51, offset);
  res.json({ success: true, jobs: page.slice(0, 50).map(job => jobs.getJobView(job.id, req.user.email, false)), nextOffset: page.length > 50 ? offset + 50 : null });
});
app.get('/api/jobs/:jobId', ownedJob, (req, res) => res.json({ success: true, job: jobs.getJobView(req.job.id, req.user.email) }));
app.post('/api/jobs/:jobId/retry', analysisLimit, ownedJob, (req, res, next) => {
  try { res.status(202).json({ success: true, jobId: jobs.createRetryJob(req.job, req.user.email) }); }
  catch (error) { next(error); }
});
app.get('/api/jobs/:jobId/messages', ownedJob, (req, res) => res.json({ success: true, messages: store.getMessages(req.job.id) }));
app.get('/api/jobs/:jobId/source', ownedJob, (req, res) => {
  const analysis = store.getAnalysis(req.job.resultKey);
  if (!analysis) return res.status(410).json({ error: 'Analysis is no longer available.' });
  const file = analysis.files.find(file => file.path === req.query.path);
  if (!file) return res.status(404).json({ error: 'Source file not found.' });
  res.json({ success: true, path: file.path, content: file.content, revision: req.job.input.resultMeta?.revision || analysis.result.revision });
});
app.post('/api/jobs/:jobId/cancel', ownedJob, (req, res) => {
  jobs.cancel(req.job.id);
  res.json({ success: true, job: jobs.getJobView(req.job.id, req.user.email) });
});
app.delete('/api/jobs/:jobId', ownedJob, (req, res) => {
  if (activeChats.has(req.user.email)) return res.status(409).json({ error: 'Wait for your answer to finish before deleting an analysis.' });
  if (store.pendingCount(req.user.email)) return res.status(409).json({ error: 'Wait for pending analyses to finish before deleting saved source.' });
  if (['queued', 'running'].includes(req.job.status)) return res.status(409).json({ error: 'Cancel the analysis before deleting it.' });
  store.deleteJob(req.job.id);
  res.json({ success: true });
});
const activeChats = new Set();
app.post('/api/chat', rateLimit({ limit: 30, windowMs: 60000 }), (req, res, next) => {
  if (typeof req.body?.message !== 'string' || !req.body.message.trim() || req.body.message.length > 4000 || typeof req.body.jobId !== 'string') return res.status(400).json({ error: 'A question (up to 4000 characters) and analysis ID are required.' });
  next();
}, ownedJob, asyncRoute(async (req, res) => {
  requireAi();
  if (req.job.status !== 'done') return res.status(409).json({ error: 'Wait for analysis to finish before asking questions.' });
  const analysis = store.getAnalysis(req.job.resultKey);
  if (!analysis) return res.status(410).json({ error: 'Analysis has expired. Please analyze the project again.' });
  if (activeChats.has(req.user.email)) return res.status(429).json({ error: 'Wait for your current answer to finish.' });
  if (activeChats.size >= config.integer('MAX_ACTIVE_CHATS', 4, 1, 50)) return res.status(429).json({ error: 'The answer service is busy. Please retry shortly.' });
  const history = store.getMessages(req.job.id, 6);
  const followup = /\b(it|its|that|those|they|them|this function|more|elaborate)\b/i.test(req.body.message);
  const previousQuestion = history.filter(message => message.role === 'user').at(-1)?.text || '';
  const sources = retrieveSources(analysis.files, followup ? `${previousQuestion}\n${req.body.message}` : req.body.message, 5, analysis.key);
  if (!sources.length) return res.json({ success: true, response: 'I could not find source excerpts matching this question. Try naming a file, function, or feature.', sources: [] });
  activeChats.add(req.user.email);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Answer timed out. Please try again.')), 90000);
  const disconnect = () => { if (!res.writableEnded) controller.abort(new Error('Client disconnected')); };
  res.on('close', disconnect);
  try {
    const raw = await operation.run(controller.signal, () => chatWithCodebase(req.body.message, sourceContext(analysis, sources), history), { userEmail: req.user.email });
    const response = validateCitations(raw, sources);
    if (!res.destroyed) {
      store.saveExchange(req.job.id, req.body.message, response, sources);
      res.json({ success: true, response, sources, revision: req.job.input.resultMeta?.revision || analysis.result.revision });
    }
  } catch (error) {
    if (!res.destroyed) res.status(error.status === 429 ? 429 : 502).json({ error: error.status === 429 ? error.message : 'The AI provider could not finish the answer. Please retry.', requestId: req.requestId });
    console.error(JSON.stringify({ event: 'chat_failed', requestId: req.requestId, name: error.name }));
  } finally { clearTimeout(timer); activeChats.delete(req.user.email); res.off('close', disconnect); }
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if ((process.env.SERVE_CLIENT === 'true' || (config.production && process.env.SERVE_CLIENT !== 'false')) && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof multer.MulterError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : (err.status || 500);
  const message = status < 500 || err.code === 'AI_NOT_CONFIGURED' ? (err.type === 'entity.parse.failed' ? 'Invalid JSON request.' : err.message) : 'Something went wrong. Please retry.';
  console.error(JSON.stringify({ event: 'request_failed', requestId: req.requestId, status, name: err.name }));
  res.status(status).json({ error: message, requestId: req.requestId, ...(err.code === 'AI_NOT_CONFIGURED' ? { code: err.code } : {}) });
});
async function start() {
  const ai = aiAvailability();
  if ((config.production && process.env.SERVE_CLIENT !== 'false' || process.env.SERVE_CLIENT === 'true') && !fs.existsSync(path.join(clientDist, 'index.html'))) {
    throw new Error('Frontend build missing. Run npm run build before starting this deployment.');
  }
  await auth.initialize();
  const server = app.listen(config.port, process.env.HOST || '0.0.0.0', () => {
    console.log(`CodeLens listening on port ${server.address().port}`);
    console.log(ai.enabled ? `AI provider enabled: ${ai.provider}` : 'AI not configured: source exploration is available. Add a provider key and restart to enable AI.');
    jobs.start();
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  const cleanup = setInterval(store.sweepExpiredSessions, 10 * 60000);
  cleanup.unref();
  let closing = false;
  const shutdown = async () => {
    if (closing) return; closing = true;
    server.close();
    const forced = setTimeout(() => process.exit(1), 10000); forced.unref();
    await jobs.stop();
    clearInterval(cleanup);
    // Active HTTP responses may still use storage; process exit closes SQLite.
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { app, start };
