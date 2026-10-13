export const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
let csrfToken = ''
export function clearSession() { csrfToken = '' }
export async function apiRequest(path, { method = 'GET', body, signal, timeout = 30000 } = {}) {
  const headers = { 'X-CodeLens-Request': '1' }
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API}${path}`, {
    method, credentials: 'include', headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && !['/auth/login', '/auth/signup', '/auth/me'].includes(path)) window.dispatchEvent(new Event('codelens:session-expired'))
    const error = new Error(json?.error || `Request failed (${res.status})`)
    error.status = res.status
    throw error
  }
  if (!json) throw new Error('Server returned an invalid response')
  if (json.csrfToken) csrfToken = json.csrfToken
  return json
}
