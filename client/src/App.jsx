import { useEffect, useRef, useState } from 'react'
import './index.css'
import './product.css'
import LandingPage from './components/LandingPage'
import LoginPage from './components/LoginPage'
import ExplorerLayout from './components/ExplorerLayout'
import { apiRequest, clearSession } from './config/api'

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason)
  const done = () => { signal.removeEventListener('abort', abort); resolve() }
  const timer = setTimeout(done, ms)
  const abort = () => { clearTimeout(timer); reject(signal.reason) }
  signal.addEventListener('abort', abort, { once: true })
})
function App() {
  const [page, setPage] = useState(window.location.hash)
  const [user, setUser] = useState(null)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)
  const [analysisJob, setAnalysisJob] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [history, setHistory] = useState([])
  const [nextOffset, setNextOffset] = useState(null)
  const active = useRef(null)

  useEffect(() => {
    const navigate = () => {
      setPage(window.location.hash)
      if (['', '#', '#signin'].includes(window.location.hash)) window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // Remove credentials from the previous bearer-token implementation.
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUser')
    async function restore() {
      try {
        const session = await apiRequest('/auth/me', { signal: controller.signal })
        if (controller.signal.aborted) return
        setUser(session.user)
        setAiEnabled(Boolean(session.ai?.enabled))
        const data = await apiRequest('/jobs', { signal: controller.signal })
        if (controller.signal.aborted) return
        setHistory(data.jobs)
        setNextOffset(data.nextOffset)
      } catch (err) {
        if (!controller.signal.aborted && err.status !== 401) setError('Could not connect to the server. Please try again in a moment.')
      } finally { if (!controller.signal.aborted) setChecking(false) }
    }
    const expired = () => {
      active.current?.abort()
      clearSession()
      setUser(null); setAnalysisData(null); setAnalysisJob(null); setHistory([]); setAnalyzing(false)
      window.location.hash = 'signin'
      setError('Your session expired. Please sign in again.')
    }
    window.addEventListener('codelens:session-expired', expired)
    restore()
    return () => { controller.abort(); active.current?.abort(); window.removeEventListener('codelens:session-expired', expired) }
  }, [])

  const refreshHistory = async (signal) => {
    const json = await apiRequest('/jobs', { signal })
    signal?.throwIfAborted()
    setHistory(json.jobs)
    setNextOffset(json.nextOffset)
  }
  const loadMore = async () => {
    if (nextOffset === null) return
    try {
      const json = await apiRequest(`/jobs?offset=${nextOffset}`)
      setHistory(previous => [...new Map([...previous, ...json.jobs].map(job => [job.id, job])).values()])
      setNextOffset(json.nextOffset)
    } catch (err) { setError(err.message) }
  }
  const handleLogin = async (email, password) => {
    if (loggingIn) return
    setLoggingIn(true); setError(null)
    try {
      const json = await apiRequest('/auth/login', { method: 'POST', body: { email, password } })
      setUser(json.user)
      setAiEnabled(Boolean(json.ai?.enabled))
      await refreshHistory()
    } catch (err) { setError(err.message) }
    finally { setLoggingIn(false) }
  }
  const handleLogout = async () => {
    active.current?.abort()
    setAnalyzing(false)
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
      clearSession(); setUser(null); setAnalysisData(null); setAnalysisJob(null); setHistory([]); setError(null)
    } catch (err) { setError(`Could not sign out: ${err.message}`) }
  }
  const followJob = async (id, controller) => {
    const deadline = Date.now() + 20 * 60000
    while (Date.now() < deadline) {
      const { job } = await apiRequest(`/jobs/${id}`, { signal: controller.signal })
      controller.signal.throwIfAborted()
      setAnalysisJob(job)
      if (job.status === 'done') {
        setAnalysisData({ ...job.result, jobId: job.id, cached: job.cached })
        return
      }
      if (['failed', 'cancelled', 'expired'].includes(job.status)) throw new Error(job.error || 'Analysis stopped')
      await wait(1500, controller.signal)
    }
    throw new Error('Stopped waiting. You can reopen this analysis from Recent analyses.')
  }
  const runJob = async (start) => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setAnalyzing(true); setError(null); setAnalysisJob(null)
    try {
      const id = await start(controller.signal)
      try { await refreshHistory(controller.signal) }
      catch { controller.signal.throwIfAborted() /* History failure must not stop tracking an accepted job. */ }
      await followJob(id, controller)
    } catch (err) { if (!controller.signal.aborted) setError(err.message) }
    finally {
      if (!controller.signal.aborted) {
        setAnalyzing(false)
        try { await refreshHistory(controller.signal) } catch { /* Existing result stays usable if history refresh fails. */ }
      }
    }
  }
  const analyzeGithub = repoUrl => runJob(async signal => (await apiRequest('/analyze', { method: 'POST', body: { repoUrl }, signal })).jobId)
  const retryTutorials = () => runJob(async signal => (await apiRequest(`/jobs/${analysisData.jobId}/retry`, { method: 'POST', signal })).jobId)
  const analyzeZip = file => {
    if (!file) return
    const body = new FormData(); body.append('zip', file)
    return runJob(async signal => (await apiRequest('/analyze-zip', { method: 'POST', body, signal, timeout: 60000 })).jobId)
  }
  const cancel = async () => {
    if (!analysisJob) return
    try { await apiRequest(`/jobs/${analysisJob.id}/cancel`, { method: 'POST' }) }
    catch (err) { setError(err.message) }
  }
  const remove = async id => {
    try {
      await apiRequest(`/jobs/${id}`, { method: 'DELETE' })
      if (analysisData?.jobId === id) setAnalysisData(null)
      await refreshHistory()
    } catch (err) { setError(err.message) }
  }
  if (checking) return <div className="login-screen" role="status">Loading CodeLens…</div>
  if (!user) return page === '#signin' ? <LoginPage onLogin={handleLogin} error={error} loading={loggingIn} /> : <LandingPage />
  return <ExplorerLayout user={user} aiEnabled={aiEnabled} onLogout={handleLogout} error={error} analysisData={analysisData}
    analysisJob={analysisJob} analysisStartedAt={analysisJob?.createdAt} onAnalyzeGithub={analyzeGithub}
    onAnalyzeZip={analyzeZip} analyzing={analyzing} history={history} onOpenJob={id => runJob(async () => id)}
    onCancel={cancel} onDeleteJob={remove} onLoadMore={loadMore} hasMore={nextOffset !== null} onRetryTutorials={retryTutorials} />
}
export default App
