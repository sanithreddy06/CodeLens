require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
require('dotenv').config();
const path = require('node:path');
const { createBackup } = require('../services/backup');
try {
  if (!process.argv[2]) throw new Error('Usage: npm run db:backup -- /absolute/path/backup.db');
  const source = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'codelens.db');
  const target = createBackup(source, process.argv[2]);
  console.log(`Database backup saved to ${target}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
