import { useEffect, useState } from 'react'

const KEY = 'codelens.preferences.v1'
const defaults = { theme: 'system', sourceSize: 14, wrapSource: false, compactHistory: false, reduceMotion: false, importSource: 'github' }
function normalize(value) {
  const input = value && typeof value === 'object' ? value : {}
  return {
    theme: ['light', 'dark', 'system'].includes(input.theme) ? input.theme : defaults.theme,
    sourceSize: [12, 14, 16].includes(input.sourceSize) ? input.sourceSize : defaults.sourceSize,
    wrapSource: input.wrapSource === true,
    compactHistory: input.compactHistory === true,
    reduceMotion: input.reduceMotion === true,
    importSource: input.importSource === 'zip' ? 'zip' : 'github',
  }
}
function read() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))) }
  catch { return { ...defaults } }
}
export default function usePreferences() {
  const [preferences, setPreferences] = useState(read)
  const [storageError, setStorageError] = useState('')
  useEffect(() => {
    const sync = event => { if (event.key === KEY || event.key === null) setPreferences(read()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const theme = preferences.theme === 'system' ? (system.matches ? 'dark' : 'light') : preferences.theme
      const root = document.documentElement
      root.dataset.theme = theme
      root.style.colorScheme = theme
      root.dataset.compact = String(preferences.compactHistory)
      root.dataset.reduceMotion = String(preferences.reduceMotion)
      root.dataset.wrapSource = String(preferences.wrapSource)
      root.style.setProperty('--source-font-size', `${preferences.sourceSize}px`)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161a23' : '#ffffff')
    }
    apply()
    system.addEventListener('change', apply)
    return () => system.removeEventListener('change', apply)
  }, [preferences])
  const updatePreferences = patch => {
    const next = normalize({ ...preferences, ...patch })
    setPreferences(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)); setStorageError('') }
    catch { setStorageError('Preferences apply now, but this browser could not save them for your next visit.') }
  }
  return { preferences, updatePreferences, resetPreferences: () => updatePreferences(defaults), storageError }
}
