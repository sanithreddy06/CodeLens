const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.LOGIN_USERS = '';
process.env.MEMBER_EMAILS = '';
const store = require('../services/store');
const auth = require('../services/auth');
const { hashPassword } = require('../services/passwords');
const { app } = require('../index');
test('account controls require reauthentication, export only owned data, revoke sessions, and erase data', async () => {
  await auth.initialize();
  const hash = await hashPassword('account-test-password');
  store.createUser('owner@example.com', hash); store.createUser('other@example.com', hash);
  store.createSession('other-session', { email: 'owner@example.com' });
  store.createSession('unrelated-session', { email: 'other@example.com' });
  store.createJob('owner-job', 'zip', { userEmail: 'owner@example.com' });
  store.upsertAnalysis({ key: 'owner-analysis', sourceKey: store.analysisKey('owner@example.com', 'project'), projectName: 'mine', sourceType: 'zip', inputHash: 'x', files: [{ path: 'a.js', content: 'private code' }], result: {} });
  store.completeJob('owner-job', 'owner-analysis');
  store.createJob('other-job', 'zip', { userEmail: 'other@example.com' }); store.failJob('other-job', 'example');
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie, csrf;
  async function request(route, body, extra = {}) { return fetch(base + '/api' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeLens-Request': '1', ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}), ...extra }, body: JSON.stringify(body) }); }
  try {
    const login = await request('/auth/login', { email: 'owner@example.com', password: 'account-test-password' });
    assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0]; csrf = (await login.json()).csrfToken;
    assert.match(login.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(login.headers.get('permissions-policy'), /camera=\(\)/);
    assert.equal((await request('/account/export', { password: 'wrong-password' })).status, 403);
    const exported = await request('/account/export', { password: 'account-test-password' }); assert.equal(exported.status, 200);
    const data = await exported.json(); assert.equal(data.account.email, 'owner@example.com'); assert.equal(data.projects.length, 1); assert.equal(data.projects[0].analysis.files[0].content, 'private code'); assert.equal(JSON.stringify(data).includes('password_hash'), false);
    assert.equal((await request('/account/sessions/revoke', { password: 'account-test-password' })).status, 200);
    assert.equal(store.getSession('other-session'), null); assert.ok(store.getSession('unrelated-session'));
    assert.equal((await request('/account/delete', { password: 'account-test-password', confirmation: 'DELETE' }, { 'X-CSRF-Token': 'bad' })).status, 403);
    assert.equal((await request('/account/delete', { password: 'account-test-password', confirmation: 'DELETE' }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/account/delete', { password: 'account-test-password', confirmation: 'DELETE' })).status, 200);
    assert.equal(store.getUser('owner@example.com'), undefined); assert.equal(store.getJob('owner-job'), null); assert.equal(store.getAnalysis('owner-analysis'), null); assert.ok(store.getUser('other@example.com')); assert.ok(store.getJob('other-job'));
    assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
