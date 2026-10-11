const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', testMatch: '**/{explorer,landing}.spec.js', workers: 1, timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:5098', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node server/e2e/browser-server.js', url: 'http://127.0.0.1:5098/api/health', reuseExistingServer: false },
});
