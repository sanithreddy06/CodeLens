const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aiAvailability, requireAi } = require('../services/aiAvailability');
test('missing keys and placeholders disable AI without exposing credentials', () => {
  Object.assign(process.env, { NODE_ENV: 'production', FAKE_LLM: 'false', AI_MODE: 'auto', LLM_PROVIDER: 'GEMINI', GEMINI_API_KEY: '' });
  assert.equal(aiAvailability().enabled, false);
  assert.throws(requireAi, error => error.status === 503);
  process.env.GEMINI_API_KEY = 'your-api-key';
  assert.equal(aiAvailability().enabled, false);
  process.env.GEMINI_API_KEY = 'test-configured-key';
  assert.equal(aiAvailability().enabled, true);
  assert.ok(!JSON.stringify(aiAvailability()).includes('test-configured-key'));
  process.env.AI_MODE = 'disabled';
  assert.equal(aiAvailability().enabled, false);
});
test('stored keyless imports can generate tutorials after AI is enabled', async () => {
  Object.assign(process.env, { NODE_ENV: 'test', FAKE_LLM: 'false', AI_MODE: 'auto', GEMINI_API_KEY: '' });
  const { runFullAnalysisFromFiles } = require('../services/aiService');
  const files = [{ path: 'index.js', content: 'export const value = 1;' }];
  const initial = await runFullAnalysisFromFiles('keyless', files);
  assert.equal(initial.aiUnavailable, true);
  assert.equal(initial.analysisWarning, undefined);
  process.env.FAKE_LLM = 'true';
  const upgraded = await runFullAnalysisFromFiles('keyless', files, null, initial);
  assert.ok(upgraded.chapters.length > 0);
  assert.equal(upgraded.aiUnavailable, undefined);
});
