import dagre from '@dagrejs/dagre'

const folderFor = path => {
  const parts = path.split('/').slice(0, -1)
  if (!parts.length) return 'Project root'
  return parts.slice(0, parts[1] === 'src' ? 3 : 2).join('/')
}

// Use only included paths; AI prose never becomes executable diagram source.
export function buildArchitecture(data, includePackages = false) {
  const paths = (data.filesIndex || []).map(file => file.path)
  const included = new Set(paths)
  const nodes = []
  const owners = new Map()
  const concepts = new Map()
  const abstractions = data.analysisPlan?.abstractions || []
  abstractions.forEach((item, index) => {
    const files = [...new Set((item.files || []).map(i => paths[i]).filter(path => included.has(path)))]
    if (!files.length) return
    const id = `concept-${index}`
    nodes.push({ id, label: String(item.name), description: String(item.description || ''), files, kind: 'concept' })
    concepts.set(index, id)
    for (const path of files) {
      if (!owners.has(path)) owners.set(path, [])
      owners.get(path).push(id)
    }
  })
  const folders = new Map()
  for (const path of paths) {
    if (owners.has(path)) continue
    const folder = folderFor(path)
    if (!folders.has(folder)) folders.set(folder, [])
    folders.get(folder).push(path)
  }
  // Bound the layout without silently dropping any included source files.
  const groups = [...folders].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const visible = groups.slice(0, 48)
  if (groups.length > 48) visible.push(['Other folders', groups.slice(48).flatMap(([, files]) => files)])
  visible.forEach(([label, files], index) => {
    const id = `folder-${index}`
    nodes.push({ id, label, description: 'Grouped by source directory.', files, kind: 'folder' })
    for (const path of files) owners.set(path, [id])
  })
  const edges = new Map()
  const addEdge = (source, target, label, kind, evidence) => {
    if (!source || !target || source === target) return
    const key = JSON.stringify([source, target])
    if (!edges.has(key)) edges.set(key, { id: `connection-${edges.size}`, source, target, label, kind, evidence: [] })
    const edge = edges.get(key)
    if (evidence) edge.evidence.push(evidence)
  }
  for (const relationship of data.relationships || []) {
    addEdge(concepts.get(relationship.from), concepts.get(relationship.to), String(relationship.label), 'inferred')
  }
  const external = new Map()
  if (includePackages) for (const node of data.graph?.nodes || []) {
    if (node.type === 'file') continue
    external.set(node.id, node)
  }
  const usedPackages = new Map()
  for (const edge of data.graph?.edges || []) {
    const sourceIds = owners.get(edge.source) || []
    let targets = owners.get(edge.target) || []
    if (!targets.length && external.has(edge.target)) {
      // Aggregate packages into one boundary node to keep large maps readable.
      const node = external.get(edge.target)
      usedPackages.set(node.id, String(node.label))
      targets = ['packages']
    }
    for (const source of sourceIds) for (const target of targets) {
      addEdge(source, target, 'Imports', 'import', { source: edge.source, target: edge.target })
    }
  }
  if (usedPackages.size) nodes.push({ id: 'packages', label: 'External packages', description: [...usedPackages.values()].sort().join(', '), files: [], kind: 'package' })
  for (const edge of edges.values()) {
    const imports = `${edge.evidence.length} import${edge.evidence.length === 1 ? '' : 's'}`
    if (edge.kind === 'import') edge.label = imports
    else if (edge.evidence.length) { edge.label = `${edge.label} · ${imports}`; edge.kind = 'mixed' }
  }
  return { nodes, edges: [...edges.values()], fileCount: paths.length, ai: concepts.size > 0 }
}

export function layoutArchitecture(graph, direction = 'LR') {
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  layout.setGraph({ rankdir: direction, nodesep: 40, ranksep: 130, marginx: 32, marginy: 32 })
  for (const node of graph.nodes) layout.setNode(node.id, { width: 230, height: 100 })
  for (const edge of graph.edges) layout.setEdge(edge.source, edge.target)
  dagre.layout(layout)
  return { ...graph, direction, nodes: graph.nodes.map(node => {
    const position = layout.node(node.id)
    return { ...node, x: position.x - 115, y: position.y - 50 }
  }) }
}

const xml = value => Array.from(String(value), char => {
  const code = char.charCodeAt(0)
  return code < 32 && ![9, 10, 13].includes(code) ? '' : char
}).join('').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
export function architectureSvg(graph, title) {
  const width = Math.max(500, ...graph.nodes.map(node => node.x + 262))
  const height = Math.max(220, ...graph.nodes.map(node => node.y + 192))
  const byId = new Map(graph.nodes.map(node => [node.id, node]))
  const edges = graph.edges.map(edge => {
    const a = byId.get(edge.source), b = byId.get(edge.target)
    if (!a || !b) return ''
    const vertical = graph.direction === 'TB'
    const x1 = a.x + (vertical ? 115 : 230), y1 = a.y + (vertical ? 150 : 100)
    const x2 = b.x + (vertical ? 115 : 0), y2 = b.y + (vertical ? 50 : 100)
    const curve = vertical ? `${x1} ${y1 + 65}, ${x2} ${y2 - 65}` : `${x1 + 65} ${y1}, ${x2 - 65} ${y2}`
    return `<path d="M ${x1} ${y1} C ${curve}, ${x2} ${y2}" stroke="#8a97b4" fill="none" marker-end="url(#arrow)"${edge.kind !== 'import' ? ' stroke-dasharray="6 4"' : ''}/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="11" fill="#586780">${xml(edge.label.slice(0, 45))}</text>`
  }).join('')
  const nodes = graph.nodes.map(node => `<g><title>${xml(node.label)}</title><rect x="${node.x}" y="${node.y + 50}" width="230" height="100" rx="10" fill="#fff" stroke="#aab8d5"/><text x="${node.x + 16}" y="${node.y + 76}" fill="#4359bd" font-size="10">${xml(node.kind.toUpperCase())}</text><text x="${node.x + 16}" y="${node.y + 102}" fill="#202734" font-size="13">${xml(node.label.length > 27 ? `${node.label.slice(0, 26)}…` : node.label)}</text><text x="${node.x + 16}" y="${node.y + 126}" fill="#586780" font-size="11">${node.files.length} linked source files</text></g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui,sans-serif"><rect width="100%" height="100%" fill="#f8f9fb"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a97b4"/></marker></defs><text x="32" y="30" font-size="17" fill="#202734">${xml(String(title).slice(0, 100))} · Architecture</text>${edges}${nodes}</svg>`
}
