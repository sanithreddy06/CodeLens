import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../config/api'

export default function SourceViewer({ jobId, source, onClose }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const dialog = useRef(null)
  const lineRef = useRef(null)
  const searchRef = useRef(null)
  const lines = file?.content.split('\n') || []
  const matches = query ? lines.flatMap((line, index) => line.toLowerCase().includes(query.toLowerCase()) ? [index + 1] : []) : []
  const selectedMatch = matches[matchIndex % (matches.length || 1)]
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    apiRequest(`/jobs/${jobId}/source?path=${encodeURIComponent(source.path)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setFile(data) })
      .catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [jobId, source.path])
  useEffect(() => { if (file) lineRef.current?.scrollIntoView({ block: 'center' }) }, [file])
  useEffect(() => { if (selectedMatch) searchRef.current?.scrollIntoView({ block: 'center' }) }, [selectedMatch])
  return <dialog ref={dialog} className="source-dialog" onCancel={onClose} aria-labelledby="source-title">
    <header className="source-header">
      <div><h3 id="source-title">{source.path}</h3><small>{file?.revision && `Revision ${file.revision.slice(0, 12)}`}</small></div>
      <button className="btn btn-ghost" onClick={onClose} aria-label="Close source viewer" autoFocus>Close</button>
    </header>
    {file && <div className="source-search">
      <input className="sidebar-input" aria-label="Search source" placeholder="Find text in this file" value={query}
        onChange={event => { setQuery(event.target.value); setMatchIndex(0) }} />
      <span role="status">{query ? `${matches.length ? matchIndex % matches.length + 1 : 0} / ${matches.length} matching lines` : ''}</span>
      <button className="btn btn-ghost" disabled={!matches.length} onClick={() => setMatchIndex(index => (index + 1) % matches.length)}>Next match</button>
    </div>}
    {error ? <p role="alert">{error}</p> : !file ? <p role="status">Loading source…</p> :
      <pre className="source-code">{lines.map((line, index) => {
        const number = index + 1
        const highlighted = number >= (source.startLine || 1) && number <= (source.endLine || source.startLine || 1)
        return <span key={number} ref={element => { if (number === (source.startLine || 1)) lineRef.current = element; if (number === selectedMatch) searchRef.current = element }} className={`source-line ${highlighted ? 'source-highlight' : ''} ${number === selectedMatch ? 'source-search-match' : ''}`}>
          <span className="source-number" aria-hidden="true">{number}</span><code>{line || ' '}</code>{'\n'}
        </span>
      })}</pre>}
  </dialog>
}
