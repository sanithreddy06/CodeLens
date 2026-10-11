const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.FAKE_LLM = 'true';
const { retrieveSources, validateCitations } = require('../services/retrieval');
const { redactContent } = require('../services/secrets');
const { computeRepoMetrics } = require('../services/repoMetrics');
const { parseAbstractions, parseRelationships, runPool, runFullAnalysisFromFiles } = require('../services/aiService');
const operation = require('../services/operationContext');

test('retrieval scores returned text and finds matches after large lines', () => {
  const files = [{ path: 'src/handler.js', content: 'x'.repeat(1800) + '\nfunction authenticate() {}\n' }];
  const sources = retrieveSources(files, 'authenticate');
  assert.equal(sources[0].startLine, 2);
  assert.ok(sources[0].content.includes('authenticate'));
  assert.ok(sources.every(source => source.content.includes('authenticate')));
});
test('retrieval finds bounded fragments of long lines and useful overview files', () => {
  const files = [{ path: 'min.js', content: 'x'.repeat(2000) + ' rareSymbol ' + 'x'.repeat(2000) }, { path: 'README.md', content: '# Greeting application' }];
  const source = retrieveSources(files, 'rareSymbol')[0];
  assert.equal(source.startLine, 1);
  assert.equal(source.startColumn, 1601);
  assert.equal(source.content, files[0].content.slice(source.startColumn - 1, source.endColumn));
  assert.equal(retrieveSources(files, 'Explain the architecture')[0].path, 'README.md');
  assert.equal(validateCitations('See [S1] and [S9]', [{ id: 'S1' }]), 'See [S1] and [unverified source]');
});
test('exact symbols rank ahead of incidental substring matches', () => {
  const sources = retrieveSources([{ path: 'README.md', content: 'A greeting app' }, { path: 'src/index.js', content: 'function greet() {}' }], 'Where is greet implemented?');
  assert.equal(sources[0].path, 'src/index.js');
});
test('parser handles exports, side effects, dynamic imports, aliases, and built-ins', () => {
  const files = [
    { path: 'src/main.ts', content: `import './setup'; export { x } from './value.js'; const f = () => import('@/value'); const fs = require('node:fs'); // require('fake')\n` },
    { path: 'src/setup.js', content: 'class Setup { run() {} }' },
    { path: 'src/value.ts', content: 'export const x = 1' },
    { path: 'tsconfig.json', content: '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}' },
    { path: 'requirements.txt', content: 'requests>=2\n# comment\n' },
  ];
  const result = computeRepoMetrics(files);
  assert.ok(result.graph.edges.some(edge => edge.target === 'src/value.ts'));
  assert.ok(result.graph.edges.some(edge => edge.target === 'src/setup.js'));
  assert.ok(result.graph.nodes.some(node => node.id === 'builtin:fs'));
  assert.ok(!result.externalDeps.includes('fs') && !result.externalDeps.includes('fake'));
  assert.ok(result.externalDeps.includes('requests'));
  assert.equal(result.metrics.functions, 2);
  assert.equal(result.metrics.classes, 1);
  assert.equal(result.graph.edges.filter(edge => edge.target === 'src/value.ts').length, 1);
});
test('structured output rejects invalid schemas and invented file references', () => {
  assert.throws(() => parseAbstractions('[{"name":"A","description":"B","file_indices":[99]}]', [0]));
  assert.throws(() => parseAbstractions('not json', [0]));
  assert.throws(() => parseRelationships('{"summary":"s","relationships":[{"from_abstraction":0,"to_abstraction":9,"label":"Uses"}]}', 1));
  assert.equal(parseAbstractions('[{"name":"A","description":"B","file_indices":[0]}]', [0])[0].name, 'A');
});
test('chapter pool waits for remaining workers and retains successful results', async () => {
  let finished = false;
  const result = await runPool([0, 1], 2, async index => {
    if (!index) throw new Error('provider failed');
    await operation.sleep(10); finished = true; return 'chapter';
  });
  assert.equal(finished, true);
  assert.equal(result[0].status, 'rejected');
  assert.equal(result[1].value, 'chapter');
});
test('operation cancellation interrupts sleep and isolates concurrent contexts', async () => {
  const a = new AbortController(), b = new AbortController();
  const first = operation.run(a.signal, () => operation.sleep(10000), { userEmail: 'a' });
  const second = operation.run(b.signal, async () => { await operation.sleep(5); return operation.userEmail(); }, { userEmail: 'b' });
  a.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(await second, 'b');
});
test('redaction removes recognizable secrets while preserving line numbers', () => {
  const input = `const token = "ghp_${'a'.repeat(36)}";\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\nconst x=1;`;
  const result = redactContent(input);
  assert.equal(result.count, 2);
  assert.equal(result.content.split('\n').length, input.split('\n').length);
  assert.ok(!result.content.includes('ghp_') && !result.content.includes('\nsecret\n'));
});
test('retrying an incomplete tutorial reuses completed chapters', async () => {
  const files = [{ path: 'index.js', content: 'export function main() {}' }];
  const previous = { chapters: [{ number: 1, name: 'Entry Point', content: 'Preserved original chapter', files: ['index.js'] }],
    analysisPlan: { abstractions: [{ name: 'Entry Point', description: 'Entry', files: [0] }, { name: 'Utility', description: 'Utility', files: [0] }], relationships: { summary: 'Summary', details: [] }, chapterOrder: [0, 1] } };
  const result = await runFullAnalysisFromFiles('demo', files, null, previous);
  assert.equal(result.chapters[0].content, 'Preserved original chapter');
  assert.equal(result.chapters.length, 2);
  assert.equal(result.failedChapters.length, 0);
});
