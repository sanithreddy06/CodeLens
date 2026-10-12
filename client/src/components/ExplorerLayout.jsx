import { lazy, Suspense, useState } from 'react'
const OverviewTab = lazy(() => import('./tabs/OverviewTab'))
const StructureTab = lazy(() => import('./tabs/StructureTab'))
const GraphTab = lazy(() => import('./tabs/GraphTab'))
const QATab = lazy(() => import('./tabs/QATab'))
const TutorialsTab = lazy(() => import('./tabs/TutorialsTab'))
import AnalysisProgress from './AnalysisProgress'
import { Brand } from './LandingPage'
import ImportProject from './ImportProject'
import SourceViewer from './SourceViewer'
import ErrorBoundary from './ErrorBoundary'
import { downloadAnalysis } from '../config/exportAnalysis'

const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'structure', label: 'Structure' }, { id: 'graph', label: 'Graph' }, { id: 'qa', label: 'Q&A' }, { id: 'tutorials', label: 'Tutorials' }]
const statusLabel = status => ({ done: 'Ready', queued: 'Queued', running: 'Analyzing', failed: 'Failed', cancelled: 'Cancelled', expired: 'Expired' }[status] || status)

export default function ExplorerLayout({ user, aiEnabled, onLogout, error, analysisData, analysisJob, analysisStartedAt, onAnalyzeGithub, onAnalyzeZip, analyzing, history, onOpenJob, onCancel, onDeleteJob, onLoadMore, hasMore, onRetryTutorials }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [source, setSource] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const openSource = value => setSource({ ...value, jobId: analysisData.jobId })
  const start = action => value => { setShowImport(false); setActiveTab('overview'); action(value) }
  const openJob = id => { setNavigationOpen(false); setShowImport(false); setActiveTab('overview'); onOpenJob(id) }

  return <div className="explorer">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <aside className="explorer-sidebar" aria-label="Workspace navigation">
      <div className="explorer-brand"><Brand light /><span className="workspace-label">WORKSPACE</span></div>
      <button className="new-analysis-button" type="button" disabled={analyzing} onClick={() => { setShowImport(true); setNavigationOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }) }}><span aria-hidden="true">+</span> New analysis</button>
      <button className="mobile-project-toggle" type="button" aria-expanded={navigationOpen} aria-controls="workspace-navigation" onClick={() => setNavigationOpen(!navigationOpen)}>Projects &amp; account <span aria-hidden="true">{navigationOpen ? '−' : '+'}</span></button>
      <div id="workspace-navigation" className={`sidebar-navigation${navigationOpen ? ' navigation-expanded' : ''}`}>
      <div className="history-heading">Recent analyses{history.length > 0 && <span>{history.length}{hasMore ? '+' : ''}</span>}</div>
      {!history.length && <p className="history-empty">Your imported projects will appear here.</p>}
      <nav className="history-list" aria-label="Recent analyses">{history.map(job => <div className={`history-row${analysisData?.jobId === job.id ? ' current' : ''}`} key={job.id}>
        <button type="button" disabled={analyzing} onClick={() => openJob(job.id)} title={job.name} aria-current={analysisData?.jobId === job.id ? 'page' : undefined}><span>{job.name?.split('/').pop() || 'Project'}</span><small><i className={`job-status status-${job.status}`} aria-hidden="true" />{statusLabel(job.status)} · {new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></button>
        {!['queued', 'running'].includes(job.status) && <button className="history-delete" type="button" aria-label={`Delete ${job.name}`} disabled={analyzing} onClick={() => setPendingDelete(job)}>×</button>}
      </div>)}</nav>
      {pendingDelete && <div className="delete-confirm" role="group" aria-label="Confirm analysis deletion"><p>Delete “{pendingDelete.name?.split('/').pop() || 'Project'}” and its conversation?</p><div><button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>Keep</button><button className="btn danger-button" disabled={analyzing} onClick={() => { onDeleteJob(pendingDelete.id); setPendingDelete(null) }}>Delete analysis</button></div></div>}
      {hasMore && <button className="history-more" onClick={onLoadMore} disabled={analyzing}>Load older analyses</button>}
      <div className="sidebar-account"><div className="account-avatar" aria-hidden="true">{user?.email?.slice(0, 1).toUpperCase()}</div><div className="account-info"><span title={user?.email}>{user?.email}</span><small>Beta workspace</small></div><button type="button" onClick={onLogout} className="account-signout" aria-label="Sign out" title="Sign out">↪</button></div>
      </div>
    </aside>
    <main id="workspace-content" className="explorer-main">
      <header className="explorer-topbar"><div className="explorer-project"><div className="workspace-breadcrumb">Workspace {analysisData && <><span>/</span> Analysis</>}</div><div className="project-name">{analysisData?.projectName || 'Your projects'}</div></div><div className="workspace-actions">{analysisData && <button className="btn btn-ghost" onClick={() => downloadAnalysis(analysisData)}>Download report</button>}<span className="beta-chip">Beta</span></div></header>
      <div className="explorer-content">
        {error && <div className="sidebar-error workspace-error" role="alert">{error}</div>}
        {(!analysisData || showImport) && !analyzing && <div className={!analysisData ? 'workspace-start' : 'workspace-import-inline'}>{!analysisData && <div className="workspace-welcome"><p className="eyebrow">START EXPLORING</p><h1>Understand your codebase.</h1><p>Import a project to explore its source, see how files connect, and find your starting point.</p></div>}<ImportProject analyzing={analyzing} aiEnabled={aiEnabled} onAnalyzeGithub={start(onAnalyzeGithub)} onAnalyzeZip={start(onAnalyzeZip)} onClose={analysisData ? () => setShowImport(false) : undefined} />{!analysisData && <div className="workspace-feature-notes"><span>Source explorer</span><span>Dependency graph</span><span>Saved analyses</span></div>}</div>}
        {analyzing && <section className="workspace-progress" aria-label="Analysis progress"><AnalysisProgress repoUrl={analysisJob?.name || 'Loading project…'} progress={analysisJob?.progress} status={analysisJob?.status} startedAt={analysisStartedAt} />{analysisJob && <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel analysis</button>}{analysisData && <p className="muted-note">Your previous analysis is available below while this project is processed.</p>}</section>}
        {analysisData && <>
          <nav className="explorer-tabs" aria-label="Analysis views">{TABS.map(tab => <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)} type="button" aria-current={activeTab === tab.id ? 'page' : undefined}>{tab.label}</button>)}</nav>
          <div className="analysis-metadata">{analysisData.coverage && <p className="coverage-summary">Analyzed {analysisData.coverage.analyzedFiles} of {analysisData.coverage.totalFiles} files <span>· {analysisData.coverage.skippedFiles} excluded or over limits</span></p>}{analysisData.cached && <span className="cache-badge">Cached</span>}{(analysisData.revision || analysisData.redactedValues > 0) && <details className="analysis-details"><summary>Import details</summary>{analysisData.revision && <p>Revision <code>{analysisData.revision.slice(0, 12)}</code></p>}<p>Function and class counts may be estimates for unsupported languages.</p>{analysisData.redactedValues > 0 && <p>{analysisData.redactedValues} possible credential(s) redacted from imported source.</p>}</details>}</div>
          {analysisData.demoMode && <div className="analysis-stale-banner">Demo mode: explanations are sample responses, not AI analysis of this project.</div>}
          {analysisData.aiUnavailable && aiEnabled && <div className="analysis-stale-banner">AI is now available for this project. <button className="btn btn-ghost" disabled={analyzing} onClick={onRetryTutorials}>Generate tutorials</button></div>}
          {analysisData.analysisWarning && <div className="sidebar-error" role="status">Some tutorials could not be completed. Source exploration and completed chapters are available. <button className="btn btn-ghost" disabled={analyzing || !aiEnabled} onClick={onRetryTutorials}>Retry missing tutorials</button></div>}
          <ErrorBoundary key={`${analysisData.jobId}:${activeTab}`}><Suspense fallback={<div className="view-loading" role="status">Loading view…</div>}>
            {activeTab === 'overview' && <OverviewTab data={analysisData} />}
            {activeTab === 'structure' && <StructureTab data={analysisData} onOpenSource={openSource} />}
            {activeTab === 'graph' && <GraphTab data={analysisData} onOpenSource={openSource} />}
            {activeTab === 'qa' && <QATab key={analysisData.jobId} data={analysisData} aiEnabled={aiEnabled} onOpenSource={openSource} />}
            {activeTab === 'tutorials' && <TutorialsTab key={analysisData.jobId} data={analysisData} onOpenSource={openSource} />}
          </Suspense></ErrorBoundary>
        </>}
      </div>
    </main>
    {source && source.jobId === analysisData?.jobId && <SourceViewer key={`${source.jobId}:${source.path}:${source.startLine}`} jobId={source.jobId} source={source} onClose={() => setSource(null)} />}
  </div>
}
