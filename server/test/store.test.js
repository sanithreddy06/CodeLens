// Unit tests for the SQLite persistence layer (node:test + node:sqlite, no deps).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Use a throwaway DB and a small analysis cap for the eviction test.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codelens-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.MAX_ANALYSES = "3";

const store = require("../services/store");

test("sessions: create, read, delete", () => {
  store.createSession("tok-1", { email: "a@b.com" }, Date.now() + 60000);
  const session = store.getSession("tok-1");
  assert.ok(session);
  assert.strictEqual(session.user.email, "a@b.com");
  assert.ok(session.expiresAt > Date.now());

  assert.strictEqual(store.getSession("missing"), null);

  store.deleteSession("tok-1");
  assert.strictEqual(store.getSession("tok-1"), null);
});

test("sessions: expired sessions are swept", () => {
  store.createSession("tok-expired", { email: "x@y.com" }, Date.now() - 1000);
  store.createSession("tok-live", { email: "x@y.com" }, Date.now() + 60000);
  store.sweepExpiredSessions();
  assert.strictEqual(store.getSession("tok-expired"), null);
  assert.ok(store.getSession("tok-live"));
});

test("analyses: upsert + read roundtrip, keyed by repo URL", () => {
  store.upsertAnalysis({
    key: "https://github.com/a/b",
    projectName: "b",
    sourceType: "github",
    inputHash: "abc123",
    files: [{ path: "index.js", content: "x", sha: "s1" }],
    result: { summary: "hello", chapters: [] },
    cached: false,
  });

  const analysis = store.getAnalysis("https://github.com/a/b");
  assert.ok(analysis);
  assert.strictEqual(analysis.projectName, "b");
  assert.strictEqual(analysis.inputHash, "abc123");
  assert.strictEqual(analysis.files[0].content, "x");
  assert.strictEqual(analysis.result.summary, "hello");
});

test("analyses: cache stays bounded (oldest evicted)", () => {
  for (let i = 0; i < 5; i++) {
    store.upsertAnalysis({
      key: `repo-${i}`,
      projectName: `p${i}`,
      sourceType: "github",
      inputHash: `h${i}`,
      files: [],
      result: { summary: `s${i}` },
      cached: false,
    });
  }
  assert.strictEqual(store.getAnalysis("repo-0"), null); // evicted (oldest)
  assert.ok(store.getAnalysis("repo-4"));
});

test("jobs: full lifecycle", () => {
  store.createJob("job-1", "github", { repoUrl: "https://github.com/a/b", userEmail: "a@b.com" });
  let job = store.getJob("job-1");
  assert.strictEqual(job.status, "queued");
  assert.strictEqual(job.input.repoUrl, "https://github.com/a/b");

  store.updateJobProgress("job-1", { step: 1, total: 6, message: "Fetching..." });
  job = store.getJob("job-1");
  assert.strictEqual(job.status, "running");
  assert.strictEqual(job.progress.step, 1);

  store.completeJob("job-1", "https://github.com/a/b");
  job = store.getJob("job-1");
  assert.strictEqual(job.status, "done");
  assert.strictEqual(job.resultKey, "https://github.com/a/b");

  store.createJob("job-2", "zip", { bytes: 1, userEmail: "a@b.com" });
  store.failJob("job-2", "boom");
  job = store.getJob("job-2");
  assert.strictEqual(job.status, "failed");
  assert.strictEqual(job.error, "boom");
});
test("account-scoped analysis keys are stable and isolated", () => {
  assert.strictEqual(store.analysisKey('A@B.com', 'https://github.com/a/b.git'), store.analysisKey('a@b.com', 'https://github.com/a/b/'));
  assert.notStrictEqual(store.analysisKey('a@b.com', 'zip:hash'), store.analysisKey('other@b.com', 'zip:hash'));
});

test("job metadata persists and interrupted jobs requeue on recovery", () => {
  store.createJob('completed-meta', 'zip', { userEmail: 'a@b.com' });
  store.completeJob('completed-meta', 'zip:hash', { cached: true, unchangedCount: 2 });
  assert.strictEqual(store.getJob('completed-meta').input.resultMeta.cached, true);
  store.createJob('interrupted', 'zip', {});
  store.updateJobProgress('interrupted', { step: 2 });
  store.recoverInterruptedJobs();
  assert.strictEqual(store.getJob('interrupted').status, 'queued');
  assert.strictEqual(store.getJob('completed-meta').status, 'done');
});
test('saved analyses survive unrelated cache eviction and history paginates', () => {
  store.upsertAnalysis({ key: 'saved', sourceKey: 'account', projectName: 'saved', sourceType: 'zip', inputHash: 'saved', files: [], result: {} });
  store.createJob('saved-job', 'zip', { userEmail: 'saved@example.com' });
  store.completeJob('saved-job', 'saved');
  for (let i = 0; i < 8; i++) store.upsertAnalysis({ key: `unrelated-${i}`, projectName: 'p', sourceType: 'zip', inputHash: String(i), files: [], result: {} });
  assert.ok(store.getAnalysis('saved'));
  store.createJob('saved-job-2', 'zip', { userEmail: 'saved@example.com' });
  assert.equal(store.listJobs('saved@example.com', 1).length, 1);
  assert.equal(store.listJobs('saved@example.com', 1, 1)[0].id, 'saved-job');
});
test('conversations persist and are deleted with their job', () => {
  store.saveExchange('saved-job', 'Question', 'Answer [S1]', [{ id: 'S1', path: 'index.js' }]);
  assert.equal(store.getMessages('saved-job').length, 2);
  store.deleteJob('saved-job');
  assert.deepEqual(store.getMessages('saved-job'), []);
});
test('daily AI budget cannot be exceeded and accounts have separate allowances', () => {
  process.env.AI_DAILY_REQUEST_LIMIT = '2';
  store.chargeAiCall('one@example.com'); store.chargeAiCall('one@example.com');
  assert.throws(() => store.chargeAiCall('one@example.com'), /allowance/);
  assert.doesNotThrow(() => store.chargeAiCall('two@example.com'));
  delete process.env.AI_DAILY_REQUEST_LIMIT;
});
test('cached jobs report their own revision and coverage without mutating cached content', () => {
  store.upsertAnalysis({ key: 'revision-cache', projectName: 'p', sourceType: 'github', inputHash: 'same-files', files: [], result: { revision: 'old', coverage: { totalFiles: 1 } } });
  store.createJob('revision-job', 'github', { userEmail: 'revision@example.com' });
  store.completeJob('revision-job', 'revision-cache', { cached: true, revision: 'new', coverage: { totalFiles: 2 } });
  const view = require('../services/jobRunner').getJobView('revision-job', 'revision@example.com');
  assert.equal(view.result.revision, 'new');
  assert.equal(view.result.coverage.totalFiles, 2);
  assert.equal(store.getAnalysis('revision-cache').result.revision, 'old');
});
test('storage quotas are isolated by account', () => {
  process.env.MAX_USER_ANALYSES = '1';
  assert.throws(() => store.checkStorageQuota('revision@example.com'), /storage limit/);
  assert.doesNotThrow(() => store.checkStorageQuota('empty@example.com'));
  delete process.env.MAX_USER_ANALYSES;
});
