const base = require('./playwright.config');
module.exports = { ...base, testMatch: '**/keyless.spec.js', webServer: { ...base.webServer, env: { BROWSER_NO_AI: 'true' } } };
