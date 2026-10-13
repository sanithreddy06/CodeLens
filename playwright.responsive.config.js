const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', testMatch: '**/responsive.spec.js', workers: 1, timeout: 120000,
  use: { baseURL: 'http://127.0.0.1:5098', trace: 'retain-on-failure' },
  webServer: { command: 'node server/e2e/browser-server.js', url: 'http://127.0.0.1:5098/api/health', reuseExistingServer: false },
});
