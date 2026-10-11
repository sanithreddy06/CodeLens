const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./store');
const config = require('./config');
const operation = require('./operationContext');
const { runFullAnalysisFromFiles } = require('./aiService');
const { fetchRepoTree, fetchFileContents, parseRepoUrl } = require('./githubService');
const { extractZipToFiles } = require('./zipService');
const { redactFiles } = require('./secrets');
const { aiAvailability, requireAi } = require('./aiAvailability');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const PIPELINE_VERSION = '4';
const fingerprint = digest(JSON.stringify([PIPELINE_VERSION, aiAvailability().enabled, process.env.FAKE_LLM === 'true', ...['LLM_PROVIDER', 'GEMINI_MODEL', 'OPENAI_MODEL', 'GROQ_MODEL', 'OPENROUTER_MODEL', 'ANALYSIS_MAX_CHAPTERS', 'USE_LLM_CHAPTER_ORDER'].map(key => process.env[key] || '')]));
let running = null;
let stopping = false;
function uploadPath(id) { return path.join(config.uploadDir, `${id}.zip`); }
function removeUpload(id) { try { fs.unlinkSync(uploadPath(id)); } catch (error) { if (error.code !== 'ENOENT') console.error('Could not remove upload:', id); } }
function checkCapacity(email) {
  if (store.pendingCount() >= config.maxQueued || store.pendingCount(email) >= config.maxUserJobs) {
    const error = new Error('Analysis queue limit reached. Wait for an existing job to finish.');
    error.status = 429;
    throw error;
  }
}
function createRetryJob(previousJob, userEmail) {
  requireAi();
  checkCapacity(userEmail);
  const result = store.getAnalysis(previousJob.resultKey)?.result;
  if (previousJob.input.userEmail !== userEmail || previousJob.status !== 'done' || !(result?.analysisWarning || result?.aiUnavailable)) {
    const error = new Error('Only incomplete tutorials can be retried.'); error.status = 409; throw error;
  }
  const id = crypto.randomUUID();
  store.createJob(id, 'retry', { userEmail, resultKey: previousJob.resultKey, filename: previousJob.input.filename, repoUrl: previousJob.input.repoUrl });
  pump(); return id;
}
function createGithubJob(repoUrl, userEmail) {
  checkCapacity(userEmail);
  const { owner, repo } = parseRepoUrl(repoUrl);
  const canonical = `https://github.com/${owner}/${repo}`;
  const id = crypto.randomUUID();
  store.createJob(id, 'github', { repoUrl: canonical, userEmail });
  pump();
  return id;
}
function createZipJob(buffer, userEmail, filename = 'project.zip') {
  checkCapacity(userEmail);
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    const error = new Error('Upload a valid, nonempty ZIP archive.'); error.status = 400; throw error;
  }
  const id = crypto.randomUUID();
  fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(uploadPath(id), buffer, { mode: 0o600, flag: 'wx' });
  try { store.createJob(id, 'zip', { userEmail, bytes: buffer.length, filename: path.basename(filename).slice(0, 160) }); }
  catch (error) { removeUpload(id); throw error; }
  pump();
  return id;
}
async function execute(job) {
  const progress = message => { operation.check(); store.updateJobProgress(job.id, { step: 1, total: 6, message }); };
  progress('Loading project files...');
  let files, sourceKey, inputHash, projectName, revision, coverage, changedCount, unchangedCount, previousResult;
  if (job.type === 'retry') {
    const previous = store.getAnalysis(job.input.resultKey);
    if (!previous) throw new Error('Source analysis is no longer available. Import the project again.');
    ({ files, sourceKey, inputHash, projectName } = previous);
    previousResult = previous.result;
    ({ revision, coverage } = previousResult);
    changedCount = 0; unchangedCount = files.length;
  } else if (job.type === 'github') {
    const tree = await fetchRepoTree(job.input.repoUrl, process.env.GITHUB_TOKEN || null);
    ({ projectName, revision, coverage } = tree);
    sourceKey = store.analysisKey(job.input.userEmail, job.input.repoUrl);
    inputHash = digest(JSON.stringify(tree.entries.map(e => [e.path, e.sha]).sort()));
    const key = digest(JSON.stringify([sourceKey, inputHash, fingerprint]));
    const hit = store.getAnalysis(key);
    previousResult = hit?.result;
    if (hit && !hit.result.analysisWarning) {
      store.completeJob(job.id, key, { cached: true, changedCount: 0, unchangedCount: tree.entries.length, revision, coverage }); return;
    }
    const previous = store.latestAnalysis(sourceKey);
    const byPath = new Map((previous?.files || []).map(file => [file.path, file]));
    const changed = tree.entries.filter(entry => byPath.get(entry.path)?.sha !== entry.sha);
    const fetched = await fetchFileContents(tree.owner, tree.repo, tree.branch, changed, process.env.GITHUB_TOKEN || null, progress);
    const fresh = new Map(fetched.map(file => [file.path, file]));
    files = tree.entries.map(entry => fresh.get(entry.path) || (byPath.get(entry.path)?.sha === entry.sha ? byPath.get(entry.path) : null)).filter(Boolean);
    if (files.length !== tree.entries.length) throw new Error('Some files could not be downloaded. Please retry.');
    changedCount = changed.length; unchangedCount = files.length - changedCount;
  } else {
    const buffer = await fs.promises.readFile(uploadPath(job.id));
    inputHash = digest(buffer);
    projectName = String(job.input.filename || 'project.zip').replace(/\.zip$/i, '') || 'project';
    // Generated explanations include the project name; a renamed archive must
    // not inherit another upload's name or name-specific tutorial content.
    sourceKey = store.analysisKey(job.input.userEmail, `zip:${inputHash}:${projectName}`);
    const key = digest(JSON.stringify([sourceKey, inputHash, fingerprint]));
    const hit = store.getAnalysis(key);
    previousResult = hit?.result;
    if (hit && !hit.result.analysisWarning) { store.completeJob(job.id, key, { cached: true, changedCount: 0, unchangedCount: hit.files.length }); return; }
    const extracted = await extractZipToFiles(buffer, progress);
    ({ files, coverage } = extracted);
    changedCount = files.length; unchangedCount = 0;
  }
  operation.check();
  const redaction = redactFiles(files);
  files = redaction.files;
  if (!previousResult) store.checkStorageQuota(job.input.userEmail, Buffer.byteLength(JSON.stringify(files)) * 2 + 200000);
  const result = await runFullAnalysisFromFiles(projectName, files, p => {
    operation.check();
    store.updateJobProgress(job.id, { ...p, step: Math.min(p.step, 5), total: 6 });
  }, previousResult);
  operation.check();
  Object.assign(result, { revision: revision || inputHash, coverage, redactedValues: redaction.redactedValues + (previousResult?.redactedValues || 0), demoMode: process.env.FAKE_LLM === 'true' });
  const key = digest(JSON.stringify([sourceKey, inputHash, fingerprint]));
  store.updateJobProgress(job.id, { step: 6, total: 6, message: 'Saving analysis...' });
  store.upsertAnalysis({ key, sourceKey, projectName, sourceType: job.type, inputHash, files, result });
  store.completeJob(job.id, key, { cached: false, changedCount, unchangedCount, revision: result.revision, coverage });
}
function pump() {
  if (running || stopping) return;
  const job = store.nextJob();
  if (!job) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Analysis exceeded the time limit. Try a smaller repository.')), config.jobTimeout);
  const promise = operation.run(controller.signal, () => execute(job), { userEmail: job.input.userEmail }).catch(error => {
    if (!stopping) store.failJob(job.id, controller.signal.aborted ? controller.signal.reason.message : (error.code === 'ENOENT' ? 'Upload is missing. Please upload the project again.' : error.message));
  }).finally(() => {
    clearTimeout(timer);
    if (job.type === 'zip' && !['queued', 'running'].includes(store.getJob(job.id)?.status)) removeUpload(job.id);
    running = null;
    pump();
  });
  running = { id: job.id, controller, promise };
}
function start() {
  stopping = false;
  // Remove uploads left behind between file creation and job insertion or completion.
  if (fs.existsSync(config.uploadDir)) for (const name of fs.readdirSync(config.uploadDir)) {
    if (!/^[a-f0-9-]{36}\.zip$/.test(name)) continue;
    const id = name.slice(0, -4);
    if (!['queued', 'running'].includes(store.getJob(id)?.status)) removeUpload(id);
  }
  store.recoverInterruptedJobs(); pump();
}
async function stop() {
  stopping = true;
  running?.controller.abort(new Error('Server shutting down'));
  await running?.promise;
}
function cancel(id) {
  store.cancelJob(id);
  if (running?.id === id) running.controller.abort(new Error('Cancelled by user'));
  else removeUpload(id);
}
function getJobView(id, email, includeResult = true) {
  const job = store.getJob(id);
  if (!job || job.input.userEmail !== email) return null;
  const view = { id, type: job.type, status: job.status, progress: job.progress, error: job.error, createdAt: job.createdAt, updatedAt: job.updatedAt, repoUrl: job.input.repoUrl || null, name: job.input.filename || job.input.repoUrl, cached: Boolean(job.input.resultMeta?.cached), stats: job.input.resultMeta || {} };
  if (job.status === 'done') {
    const analysis = includeResult ? store.getAnalysis(job.resultKey) : store.hasAnalysis(job.resultKey);
    if (analysis && includeResult) view.result = { ...analysis.result, revision: job.input.resultMeta?.revision || analysis.result.revision, coverage: job.input.resultMeta?.coverage || analysis.result.coverage };
    if (!analysis) { view.status = 'expired'; view.error = 'This analysis is no longer available. Please analyze again.'; }
  }
  return view;
}
module.exports = { createRetryJob, createGithubJob, createZipJob, getJobView, checkCapacity, start, stop, cancel, uploadPath };
