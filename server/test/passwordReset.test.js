const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
const store = require('../services/store');
const reset = require('../services/passwordReset');
const { hashPassword, verifyPassword } = require('../services/passwords');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('recovery delivers a single-use link, revokes sessions, and rejects expired or superseded credentials', async () => {
  const originalFetch = global.fetch;
  let delivery;
  try {
    delete process.env.RESEND_API_KEY;
    let res = response(); await reset.forgot({ body: { email: 'person@example.com' } }, res); assert.equal(res.code, 503);
    Object.assign(process.env, { RESEND_API_KEY: 'test-only', EMAIL_FROM: 'CodeLens <support@example.com>', PUBLIC_APP_URL: 'https://example.com' });
    global.fetch = async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); delivery = JSON.parse(options.body); return { ok: true }; };
    store.createUser('person@example.com', await hashPassword('original-password'));
    store.createSession('old-session', { email: 'person@example.com' });
    res = response(); await reset.forgot({ body: { email: 'person@example.com' } }, res);
    const token = delivery.text.match(/token=([a-f0-9]{64})/)[1];
    const unknown = response(); await reset.forgot({ body: { email: 'unknown@example.com' } }, unknown); assert.deepEqual(unknown.body, res.body);
    assert.equal(JSON.stringify(res.body).includes(token), false);
    assert.notEqual(store.getDb().prepare('SELECT token FROM password_resets').get().token, token);
    res = response(); await reset.reset({ body: { token, password: 'new-secure-password' } }, res); assert.equal(res.code, 200);
    assert.equal(await verifyPassword('new-secure-password', store.getUser('person@example.com').password_hash), true);
    assert.equal(store.getSession('old-session'), null);
    res = response(); await reset.reset({ body: { token, password: 'another-password' } }, res); assert.equal(res.code, 400);
    await reset.forgot({ body: { email: 'person@example.com' } }, response());
    let nextToken = delivery.text.match(/token=([a-f0-9]{64})/)[1];
    store.getDb().prepare('UPDATE password_resets SET expires_at = 0').run();
    res = response(); await reset.reset({ body: { token: nextToken, password: 'another-password' } }, res); assert.equal(res.code, 400);
    await reset.forgot({ body: { email: 'person@example.com' } }, response());
    nextToken = delivery.text.match(/token=([a-f0-9]{64})/)[1];
    store.saveUser('person@example.com', await hashPassword('admin-changed-password'));
    res = response(); await reset.reset({ body: { token: nextToken, password: 'another-password' } }, res); assert.equal(res.code, 400);
    assert.equal(await verifyPassword('admin-changed-password', store.getUser('person@example.com').password_hash), true);
  } finally { global.fetch = originalFetch; store.close(); }
});
