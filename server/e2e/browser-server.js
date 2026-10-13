const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens-browser-'));
Object.assign(process.env, { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '5098', SERVE_CLIENT: 'true', FAKE_LLM: process.env.BROWSER_NO_AI === 'true' ? 'false' : 'true',
  RESEND_API_KEY: '', EMAIL_FROM: '', PUBLIC_APP_URL: '', AI_MODE: 'auto', LLM_PROVIDER: 'GEMINI', GEMINI_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
  LOGIN_USERS: 'browser@example.com:browser-test-password,desktop@example.com:browser-test-password,mobile@example.com:browser-test-password', MEMBER_EMAILS: '', DB_PATH: path.join(directory, 'test.db'), UPLOAD_DIR: path.join(directory, 'uploads'),
  CHAPTER_DELAY_MS: '1500', ALLOWED_ORIGINS: '', MAX_USER_PENDING_JOBS: '2' });
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
require('../index').start().catch(error => { console.error(error); process.exitCode = 1; });
