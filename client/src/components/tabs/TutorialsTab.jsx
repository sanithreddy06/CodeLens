import { useState } from 'react'
import ChapterViewer from '../ChapterViewer'

export default function TutorialsTab({ data, onOpenSource }) {
  const [active, setActive] = useState('overview')

  if (!data) {
    return <div className="explorer-empty">Analyze a project to generate tutorials.</div>
  }

  const { projectName, chapters, fileCount, fileContents } = data

  if (!chapters || chapters.length === 0) {
    return <div className="explorer-empty">No chapters generated for this project.</div>
  }

  return (
    <div className="tutorials-split">
      <aside className="tutorials-sidebar">
        <div className="tutorials-sidebar-header">
          <div className="t-title" title={projectName}>{projectName}</div>
          <div className="t-sub">{fileCount} files · {chapters.length} chapters</div>
        </div>
        <div className="tutorials-list">
          <button
            className={`tutorials-item ${active === 'overview' ? 'active' : ''}`}
            onClick={() => setActive('overview')}
            type="button"
          >
            Overview
          </button>
          {chapters.map((ch, i) => (
            <button
              key={i}
              className={`tutorials-item ${active === i ? 'active' : ''}`}
              onClick={() => setActive(i)}
              type="button"
            >
              {ch.number}. {ch.name}
            </button>
          ))}
        </div>
      </aside>

      <main className="tutorials-main">
        {active === 'overview' ? (
          <div className="card">
            <h3>Tutorial Chapters</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
              Select a chapter on the left to read, with hover previews for referenced files.
            </p>
          </div>
        ) : (
          <ChapterViewer
            key={active}
            chapter={chapters[active]}
            chapters={chapters}
            currentIndex={active}
            onNavigate={(idx) => setActive(idx)}
            fileContents={fileContents}
            onOpenSource={onOpenSource}
          />
        )}
      </main>
    </div>
  )
}
