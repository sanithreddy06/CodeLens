const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRepoUrl, shouldIncludeFile } = require('../services/githubService');
const { isSafeZipPath, extractZipToFiles } = require('../services/zipService');

test('repository URLs preserve dotted names and reject lookalike hosts', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/user/project.name.git'), { owner: 'user', repo: 'project.name' });
  for (const url of ['https://github.com.evil.com/a/b', 'http://github.com/a/b', 'https://evil.com/github.com/a/b', 'https://github.com/a/b/tree/main', 'https://user:pass@github.com/a/b']) {
    assert.throws(() => parseRepoUrl(url));
  }
});

test('ingestion excludes environment secrets but keeps example configuration', () => {
  for (const name of ['.env', 'server/.env.local', 'client/.env.production', 'private.key', 'node_modules/example.js']) assert.equal(shouldIncludeFile(name), false);
  assert.equal(shouldIncludeFile('server/.env.example'), true);
  assert.equal(shouldIncludeFile('src/index.ts'), true);
  for (const file of ['requirements.txt', 'src/main.mjs', 'src/helper.cjs', 'src/index.mts']) assert.equal(shouldIncludeFile(file), true);
});

test('archive paths reject traversal and absolute paths', () => {
  for (const name of ['../secret.js', '/secret.js', 'C:\\secret.js', '..\\secret.js']) assert.equal(isSafeZipPath(name), false);
  assert.equal(isSafeZipPath('project/src/index.js'), true);
});

test('malformed archives fail explicitly', async () => {
  await assert.rejects(extractZipToFiles(Buffer.from('not a zip')));
});
