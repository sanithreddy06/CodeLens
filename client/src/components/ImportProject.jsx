import { useState } from 'react'

export default function ImportProject({ analyzing, aiEnabled, onAnalyzeGithub, onAnalyzeZip, onClose, defaultSource = 'github' }) {
  const [sourceType, setSourceType] = useState(defaultSource)
  const [repoUrl, setRepoUrl] = useState('')
  const [zipFile, setZipFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const submit = event => {
    event.preventDefault()
    if (analyzing || fileError) return
    if (sourceType === 'github' && repoUrl.trim()) onAnalyzeGithub(repoUrl.trim())
    if (sourceType === 'zip' && zipFile) onAnalyzeZip(zipFile)
  }
  const chooseFile = event => {
    const file = event.target.files?.[0] || null
    const invalid = file && !file.name.toLowerCase().endsWith('.zip')
    setFileError(invalid ? 'Choose a ZIP archive to continue.' : '')
    setZipFile(invalid ? null : file)
  }
  return <section className="import-panel" aria-labelledby="import-title">
    <div className="import-heading"><div><h2 id="import-title">Import a codebase</h2><p>Start with a public repository or a project archive.</p></div>{onClose && <button className="icon-button" type="button" onClick={onClose} aria-label="Close import panel">×</button>}</div>
    <form onSubmit={submit}>
      <fieldset className="source-switch"><legend className="visually-hidden">Import source</legend><label className={sourceType === 'github' ? 'selected' : ''}><input type="radio" name="sourceType" checked={sourceType === 'github'} onChange={() => { setSourceType('github'); setFileError('') }} disabled={analyzing} /><span>GitHub URL</span></label><label className={sourceType === 'zip' ? 'selected' : ''}><input type="radio" name="sourceType" checked={sourceType === 'zip'} onChange={() => { setSourceType('zip'); setFileError('') }} disabled={analyzing} /><span>Upload ZIP</span></label></fieldset>
      {sourceType === 'github' ? <div className="import-field"><label htmlFor="repository-url">Public GitHub repository</label><input id="repository-url" autoFocus className="sidebar-input" type="url" placeholder="https://github.com/owner/repository" value={repoUrl} onChange={event => setRepoUrl(event.target.value)} disabled={analyzing} required autoComplete="off" spellCheck={false} /><p>Import a repository you have permission to analyze.</p></div> : <div className="import-field"><label htmlFor="project-zip">Project archive</label><div className="zip-drop"><span className="upload-symbol" aria-hidden="true">↑</span><div className="zip-drop-title">{zipFile ? zipFile.name : 'Choose a ZIP file'}</div><div className="zip-drop-subtitle">{zipFile ? `${Math.max(1, Math.round(zipFile.size / 1024))} KB · Ready to import` : 'Click to browse your files'}</div><input id="project-zip" type="file" accept=".zip,application/zip" onChange={chooseFile} disabled={analyzing} required /></div>{fileError && <p className="sidebar-error" role="alert">{fileError}</p>}</div>}
      <div className="import-footer"><p>Only upload code you have permission to share.</p><button className="btn btn-primary" type="submit" disabled={analyzing || Boolean(fileError) || (sourceType === 'github' ? !repoUrl.trim() : !zipFile)}>{analyzing ? 'Analyzing…' : 'Analyze Project'}<span aria-hidden="true">→</span></button></div>
    </form>
    {!aiEnabled && <p className="import-capability">AI is not configured yet. Source browsing and dependency graphs are available.</p>}
  </section>
}
