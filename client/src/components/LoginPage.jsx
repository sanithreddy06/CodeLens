import { useState } from 'react'
import { Brand } from './LandingPage'

export default function LoginPage({ onLogin, error, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const handleSubmit = e => {
    e.preventDefault()
    if (email.trim() && password) onLogin(email.trim(), password)
  }
  return <div className="signin-page">
    <header className="signin-header"><Brand /></header>
    <main className="signin-main"><a href="#" className="signin-back">← Back to CodeLens</a><div className="signin-card"><h2>Welcome back.</h2><p className="signin-intro">Sign in to your CodeLens workspace.</p><form onSubmit={handleSubmit} className="login-form"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="username" required className="login-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" maxLength={256} required className="login-input" placeholder="Your CodeLens password" value={password} onChange={e => setPassword(e.target.value)} /><button className="login-continue-btn" type="submit" disabled={loading || !email.trim() || !password}>{loading ? 'Signing in…' : 'Sign in'}</button></form>{error && <div className="login-error" role="alert">{error}</div>}<p className="signin-help">Need help signing in? Contact your workspace administrator for account access or a password reset.</p></div></main>
  </div>
}
