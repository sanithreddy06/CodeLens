const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../services/passwords');
const { rateLimit } = require('../services/rateLimit');
const { retrieveSources } = require('../services/retrieval');
const { makeZip } = require('./zipFixture.cjs');
const { extractZipToFiles } = require('../services/zipService');

test('passwords use unique salts and reject wrong credentials', async () => {
  const one = await hashPassword('a-long-test-password');
  const two = await hashPassword('a-long-test-password');
  assert.notEqual(one, two);
  assert.equal(await verifyPassword('a-long-test-password', one), true);
  assert.equal(await verifyPassword('wrong', one), false);
  assert.equal(await verifyPassword('password', 'invalid'), false);
  await assert.rejects(hashPassword('short'));
});

test('rate limits block repeated requests and reset at the window boundary', () => {
  let now = 0, passed = 0, code;
  const limit = rateLimit({ limit: 2, windowMs: 1000, now: () => now });
  const req = { ip: '127.0.0.1' };
  const res = { set() {}, status(value) { code = value; return this; }, json() {} };
  for (let i = 0; i < 3; i++) limit(req, res, () => passed++);
  assert.equal(passed, 2); assert.equal(code, 429);
  now = 1000; limit(req, res, () => passed++); assert.equal(passed, 3);
});

test('retrieval returns actual source lines and no invented matches', () => {
  const files = [{ path: 'auth.js', content: '// helpers\nexport function authenticate() {}\n' }, { path: 'other.js', content: 'console.log("hello")' }];
  const sources = retrieveSources(files, 'Where is authenticate?');
  assert.equal(sources[0].path, 'auth.js');
  assert.equal(sources[0].content, files[0].content);
  assert.equal(sources[0].startLine, 1);
  assert.deepEqual(retrieveSources(files, 'unknownxyz'), []);
});

test('ZIP extraction enforces actual inflated size despite forged metadata', async () => {
  const zip = makeZip({ 'bomb.js': 'x'.repeat(120000) });
  // Forge the central-directory uncompressed size to bypass the initial filter.
  const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt32LE(1, central + 24);
  await assert.rejects(extractZipToFiles(zip), /size limits/);
});
