const { test } = require('node:test');
const assert = require('node:assert/strict');
test('architecture preserves included files, handles cycles, and safely exports hostile labels', async () => {
  const { buildArchitecture, layoutArchitecture, architectureSvg } = await import('../../client/src/config/architectureGraph.js');
  const data = { filesIndex: [{ path: 'ui/app.js' }, { path: 'api/route.js' }, { path: 'api/store.js' }], graph: {
    nodes: [{ id: 'ui/app.js', type: 'file' }, { id: 'api/route.js', type: 'file' }, { id: 'pkg:x', label: '<script>bad</script>', type: 'package' }],
    edges: [{ source: 'ui/app.js', target: 'api/route.js' }, { source: 'api/route.js', target: 'ui/app.js' }, { source: 'api/route.js', target: 'api/store.js' }, { source: 'ui/app.js', target: 'pkg:x' }],
  } };
  const folders = buildArchitecture(data);
  assert.equal(folders.ai, false); assert.equal(folders.nodes.length, 2); assert.equal(folders.edges.length, 2);
  assert.deepEqual(folders.nodes.flatMap(node => node.files).sort(), data.filesIndex.map(file => file.path).sort());
  const withPackages = buildArchitecture(data, true); assert.equal(withPackages.nodes.length, 3);
  data.analysisPlan = { abstractions: [{ name: '<script>alert("x")</script>', description: 'Unsafe text', files: [0, 0, 999] }, { name: 'Backend', description: 'Processes requests', files: [1, 2] }] };
  data.relationships = [{ from: 0, to: 1, label: 'Calls <img src=x>' }, { from: 99, to: 1, label: 'Invalid' }];
  const graph = layoutArchitecture(buildArchitecture(data));
  assert.equal(graph.ai, true); assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.nodes[0].files, ['ui/app.js']);
  assert.ok(graph.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.ok(graph.edges.every(edge => graph.nodes.some(node => node.id === edge.source)));
  const svg = architectureSvg(graph, '</text><script>bad</script>');
  assert.ok(!svg.includes('<script>')); assert.ok(svg.includes('&lt;script&gt;'));
  assert.equal(layoutArchitecture({ nodes: [], edges: [] }).nodes.length, 0);
  const many = buildArchitecture({ filesIndex: Array.from({ length: 80 }, (_, index) => ({ path: `folder-${index}/file.js` })) });
  assert.equal(many.nodes.length, 49);
  assert.equal(new Set(many.nodes.flatMap(node => node.files)).size, 80);
});
