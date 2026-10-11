const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function createBackup(sourcePath, targetPath) {
  if (!sourcePath || sourcePath === ':memory:' || !fs.statSync(sourcePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error('Backup source must be an existing database file.');
  }
  const source = path.resolve(sourcePath);
  const target = path.resolve(targetPath);
  if (source === target) throw new Error('Backup destination must differ from the source database.');
  // lstat also rejects dangling symlinks, which must never be replaced.
  try {
    fs.lstatSync(target);
    throw new Error('Backup destination already exists; choose a new filename.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporaryDirectory = fs.mkdtempSync(path.join(path.dirname(target), '.codelens-backup-'));
  fs.chmodSync(temporaryDirectory, 0o700);
  const temporaryFile = path.join(temporaryDirectory, 'snapshot.db');
  let database;
  let snapshot;
  try {
    // Do not initialize tables or silently create a database at a mistyped path.
    database = new DatabaseSync(source, { readOnly: true });
    database.exec('PRAGMA busy_timeout = 5000');
    database.prepare('VACUUM INTO ?').run(temporaryFile);
    database.close();
    database = undefined;
    fs.chmodSync(temporaryFile, 0o600);
    snapshot = new DatabaseSync(temporaryFile, { readOnly: true });
    const checks = snapshot.prepare('PRAGMA integrity_check').all();
    if (checks.length !== 1 || checks[0].integrity_check !== 'ok') {
      throw new Error('Backup integrity verification failed.');
    }
    snapshot.close();
    snapshot = undefined;
    // Publish only the verified snapshot; linking fails if another writer has
    // created the destination since the initial check, without overwriting it.
    fs.linkSync(temporaryFile, target);
    return target;
  } finally {
    snapshot?.close();
    database?.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = { createBackup };
