const path = require('node:path');
const { builtinModules } = require('node:module');
const { parse } = require('@babel/parser');
const JS = /\.[cm]?[jt]sx?$/i;
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
function parseJsonSafe(value) { try { return JSON.parse(value); } catch { return null; } }
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function parseSource(file) {
  const imports = new Set();
  let functionCount = 0, classCount = 0;
  if (!JS.test(file.path)) {
    if (/\.py$/i.test(file.path)) {
      functionCount = (file.content.match(/^\s*(?:async\s+)?def\s+\w+\s*\(/gm) || []).length;
      classCount = (file.content.match(/^\s*class\s+\w+\s*(?:\(|:)/gm) || []).length;
    }
    return { imports: [], functionCount, classCount, analysisMethod: 'heuristic' };
  }
  try {
    const ast = parse(file.content, { sourceType: 'unambiguous', createImportExpressions: true,
      plugins: ['jsx', ...(/\.[cm]?tsx?$/i.test(file.path) ? ['typescript'] : []), 'decorators-legacy'] });
    walk(ast, node => {
      if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod'].includes(node.type)) functionCount++;
      if (['ClassDeclaration', 'ClassExpression'].includes(node.type)) classCount++;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && typeof node.source?.value === 'string') imports.add(node.source.value);
      if (node.type === 'CallExpression' && (node.callee?.name === 'require' || node.callee?.type === 'Import') && typeof node.arguments?.[0]?.value === 'string') imports.add(node.arguments[0].value);
    });
    return { imports: [...imports], functionCount, classCount, analysisMethod: 'parser' };
  } catch {
    return { imports: [], functionCount: 0, classCount: 0, analysisMethod: 'unparsed' };
  }
}
function resolveFile(base, fileSet) {
  const normalized = path.posix.normalize(base);
  const candidates = [normalized, ...['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.json'].map(ext => normalized + ext),
    ...['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].map(ext => `${normalized}/index${ext}`)];
  // TypeScript projects commonly import .js while storing .ts sources.
  if (/\.[cm]?js$/.test(normalized)) candidates.push(normalized.replace(/js$/, 'ts'), normalized.replace(/js$/, 'tsx'));
  return candidates.find(candidate => fileSet.has(candidate));
}
function aliasesFor(files) {
  return files.filter(file => /(^|\/)(tsconfig|jsconfig)\.json$/.test(file.path)).flatMap(file => {
    const opts = parseJsonSafe(file.content)?.compilerOptions;
    if (!opts) return [];
    return [{ directory: path.posix.dirname(file.path), base: path.posix.join(path.posix.dirname(file.path), opts.baseUrl || '.'), paths: opts.paths || {}, hasBase: Boolean(opts.baseUrl) }];
  }).sort((a, b) => b.directory.length - a.directory.length);
}
function computeRepoMetrics(files) {
  const fileSet = new Set(files.map(file => file.path));
  const aliases = aliasesFor(files);
  const filesIndex = [];
  const deps = new Set();
  const nodes = new Map();
  const edges = new Map();
  const unresolvedImports = [];
  for (const file of files) {
    if (/(^|\/)package\.json$/.test(file.path)) {
      const pkg = parseJsonSafe(file.content);
      for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) for (const dep of Object.keys(pkg?.[key] || {})) deps.add(dep);
    }
    if (/(^|\/)requirements.txt$/.test(file.path)) for (const line of file.content.split('\n')) {
      const match = line.trim().match(/^([A-Za-z0-9_.-]+)(?:\[.*?\])?(?:\s|[=<>!~;@]|$)/);
      if (match) deps.add(match[1]);
    }
    const parsed = parseSource(file);
    filesIndex.push({ path: file.path, ext: path.posix.extname(file.path), size: Buffer.byteLength(file.content), functionCount: parsed.functionCount, classCount: parsed.classCount, analysisMethod: parsed.analysisMethod });
    nodes.set(file.path, { id: file.path, type: 'file', label: file.path });
    for (const spec of parsed.imports) {
      let resolved;
      let local = spec.startsWith('.');
      if (local) resolved = resolveFile(path.posix.join(path.posix.dirname(file.path), spec), fileSet);
      else {
        const cfg = aliases.find(config => config.directory === '.' || file.path.startsWith(`${config.directory}/`));
        if (cfg) {
          for (const [pattern, targets] of Object.entries(cfg.paths)) {
            const [prefix, suffix = ''] = pattern.split('*');
            const matches = pattern.includes('*') ? spec.startsWith(prefix) && spec.endsWith(suffix) : spec === pattern;
            if (!matches || !Array.isArray(targets)) continue;
            local = true;
            const wildcard = spec.slice(prefix.length, suffix ? -suffix.length : undefined);
            for (const target of targets) {
              if (typeof target !== 'string') continue;
              resolved = resolveFile(path.posix.join(cfg.base, target.replace('*', wildcard)), fileSet);
              if (resolved) break;
            }
            if (resolved) break;
          }
          if (!resolved && cfg.hasBase) resolved = resolveFile(path.posix.join(cfg.base, spec), fileSet);
        }
      }
      if (resolved) {
        edges.set(`${file.path}\0${resolved}`, { source: file.path, target: resolved, type: 'import' });
      } else if (local) unresolvedImports.push({ from: file.path, specifier: spec });
      else {
        const builtin = builtins.has(spec.replace(/^node:/, '')) || spec.startsWith('node:');
        const name = builtin ? spec.replace(/^node:/, '') : (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
        const type = builtin ? 'builtin' : 'external';
        const id = `${type}:${name}`;
        nodes.set(id, { id, type, label: name });
        if (!builtin) deps.add(name);
        edges.set(`${file.path}\0${id}`, { source: file.path, target: id, type });
      }
    }
  }
  for (const name of deps) nodes.set(`external:${name}`, { id: `external:${name}`, type: 'external', label: name });
  return { filesIndex, externalDeps: [...deps].sort(), unresolvedImports,
    metrics: { files: files.length, functions: filesIndex.reduce((n, file) => n + file.functionCount, 0), classes: filesIndex.reduce((n, file) => n + file.classCount, 0), edges: edges.size, extDeps: deps.size, unparsedFiles: filesIndex.filter(file => file.analysisMethod === 'unparsed').length, unresolvedImports: unresolvedImports.length },
    graph: { nodes: [...nodes.values()], edges: [...edges.values()] } };
}
module.exports = { computeRepoMetrics };
