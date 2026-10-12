import MermaidDiagram from '../MermaidDiagram'
import ReactMarkdown from 'react-markdown'

export default function OverviewTab({ data }) {
  if (!data) {
    return (
      <div className="explorer-empty">
        Analyze a project to see overview.
      </div>
    )
  }

  const m = data.metrics

  return (
    <div className="tab-page">
      {data.analysisWarning && (
        <div className="card" style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.06)' }}>
          <h3 style={{ marginBottom: '6px' }}>Partial analysis</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{data.analysisWarning}</p>
        </div>
      )}

      <div className="stats-row">
        <div className="stat-badge"><span className="num">{m?.files ?? data.fileCount}</span> files</div>
        <div className="stat-badge"><span className="num">{m?.functions ?? 0}</span> functions</div>
        <div className="stat-badge"><span className="num">{m?.classes ?? 0}</span> classes</div>
        <div className="stat-badge"><span className="num">{m?.edges ?? 0}</span> edges</div>
        <div className="stat-badge"><span className="num">{m?.extDeps ?? 0}</span> external dependencies</div>
      </div>

      <div className="card summary-card">
        <h3>{data.aiUnavailable ? 'Project Overview' : 'AI Project Overview'}</h3>
        <ReactMarkdown>{data.summary}</ReactMarkdown>
      </div>

      {data.mermaidDiagram && (
        <div className="card diagram-card">
          <h3>Architecture Map</h3>
          <MermaidDiagram chart={data.mermaidDiagram} />
        </div>
      )}
    </div>
  )
}
