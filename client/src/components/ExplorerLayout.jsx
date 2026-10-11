import { lazy, Suspense, useMemo, useState } from 'react'
const OverviewTab = lazy(() => import('./tabs/OverviewTab'))
const StructureTab = lazy(() => import('./tabs/StructureTab'))
const GraphTab = lazy(() => import('./tabs/GraphTab'))
const QATab = lazy(() => import('./tabs/QATab'))
const TutorialsTab = lazy(() => import('./tabs/TutorialsTab'))
import AnalysisProgress from './AnalysisProgress'
import SourceViewer from './SourceViewer'
import ErrorBoundary from './ErrorBoundary'
import { downloadAnalysis } from '../config/exportAnalysis'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'structure', label: 'Structure' },
  { id: 'graph', label: 'Graph' },
  { id: 'qa', label: 'Q&A' },
  { id: 'tutorials', label: 'Tutorials' },
]

export default function ExplorerLayout({
  user,
  aiEnabled,
  onLogout,
  error,
  analysisData,
  analysisJob,
  analysisStartedAt,
  onAnalyzeGithub,
  onAnalyzeZip,
  analyzing,
  history,
  onOpenJob,
  onCancel,
  onDeleteJob,
  onLoadMore,
  hasMore,
  onRetryTutorials,
}) {
  const [sourceType, setSourceType] = useState('github') // github | zip
  const [repoUrl, setRepoUrl] = useState('')
  const [zipFile, setZipFile] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [source, setSource] = useState(null)
  const openSource = value => setSource({ ...value, jobId: analysisData.jobId })

  const stats = useMemo(() => analysisData?.metrics || null, [analysisData])

  const handleAnalyze = async () => {
    if (sourceType === 'github') return onAnalyzeGithub(repoUrl)
    return onAnalyzeZip(zipFile)
  }

  return (
    <div className="explorer">
      <aside className="explorer-sidebar">
        <div className="explorer-brand">
          <div className="brand-title">CodeLens</div>
          <div className="brand-subtitle">AI-Powered Codebase Explorer</div>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-title">Signed in</div>
          <div className="sidebar-user">
            <div className="sidebar-user-email" title={user?.email}>{user?.email}</div>
            <button className="btn btn-ghost" onClick={onLogout} type="button">
              Sign out
            </button>
          </div>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-title">Source</div>
          <label className="radio-row">
            <input
              type="radio"
              name="sourceType"
              value="zip"
              checked={sourceType === 'zip'}
              onChange={() => setSourceType('zip')}
            />
            <span>Upload ZIP</span>
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="sourceType"
              value="github"
              checked={sourceType === 'github'}
              onChange={() => setSourceType('github')}
            />
            <span>GitHub URL</span>
          </label>

          {sourceType === 'github' ? (
            <div className="sidebar-field">
              <div className="sidebar-field-label">GitHub repository</div>
              <input
                className="sidebar-input"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                disabled={analyzing}
              />
            </div>
          ) : (
            <div className="sidebar-field">
              <div className="sidebar-field-label">Upload project ZIP</div>
              <div className="zip-drop">
                <div className="zip-drop-title">Choose a project archive</div>
                <div className="zip-drop-subtitle">Limit 50MB per file · ZIP</div>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                  disabled={analyzing}
                />
              </div>
              {zipFile && (
                <div className="zip-selected" title={zipFile.name}>
                  {zipFile.name} ({Math.round(zipFile.size / 1024)} KB)
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-primary sidebar-analyze"
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || (sourceType === 'github' ? !repoUrl.trim() : !zipFile)}
          >
            {analyzing ? 'Analyzing…' : 'Analyze Project'}
          </button>

          {error && <div className="sidebar-error">⚠️ {error}</div>}
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-title">Recent analyses</div>
          {!history.length && <p className="history-empty">Your analyses will appear here.</p>}
          <div className="history-list">
            {history.map(job => <div className="history-row" key={job.id}>
              <button type="button" disabled={analyzing} onClick={() => onOpenJob(job.id)} title={job.name}>
                <span>{job.name?.split('/').pop() || 'Project'}</span>
                <small>{job.status} · {new Date(job.createdAt).toLocaleDateString()}</small>
              </button>
              {!['queued', 'running'].includes(job.status) && <button className="history-delete" type="button" aria-label={`Delete ${job.name}`} disabled={analyzing} onClick={() => onDeleteJob(job.id)}>×</button>}
            </div>)}
          </div>
        </div>

        {hasMore && <button className="btn btn-ghost" onClick={onLoadMore} disabled={analyzing}>Load older analyses</button>}

        {stats && (
          <div className="sidebar-card">
            <div className="sidebar-card-title">Stats</div>
            <div className="sidebar-stats">
              <div><span className="k">Files</span><span className="v">{stats.files}</span></div>
              <div><span className="k">Functions</span><span className="v">{stats.functions}</span></div>
              <div><span className="k">Classes</span><span className="v">{stats.classes}</span></div>
              <div><span className="k">Edges</span><span className="v">{stats.edges}</span></div>
              <div><span className="k">Ext deps</span><span className="v">{stats.extDeps}</span></div>
            </div>
          </div>
        )}
      </aside>

      <main className="explorer-main">
        <div className="explorer-topbar">
          {analysisData && <button className="btn btn-ghost" onClick={() => downloadAnalysis(analysisData)}>Download report</button>}
          <div className="explorer-project">
            {analysisData ? (
              <>
                <div className="project-name">{analysisData.projectName}</div>
                <div className="project-sub">
                  Exploring {analysisData.projectName}
                  {analysisData.cached && <span className="cache-badge" title="Identical source was analyzed before — result served from cache without re-running the AI">⚡ Cached</span>}
                </div>
              </>
            ) : (
              <>
                <div className="project-name">No project loaded</div>
                <div className="project-sub">Analyze a GitHub repo or upload a ZIP</div>
              </>
            )}

            <style>{`
              .cache-badge {
                display: inline-block;
                margin-left: 8px;
                padding: 2px 8px;
                font-size: 11px;
                font-weight: 600;
                color: var(--accent);
                background: color-mix(in srgb, var(--accent) 12%, transparent);
                border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
                border-radius: 999px;
                vertical-align: middle;
              }
            `}</style>
          </div>
        </div>

        <div className="explorer-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              type="button"
              disabled={!analysisData}
              title={!analysisData ? 'Run an analysis to unlock tabs' : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="explorer-content">
          {!aiEnabled && <div className="analysis-stale-banner" role="status">AI is not configured yet. Import a project to browse source files and dependency graphs.</div>}
          {analysisData?.aiUnavailable && aiEnabled && <div className="analysis-stale-banner">This project was imported before AI was enabled. <button className="btn btn-ghost" disabled={analyzing} onClick={onRetryTutorials}>Generate tutorials</button></div>}
          {analyzing && (
            <>
              <AnalysisProgress
                repoUrl={analysisJob?.name || 'Loading project…'}
                progress={analysisJob?.progress}
                status={analysisJob?.status}
                startedAt={analysisStartedAt}
              />
              {analysisJob && <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel analysis</button>}
              {analysisData && (
                <div className="analysis-stale-banner">
                  Showing your previous results below while the new analysis runs.
                </div>
              )}
            </>
          )}

          {analysisData?.demoMode && <div className="analysis-stale-banner">Demo mode: explanations are sample responses, not AI analysis of this project.</div>}
          {analysisData?.analysisWarning && <div className="sidebar-error" role="status">Tutorial generation was incomplete. Completed chapters and file exploration are available. <button className="btn btn-ghost" disabled={analyzing || !aiEnabled} onClick={onRetryTutorials}>Retry missing tutorials</button></div>}
          {analysisData?.coverage && <p className="coverage-summary">Analyzed {analysisData.coverage.analyzedFiles} of {analysisData.coverage.totalFiles} files · {analysisData.coverage.skippedFiles} excluded or over limits</p>}
          {analysisData?.redactedValues > 0 && <p className="coverage-summary">{analysisData.redactedValues} possible credential(s) redacted from imported source.</p>}
          {analysisData?.revision && <p className="coverage-summary">Revision <code>{analysisData.revision.slice(0, 12)}</code> · Function and class counts may be estimates for unsupported languages.</p>}
          <ErrorBoundary key={`${analysisData?.jobId}:${activeTab}`}><Suspense fallback={<div className="explorer-empty" role="status">Loading view…</div>}>
          {(!analyzing || analysisData) && (
            <>
              {activeTab === 'overview' && <OverviewTab data={analysisData} />}
              {activeTab === 'structure' && <StructureTab data={analysisData} onOpenSource={openSource} />}
              {activeTab === 'graph' && <GraphTab data={analysisData} onOpenSource={openSource} />}
              {activeTab === 'qa' && (
                <QATab key={analysisData?.jobId} data={analysisData} aiEnabled={aiEnabled} onOpenSource={openSource} />
              )}
              {activeTab === 'tutorials' && <TutorialsTab key={analysisData?.jobId} data={analysisData} onOpenSource={openSource} />}
            </>
          )}

          </Suspense></ErrorBoundary>
          {!analyzing && !analysisData && (
            <div className="explorer-empty explorer-welcome">
              <h3>Ready to explore</h3>
              <p>Paste a public GitHub URL or upload a ZIP, then click <strong>Analyze Project</strong>.</p>
              <ul>
                <li>Cached repos re-analyze in seconds when nothing changed</li>
                <li>Use the Graph tab for import relationships</li>
                <li>Ask questions in Q&amp;A after analysis completes</li>
              </ul>
            </div>
          )}
        </div>
      </main>
      {source && source.jobId === analysisData?.jobId && <SourceViewer key={`${source.jobId}:${source.path}:${source.startLine}`} jobId={source.jobId} source={source} onClose={() => setSource(null)} />}
    </div>
  )
}
