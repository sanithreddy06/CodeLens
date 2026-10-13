const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens-signup-'));
process.env.DB_PATH = path.join(directory, 'test.db');
const auth = require('../services/auth');
const store = require('../services/store');
const { verifyPassword } = require('../services/passwords');
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, cookie() {} }; }
test('signup validates addresses and never overwrites an existing password', async () => {
  try {
    for (const email of ['a@gmail.com', 'student+code@university.edu', 'first.last@example.co.uk']) assert.equal(auth.validEmail(email), true);
    for (const email of ['a@gmail', 'a@@gmail.com', '.a@gmail.com', 'a..b@gmail.com', 'a@-gmail.com', 'a@g_mail.com', 'a@gmail.com.', 'a @gmail.com']) assert.equal(auth.validEmail(email), false);
    const request = { headers: {}, body: { termsVersion: '2026-10-14', ageConfirmed: true, email: ' New@Gmail.com ', password: 'a-secure-password' } };
    const missingPolicy = response(); await auth.signup({ ...request, body: { ...request.body, termsVersion: undefined } }, missingPolicy); assert.equal(missingPolicy.code, 400);
    const first = response(); await auth.signup(request, first); assert.equal(first.code, 201); assert.equal(first.body.user.email, 'new@gmail.com'); assert.ok(first.body.csrfToken);
    const duplicate = response(); await auth.signup({ ...request, body: { ...request.body, password: 'different-password' } }, duplicate); assert.equal(duplicate.code, 409);
    assert.equal(await verifyPassword('a-secure-password', store.getUser('new@gmail.com').password_hash), true);
    const short = response(); await auth.signup({ ...request, body: { email: 'other@gmail.com', password: 'short' } }, short); assert.equal(short.code, 400);
    process.env.MEMBER_EMAILS = 'allowed@example.com';
    const restricted = response(); await auth.signup({ ...request, body: { email: 'other@gmail.com', password: 'a-secure-password' } }, restricted); assert.equal(restricted.code, 403);
  } finally { delete process.env.MEMBER_EMAILS; store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
