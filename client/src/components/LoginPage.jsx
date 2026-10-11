import { useState } from 'react'

export default function LoginPage({ onLogin, error, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    onLogin(email.trim(), password)
  }

  return (
    <div className="login-screen">
      <div className="login-modal">
        <h2 className="login-title">Log in</h2>
        <p className="login-subtitle">
          Sign in to explore your projects and recent analyses.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email"
            aria-label="Email address"
            autoComplete="username"
            required
            className="login-input"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            aria-label="Password"
            autoComplete="current-password"
            maxLength={256}
            required
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="login-continue-btn" type="submit" disabled={loading || !email.trim() || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {error && <div className="login-error">⚠️ {error}</div>}
      </div>
    </div>
  )
}
