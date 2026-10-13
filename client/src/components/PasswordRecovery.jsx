import { useState } from 'react'
import { Brand } from './LandingPage'
import { apiRequest, clearSession } from '../config/api'

export default function PasswordRecovery({ page }) {
  const reset = page.startsWith('#reset-password')
  const token = new URLSearchParams(page.split('?')[1] || '').get('token') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (reset && password !== confirmation) { setError('Passwords must match.'); return }
    setBusy(true)
    try {
      const data = await apiRequest(reset ? '/auth/reset-password' : '/auth/forgot-password', {
        method: 'POST', body: reset ? { token, password } : { email: email.trim() },
      })
      if (reset) { clearSession(); window.history.replaceState(null, '', '#reset-password'); setPassword(''); setConfirmation('') }
      setMessage(data.message)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div className="signin-page">
    <header className="signin-header"><Brand /></header>
    <main className="signin-main"><div className="signin-card">
      <h2>{reset ? 'Choose a new password.' : 'Forgot your password?'}</h2>
      <p className="signin-intro">{reset ? 'Use at least 12 characters to keep your account secure.' : 'Enter your account email and we’ll send you a reset link.'}</p>
      {message ? <p role="status">{message}</p> : <form onSubmit={submit} className="login-form">
        {reset ? <>
          <label htmlFor="new-password">New password</label><input id="new-password" className="login-input" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} />
          <label htmlFor="confirm-new-password">Confirm password</label><input id="confirm-new-password" className="login-input" type="password" autoComplete="new-password" maxLength={256} required value={confirmation} onChange={e => setConfirmation(e.target.value)} />
        </> : <><label htmlFor="recovery-email">Email address</label><input id="recovery-email" className="login-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></>}
        <button className="login-continue-btn" disabled={busy} type="submit">{busy ? 'Please wait…' : reset ? 'Update password' : 'Send reset link'}</button>
      </form>}
      {error && <p role="alert" className="login-error">{error}</p>}
      <p className="signin-help"><a href="/#signin" onClick={event => { if (reset && message) { event.preventDefault(); window.location.assign(`${window.location.pathname}${window.location.search}#signin`); window.location.reload() } }}>Back to sign in</a></p>
    </div></main>
  </div>
}
