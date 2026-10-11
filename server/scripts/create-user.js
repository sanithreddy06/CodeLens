require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
require('dotenv').config();
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { hashPassword } = require('../services/passwords');
const { normalizeEmail, validEmail } = require('../services/auth');
const store = require('../services/store');
async function main() {
  const email = normalizeEmail(process.argv[2]);
  if (!validEmail(email)) throw new Error('Usage: npm run user:create -- you@example.com');
  let muted = false;
  const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  try {
    process.stdout.write('Password (12–256 characters, hidden): ');
    muted = true;
    const password = await rl.question('');
    process.stdout.write('\n');
    store.saveUser(email, await hashPassword(password));
    console.log(`Account saved for ${email}. Existing sessions have been revoked.`);
  } finally { rl.close(); store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
