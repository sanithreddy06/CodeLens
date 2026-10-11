// Production configuration smoke test: no AI keys, no fake provider, temporary data.
// An optional URL targets an ephemeral CI container configured with the test account.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { makeZip } = require('../test/zipFixture.cjs');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens-production-'));
let server;
let base = process.argv[2];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  server = spawn(process.execPath, ['server/start-production.js'], { cwd: path.join(__dirname, '../..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DB_PATH: path.join(temporary, 'production.db'), UPLOAD_DIR: path.join(temporary, 'uploads'),
      LOGIN_USERS: 'production-test@example.com:production-test-password', MEMBER_EMAILS: '', FAKE_LLM: 'false', ALLOW_DEV_AUTH_FALLBACK: 'false',
      AI_MODE: 'auto', LLM_PROVIDER: 'GEMINI', GEMINI_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
      SERVE_CLIENT: 'true', ALLOWED_ORIGINS: '', TRUST_PROXY_HOPS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(`Production server failed: ${logs}`);
    const port = logs.match(/CodeLens listening on port (\d+)/)?.[1];
    if (port) { base = `http://127.0.0.1:${port}`; return; }
    await pause(100);
  }
  throw new Error('Production startup timed out');
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode) return;
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM'); await exited;
}
async function main() {
  try {
    if (!base) await start();
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/api/ready`)).ok) break; } catch { /* Container starting. */ }
      if (i === 99) throw new Error('Container readiness timed out');
      await pause(100);
    }
    assert.equal((await fetch(`${base}/api/ready`)).status, 200);
    const html = await (await fetch(base)).text();
    assert.match(html, /<title>CodeLens<\/title>/);
    const script = html.match(/src="([^"]+\.js)"/)[1];
    assert.equal((await fetch(new URL(script, base))).status, 200);
    let cookie, csrf;
    async function request(route, method = 'GET', body) {
      const form = body instanceof FormData;
      return fetch(`${base}/api${route}`, { method, signal: AbortSignal.timeout(10000), headers: {
        'X-CodeLens-Request': '1', ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
        ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
      }, body: form ? body : body ? JSON.stringify(body) : undefined });
    }
    const login = await request('/auth/login', 'POST', { email: 'production-test@example.com', password: 'production-test-password' });
    assert.equal(login.status, 200);
    const session = await login.json();
    assert.equal(session.ai.enabled, false);
    assert.match(login.headers.get('set-cookie'), /Secure/);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    cookie = login.headers.get('set-cookie').split(';')[0]; csrf = session.csrfToken;
    const archive = makeZip({ 'index.js': 'export function hello() { return "world"; }', 'README.md': '# Production fixture' });
    const body = new FormData(); body.append('zip', new Blob([archive]), 'no-key.zip');
    const submitted = await request('/analyze-zip', 'POST', body);
    assert.equal(submitted.status, 202);
    const id = (await submitted.json()).jobId;
    let job;
    for (let i = 0; i < 100; i++) {
      job = (await (await request(`/jobs/${id}`)).json()).job;
      if (!['queued', 'running'].includes(job.status)) break;
      await pause(100);
    }
    assert.equal(job.status, 'done');
    assert.equal(job.result.aiUnavailable, true);
    assert.equal(job.result.demoMode, false);
    assert.equal(job.result.analysisWarning, undefined);
    assert.equal(job.result.metrics.files, 2);
    assert.equal(job.result.metrics.functions, 1);
    assert.deepEqual(job.result.chapters, []);
    assert.equal((await request(`/jobs/${id}/source?path=index.js`)).status, 200);
    const unavailable = await request('/chat', 'POST', { jobId: id, message: 'hello' });
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).code, 'AI_NOT_CONFIGURED');
    assert.equal((await request(`/jobs/${id}/retry`, 'POST')).status, 503);
    if (server) {
      await stop(); await start();
      assert.equal((await request('/auth/me')).status, 200);
      assert.equal((await (await request(`/jobs/${id}`)).json()).job.status, 'done');
    }
    console.log('Production smoke passed: built frontend, readiness, secure login, keyless import/source, AI gating, and persistence (when locally managed).');
  } finally { await stop(); fs.rmSync(temporary, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
