const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createBackup } = require('../services/backup');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens-backup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, source: path.join(directory, 'source.db'), target: path.join(directory, 'backup.db') };
}

test('backup includes committed WAL data and publishes a private, valid snapshot', t => {
  const { directory, source, target } = fixture(t);
  const live = new DatabaseSync(source);
  t.after(() => live.close());
  live.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE records (value TEXT); INSERT INTO records VALUES ('committed');");
  assert.equal(createBackup(source, target), target);
  const backup = new DatabaseSync(target, { readOnly: true });
  try {
    assert.equal(backup.prepare('SELECT value FROM records').get().value, 'committed');
    assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { backup.close(); }
  if (process.platform !== 'win32') assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(directory).some(name => name.startsWith('.codelens-backup-')), false);
  // The backup command does not initialize application tables in the source.
  assert.deepEqual(live.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name), ['records']);
});

test('missing source fails without creating a database or destination', t => {
  const { source, target } = fixture(t);
  assert.throws(() => createBackup(source, target));
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.existsSync(target), false);
});

test('existing destination and source-as-destination are never overwritten', t => {
  const { source, target } = fixture(t);
  const database = new DatabaseSync(source);
  database.exec('CREATE TABLE records (value TEXT)');
  database.close();
  fs.writeFileSync(target, 'keep this backup');
  assert.throws(() => createBackup(source, target), /already exists/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep this backup');
  assert.throws(() => createBackup(source, source), /differ/);
});

test('corrupt source fails without publishing a snapshot or leaving temporary data', t => {
  const { directory, source, target } = fixture(t);
  fs.writeFileSync(source, 'not a sqlite database');
  assert.throws(() => createBackup(source, target));
  assert.equal(fs.existsSync(target), false);
  assert.deepEqual(fs.readdirSync(directory), ['source.db']);
});
