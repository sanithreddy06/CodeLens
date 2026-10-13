import { useState } from 'react'
import { apiRequest, clearSession } from '../config/api'
import { LegalLinks } from './LegalPage'
export default function AccountPrivacy() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function act(action) {
    if (busy) return
    if (!password) { setError('Enter your current password to continue.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await apiRequest(`/account/${action}`, { method: 'POST', body: { password, confirmation }, download: action === 'export', timeout: 120000 })
      setPassword('')
      if (action === 'export') {
        const url = URL.createObjectURL(data)
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'codelens-data.json'; anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 10000)
        setNotice('Your data export has downloaded. Keep it somewhere private.')
      } else if (action === 'delete') {
        clearSession()
        window.location.hash = 'signin'; window.location.reload()
      } else setNotice('Other sessions have been signed out.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section className="settings-section" aria-labelledby="privacy-controls-title"><h2 id="privacy-controls-title">Privacy and security</h2><p>Confirm your password to manage your account. Exports include saved source and conversations.</p>
    <label htmlFor="account-current-password">Current password</label><input id="account-current-password" className="login-input" type="password" autoComplete="current-password" maxLength={256} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
    <div className="account-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => act('export')}>Export my data</button><button className="btn btn-ghost" disabled={busy} onClick={() => act('sessions/revoke')}>Sign out other sessions</button><button className="btn btn-ghost" disabled={busy} onClick={() => setDeleting(true)}>Delete account</button></div>
    {deleting && <div className="settings-reset" role="group" aria-label="Delete account confirmation"><p>This permanently deletes your account, saved source, analyses, and conversations from the active service. This cannot be undone. Previously created backups follow the operator’s retention schedule. Type DELETE to confirm.</p><label htmlFor="delete-confirmation">Confirmation</label><input id="delete-confirmation" className="login-input" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} autoComplete="off" /><div className="account-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => { setDeleting(false); setConfirmation('') }}>Cancel</button><button className="btn btn-primary" disabled={busy || confirmation !== 'DELETE'} onClick={() => act('delete')}>Permanently delete account</button></div></div>}
    {error && <p role="alert" className="login-error">{error}</p>}<p role="status">{busy ? 'Working…' : notice}</p><LegalLinks />
  </section>
}
