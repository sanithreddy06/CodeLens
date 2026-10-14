import { useId, useMemo, useState } from 'react'
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { architectureSvg, buildArchitecture, layoutArchitecture } from '../config/architectureGraph'
import './architecture.css'

function ComponentNode({ data }) {
  const horizontal = data.direction === 'LR'
  return <div className={`architecture-node kind-${data.kind}`}>
    <Handle type="target" position={horizontal ? Position.Left : Position.Top} isConnectable={false} />
    <button className="nodrag nopan architecture-node-button" onClick={data.inspect} aria-label={`Inspect ${data.label}`}>
      <span className="architecture-node-kind">{data.kind === 'concept' ? 'Component' : data.kind === 'package' ? 'External' : 'Source directory'}</span>
      <strong title={data.label}>{data.label}</strong>
      <span>{data.files.length ? `${data.files.length} source file${data.files.length === 1 ? '' : 's'}` : 'Package dependencies'} <span aria-hidden="true">↗</span></span>
    </button>
    <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} isConnectable={false} />
  </div>
}
const nodeTypes = { component: ComponentNode }
const fitOptions = { padding: 0.18, maxZoom: 1.1 }

export default function ArchitectureGraph({ data, onOpenSource }) {
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [includePackages, setIncludePackages] = useState(false)
  const [direction, setDirection] = useState(() => window.matchMedia('(max-width: 650px)').matches ? 'TB' : 'LR')
  const [focused, setFocused] = useState(false)
  const [notice, setNotice] = useState('')
  const [instance, setInstance] = useState(null)
  const id = useId()
  const complete = useMemo(() => buildArchitecture(data, includePackages), [data, includePackages])
  const selected = complete.nodes.find(node => node.id === selectedId)
  const visible = useMemo(() => {
    const neighbors = new Set([selectedId])
    for (const edge of complete.edges) {
      if (edge.source === selectedId) neighbors.add(edge.target)
      if (edge.target === selectedId) neighbors.add(edge.source)
    }
    const query = filter.trim().toLowerCase()
    const nodes = complete.nodes.filter(node => (!focused || !selected || neighbors.has(node.id)) &&
      (!query || node.label.toLowerCase().includes(query) || node.files.some(path => path.toLowerCase().includes(query))))
    const ids = new Set(nodes.map(node => node.id))
    return layoutArchitecture({ ...complete, nodes, edges: complete.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) }, direction)
  }, [complete, filter, focused, selected, selectedId, direction])
  const connections = selected ? complete.edges.filter(edge => edge.source === selected.id || edge.target === selected.id) : []
  const neighbors = new Set([selectedId, ...connections.flatMap(edge => [edge.source, edge.target])])
  const nodes = visible.nodes.map(node => ({
    id: node.id, type: 'component', position: { x: node.x, y: node.y },
    selected: node.id === selectedId, width: 230, height: 100,
    style: { opacity: selected && !neighbors.has(node.id) ? 0.35 : 1 },
    data: { ...node, direction, inspect: () => { setSelectedId(node.id); setNotice('') } },
  }))
  const edges = visible.edges.map(edge => ({
    ...edge, type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8a97b4' },
    style: { stroke: '#8a97b4', strokeWidth: 1.5, strokeDasharray: edge.kind !== 'import' ? '5 4' : undefined,
      opacity: selected && !connections.some(connection => connection.id === edge.id) ? 0.2 : 1 },
    labelStyle: { fill: 'var(--ink-secondary)', fontSize: 11 },
    labelBgStyle: { fill: 'var(--surface)', fillOpacity: 0.95 },
  }))
  function exportDiagram() {
    const svg = architectureSvg(visible, data.projectName || 'CodeLens')
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const anchor = document.createElement('a'); anchor.href = url
    anchor.download = `${String(data.projectName || 'project').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80)}-architecture.svg`
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000)
    setNotice('Diagram downloaded as SVG.')
  }
  return <section className="architecture-view" aria-label="Architecture diagram">
    <div className="architecture-heading"><div><h3>How this codebase fits together</h3><p>{complete.ai ? 'AI-inferred components, backed by included source files.' : 'Source directories connected by detected imports.'} Select a component to explore its source.</p></div><button className="btn btn-ghost" disabled={!visible.nodes.length} onClick={exportDiagram}>Download SVG</button></div>
    <div className="architecture-toolbar">
      <label className="architecture-search"><span className="visually-hidden">Search architecture</span><input className="sidebar-input" placeholder="Find a component or file…" value={filter} onChange={event => { setFilter(event.target.value); setNotice('') }} /></label>
      <label className="architecture-layout">Layout <select aria-label="Diagram layout" value={direction} onChange={event => setDirection(event.target.value)}><option value="LR">Left to right</option><option value="TB">Top to bottom</option></select></label>
      <label className="architecture-packages"><input type="checkbox" checked={includePackages} onChange={event => setIncludePackages(event.target.checked)} /> External packages</label>
      <button className="btn btn-ghost" onClick={() => instance?.fitView(fitOptions)}>Fit diagram</button>
    </div>
    <div className={`architecture-workbench${selected ? ' has-selection' : ''}`}>
      <div className="architecture-canvas" id={id}>
        {visible.nodes.length ? <ReactFlow key={`${direction}:${filter}:${includePackages}:${focused}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          fitView fitViewOptions={fitOptions} minZoom={0.04} maxZoom={2} onInit={setInstance}
          onNodeClick={(_event, node) => setSelectedId(node.id)} onPaneClick={() => { setSelectedId(''); setFocused(false) }}
          nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null}
          ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': 'Zoom in architecture', 'controls.zoomOut.ariaLabel': 'Zoom out architecture', 'controls.fitView.ariaLabel': 'Fit architecture to screen' }}>
          <Background color="var(--line-strong)" gap={22} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="#8b9bd0" maskColor="rgba(100,115,150,0.12)" />
        </ReactFlow> : <div className="architecture-empty"><h4>No components found</h4><p>{filter ? 'Try a different component name or file path.' : 'Import source files to build an architecture diagram.'}</p>{filter && <button className="btn btn-ghost" onClick={() => setFilter('')}>Clear search</button>}</div>}
      </div>
      {selected && <aside className="architecture-inspector" aria-label="Component details">
        <div className="architecture-inspector-title"><span className="eyebrow">COMPONENT DETAILS</span><button className="icon-button" aria-label="Close component details" onClick={() => { setSelectedId(''); setFocused(false) }}>×</button></div>
        <h4>{selected.label}</h4><p>{selected.description}</p>
        <button className="btn btn-ghost" aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? 'Show full architecture' : 'Focus connections'}</button>
        <h5>Source files · {selected.files.length}</h5><div className="architecture-files">{selected.files.map(path => <button key={path} className="file-chip" onClick={() => onOpenSource({ path })}>{path}</button>)}{!selected.files.length && <p>External dependencies are not part of the imported source.</p>}</div>
        <h5>Connections · {connections.length}</h5><ul className="architecture-connections">{connections.map(edge => {
          const outgoing = edge.source === selected.id
          const other = complete.nodes.find(node => node.id === (outgoing ? edge.target : edge.source))
          return <li key={edge.id}><button onClick={() => setSelectedId(other.id)}>{outgoing ? '→' : '←'} {other.label}</button><small>{edge.label} · {edge.kind === 'mixed' ? 'AI + detected imports' : edge.kind === 'inferred' ? 'AI inferred' : 'Detected imports'}</small>{edge.evidence.length > 0 && <details><summary>View import evidence</summary>{edge.evidence.map((item, index) => <button className="file-chip" key={index} onClick={() => onOpenSource({ path: item.source })}>{item.source} → {item.target}</button>)}</details>}</li>
        })}</ul>
      </aside>}
    </div>
    <div className="architecture-footer"><p role="status">{notice || `${visible.nodes.length} of ${complete.nodes.length} components · ${visible.edges.length} connections · ${complete.fileCount} included files`}</p><div className="architecture-legend"><span><i /> Detected import</span>{complete.ai && <span><i className="inferred" /> AI-inferred relationship</span>}</div></div>
    <details className="architecture-component-list"><summary>Browse components without the diagram</summary><div className="graph-node-list">{visible.nodes.map(node => <button className="file-chip" key={node.id} onClick={() => setSelectedId(node.id)}>{node.label}</button>)}</div></details>
    {(data.metrics?.unparsedFiles > 0 || data.metrics?.unresolvedImports > 0) && <p className="architecture-caveat">Imports may be incomplete: {data.metrics.unparsedFiles || 0} unparsed files and {data.metrics.unresolvedImports || 0} unresolved local imports.</p>}
  </section>
}
