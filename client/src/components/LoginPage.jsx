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
    <aside className="signin-story"><Brand /><div><p className="eyebrow">YOUR CODEBASE, IN CONTEXT</p><h1>A little clarity.<br />A lot of possibility.</h1><p>Pick up where you left off. Your source, connections, and saved analyses are waiting.</p><div className="signin-code" aria-hidden="true"><span>// every project starts somewhere</span><br /><b>const</b> nextStep = <i>understand</i>(codebase);<br /><b>await</b> you.build(nextStep);</div></div><p className="signin-beta">CodeLens / Invitation-only beta</p></aside>
    <main className="signin-main"><a href="#" className="signin-back">← Back to CodeLens</a><div className="signin-card"><p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace.</h2><p className="signin-intro">One place to find your way through code.</p><form onSubmit={handleSubmit} className="login-form"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="username" required className="login-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" maxLength={256} required className="login-input" placeholder="Your CodeLens password" value={password} onChange={e => setPassword(e.target.value)} /><button className="login-continue-btn" type="submit" disabled={loading || !email.trim() || !password}>{loading ? 'Signing in…' : 'Sign in'}</button></form>{error && <div className="login-error" role="alert">{error}</div>}<p className="signin-help">Access is currently by invitation. Need an account or a password reset? Contact the person who invited you.</p></div><p className="signin-footnote">Bring your curiosity. We’ll help you find the context.</p></main>
  </div>
}
