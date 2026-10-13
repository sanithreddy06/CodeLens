import { useState } from 'react'
import { Brand } from './LandingPage'

export default function LoginPage({ onLogin, error, loading, signup = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [validation, setValidation] = useState('')
  const handleSubmit = e => {
    e.preventDefault()
    if (signup && password !== confirmation) { setValidation('Passwords must match.'); return }
    setValidation('')
    if (email.trim() && password) onLogin(email.trim(), password, signup)
  }
  return <div className="signin-page">
    <header className="signin-header"><Brand /></header>
    <main className="signin-main"><a href="#" className="signin-back">← Back to CodeLens</a><div className="signin-card"><h2>{signup ? 'Create your account.' : 'Welcome back.'}</h2><p className="signin-intro">{signup ? 'Your workspace for understanding code starts here.' : 'Sign in to your CodeLens workspace.'}</p><form onSubmit={handleSubmit} className="login-form"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" maxLength={254} autoComplete="username" required className="login-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 12 : undefined} maxLength={256} required className="login-input" placeholder={signup ? "At least 12 characters" : "Your CodeLens password"} value={password} onChange={e => setPassword(e.target.value)} />{signup && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required maxLength={256} className="login-input" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></>}<button className="login-continue-btn" type="submit" disabled={loading || !email.trim() || !password}>{loading ? (signup ? 'Creating account…' : 'Signing in…') : (signup ? 'Create account' : 'Sign in')}</button></form>{(validation || error) && <div className="login-error" role="alert">{validation || error}</div>}{!signup && <p className="signin-help"><a href="#forgot-password">Forgot password?</a></p>}<p className="signin-help">{signup ? 'Already have an account? ' : 'New to CodeLens? '}<a href={signup ? '#signin' : '#signup'}>{signup ? 'Sign in' : 'Create account'}</a></p></div></main>
  </div>
}
