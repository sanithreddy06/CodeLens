import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'


export default function MermaidDiagram({ chart }) {
  const containerRef = useRef(null)
  const [failedChart, setFailedChart] = useState(null)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme || 'light'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!chart || !containerRef.current) return

    let cancelled = false
    const render = async () => {
      try {
        const dark = theme === 'dark'
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base',
          themeVariables: { primaryColor: dark ? '#25304b' : '#eaf0fc', primaryTextColor: dark ? '#e6ebf5' : '#202734', primaryBorderColor: dark ? '#a2b2ff' : '#4359bd', lineColor: dark ? '#9daec7' : '#697487', background: dark ? '#11151d' : '#f8f9fb', mainBkg: dark ? '#25304b' : '#eaf0fc', nodeBorder: dark ? '#a2b2ff' : '#4359bd', clusterBkg: dark ? '#161a23' : '#fff', titleColor: dark ? '#e6ebf5' : '#202734', edgeLabelBackground: dark ? '#161a23' : '#fff' },
          flowchart: { curve: 'basis', padding: 16 }, fontFamily: 'system-ui, sans-serif' })
        containerRef.current.innerHTML = ''
        // Mermaid can sometimes return an "error SVG" instead of throwing.
        // Parse first so invalid charts render nothing (no error banner).
        await mermaid.parse(chart)
        const id = `mermaid-${crypto.randomUUID()}`
        const { svg } = await mermaid.render(id, chart)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setFailedChart(null)
        }
      } catch (err) {
        console.warn('Mermaid render error:', err)
        // Keep the UI clean—don't show Mermaid's error output or raw chart text.
        if (!cancelled && containerRef.current) { containerRef.current.innerHTML = ''; setFailedChart(chart) }
      }
    }

    render()
    return () => { cancelled = true }
  }, [chart, theme])

  return <><div ref={containerRef} className="diagram-container" />
    {failedChart === chart && <details className="card"><summary>Diagram unavailable — view its definition</summary><pre>{chart}</pre></details>}</>
}
