import { useEffect, useState } from 'react'

const STEPS = [
  { icon: '📥', label: 'Fetch source' },
  { icon: '🧩', label: 'Core concepts' },
  { icon: '🔗', label: 'Relationships' },
  { icon: '📋', label: 'Chapter plan' },
  { icon: '✍️', label: 'Write tutorials' },
  { icon: '✨', label: 'Finalize' },
]

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m}m ${r}s` : `${m}m`
}

export default function AnalysisProgress({ repoUrl, progress, status, startedAt }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const step = Math.max(progress?.step || 0, 0)
  const total = Math.max(progress?.total || 6, 1)
  const pct = status === 'done' ? 100 : Math.min(Math.round((Math.max(0, step - 1) / total) * 100), 95)

  const message =
    progress?.message ||
    (status === 'queued'
      ? 'Waiting in queue — another analysis may be running…'
      : status === 'failed'
        ? 'Analysis failed'
        : 'Starting analysis…')

  const elapsedSec = startedAt ? (now - startedAt) / 1000 : 0


  return (
    <div className="analysis-progress-wrap">
      <div className="card progress-card glow-border">
        <div className="progress-header">
          <h2>Analyzing project</h2>
          <div className="progress-timers">
            <span className="progress-timer">Elapsed {formatDuration(elapsedSec)}</span>

          </div>
        </div>
        <p className="subtitle progress-source" title={repoUrl}>{repoUrl}</p>

        <div className="progress-bar-track progress-bar-track-lg" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="progress-bar-fill progress-bar-animated" style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
        <p className="progress-message" role="status">
          {message}
          <span className="progress-step-count">Step {Math.min(step, total)} of {total}</span>
        </p>

        <div className="progress-steps-grid">
          {STEPS.map((s, i) => {
            const stepIndex = i + 1
            const done = step > stepIndex
            const active = step === stepIndex || (step === 0 && stepIndex === 1 && status === 'running')
            return (
              <div key={s.label} className={`progress-step-chip ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                <span className="progress-step-icon" aria-hidden>{done ? '✓' : stepIndex}</span>
                <span className="progress-step-label">{s.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
