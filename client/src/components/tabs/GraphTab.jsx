import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

export default function GraphTab({ data, onOpenSource }) {
  const [maxNodes, setMaxNodes] = useState(80)
  const [showExternal, setShowExternal] = useState(false)
  const [filter, setFilter] = useState('')
  const [focus, setFocus] = useState('')
  const [width, setWidth] = useState(600)
  const container = useRef(null)
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, Math.floor(entries[0].contentRect.width))))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const graph = useMemo(() => {
    const raw = data?.graph || { nodes: [], edges: [] }
    const connected = new Set([focus])
    const degree = new Map()
    for (const edge of raw.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
      if (edge.source === focus) connected.add(edge.target)
      if (edge.target === focus) connected.add(edge.source)
    }
    const eligible = raw.nodes.filter(node => (showExternal || node.type === 'file') &&
      (!focus || connected.has(node.id)) && (!filter || node.label.toLowerCase().includes(filter.toLowerCase())))
    const nodes = [...eligible].sort((a, b) => (b.id === focus) - (a.id === focus) || (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.id.localeCompare(b.id)).slice(0, maxNodes)
    const allowed = new Set(nodes.map(node => node.id))
    return { nodes: nodes.map(node => ({ ...node })), links: raw.edges.filter(edge => allowed.has(edge.source) && allowed.has(edge.target)).map(edge => ({ ...edge })), total: raw.nodes.length, eligible: eligible.length }
  }, [data, showExternal, focus, filter, maxNodes])
  if (!data) return <div className="explorer-empty">Analyze a project to see its import graph.</div>
  const fileNodes = data.graph.nodes.filter(node => node.type === 'file')
  const incoming = focus ? data.graph.edges.filter(edge => edge.target === focus).length : 0
  const outgoing = focus ? data.graph.edges.filter(edge => edge.source === focus).length : 0
  return <div className="tab-page"><div className="card">
    <h3>Import graph</h3>
    <p>Click a file node to read its source. Focus on a file to explore its direct dependencies and dependents.</p>
    <div className="graph-search">
      <input className="sidebar-input" aria-label="Filter graph nodes" placeholder="Filter nodes" value={filter} onChange={event => setFilter(event.target.value)} />
      <select aria-label="Focus graph on file" value={focus} onChange={event => setFocus(event.target.value)}>
        <option value="">All files</option>{fileNodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}
      </select>
      <label><input type="checkbox" checked={showExternal} onChange={event => setShowExternal(event.target.checked)} /> Packages and built-ins</label>
    </div>
    <label>Maximum nodes: {maxNodes} <input type="range" min="20" max="200" value={maxNodes} onChange={event => setMaxNodes(Number(event.target.value))} /></label>
    <p role="status">Showing {graph.nodes.length} of {graph.total} nodes · {graph.total - graph.nodes.length} hidden by filters or limit{focus && ` · ${incoming} incoming / ${outgoing} outgoing imports`}</p>
    {data.metrics?.unparsedFiles > 0 && <p>{data.metrics.unparsedFiles} file(s) could not be parsed. Their imports may be missing.</p>}
    {data.metrics?.unresolvedImports > 0 && <p>{data.metrics.unresolvedImports} local import(s) could not be resolved within the included files.</p>}
    <div ref={container} style={{ height: 480, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 12 }}>
      <ForceGraph2D width={width} height={480} graphData={graph}
        nodeLabel={node => String(node.label).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}
        nodeColor={node => node.type === 'file' ? '#818cf8' : node.type === 'builtin' ? '#34d399' : '#f59e0b'}
        onNodeClick={node => { if (node.type === 'file') onOpenSource({ path: node.id }) }}
        linkDirectionalArrowLength={3} linkDirectionalArrowRelPos={1} cooldownTicks={100} />
    </div>
    <details><summary>Visible files (keyboard navigation)</summary><div className="graph-node-list">
      {graph.nodes.filter(node => node.type === 'file').map(node => <button className="file-chip" key={node.id} onClick={() => onOpenSource({ path: node.id })}>{node.label}</button>)}
    </div></details>
  </div></div>
}
