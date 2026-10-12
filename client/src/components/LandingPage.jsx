import { useState } from 'react'

export function Brand({ light = false }) {
  return <a className={`product-brand${light ? ' brand-light' : ''}`} href="#" aria-label="CodeLens home"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>CodeLens</a>
}
const samples = {
  overview: { title: 'A clear starting point.', description: 'Understand the project structure before you open the first file.', code: ['taskboard/', '├── src/', '│   ├── app.js          Application entry', '│   ├── routes/         Request handlers', '│   ├── services/       Business logic', '│   └── models/         Data models', '├── package.json', '└── README.md'] },
  source: { title: 'Go straight to the source.', description: 'Search files and follow a reference back to the code.', code: ['src/services/tasks.js', '', '01  import { Task } from "../models/task.js"', '02', '03  export async function createTask(input) {', '04    const task = new Task(input)', '05    await task.save()', '06    return task', '07  }'] },
  questions: { title: 'Ask with context.', description: 'When AI is enabled, answers include excerpts you can inspect.', code: ['YOU', 'Where does a new task get saved?', '', 'ILLUSTRATIVE ANSWER', 'createTask builds a Task and calls save().', '', 'SOURCE', 'src/services/tasks.js · lines 3–6'] },
}
const questions = [
  ['What can I import?', 'Public GitHub repositories and ZIP archives. File and size limits apply; your analysis shows which files were included. Private GitHub integration is not available yet.'],
  ['Do I need AI to use CodeLens?', 'Source browsing, metrics, dependency graphs, and saved history work without AI. Tutorials and Q&A are available when the deployment has an AI provider configured.'],
  ['Can I create an account?', 'Sign in with your CodeLens account. Contact your workspace administrator if you need an account or help resetting your password.'],
  ['What happens to my code?', 'Imports and analyses are saved to your account. Selected excerpts may be sent to the configured AI provider. Only upload code you have permission to share. Secret redaction cannot guarantee removal of every credential.'],
]
export default function LandingPage() {
  const [sample, setSample] = useState('overview')
  const selected = samples[sample]
  return <div className="marketing-site">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header"><Brand /><nav aria-label="Main navigation"><a href="#explore">Product</a><a href="#questions">FAQ</a><a className="nav-signin" href="#signin">Sign in <span aria-hidden="true">→</span></a></nav></header>
    <main id="main-content">
      <section className="landing-hero"><div className="hero-copy"><p className="eyebrow"><span className="availability-dot" /> CODEBASE EXPLORATION, SIMPLIFIED</p><h1>Understand the code.<br />Find your next step.</h1><p className="hero-description">A focused workspace for exploring source, following dependencies, and learning how a project fits together.</p><div className="hero-actions"><a className="product-button" href="#signin">Open your workspace <span aria-hidden="true">→</span></a><a className="text-link" href="#explore">Explore the product</a></div><p className="hero-note">Built for developers and students learning their way around code.</p></div></section>
      <section id="explore" className="product-tour" aria-label="Product preview"><div className="preview-sidebar"><div className="preview-brand">taskboard <span>Sample project</span></div><div className="tour-tabs" role="group" aria-label="Preview views">{[['overview', 'Project structure'], ['source', 'Read the source'], ['questions', 'Ask with context']].map(([id, label]) => <button key={id} type="button" aria-label={label} aria-pressed={sample === id} className={sample === id ? 'selected' : ''} onClick={() => setSample(id)}>{label}<span aria-hidden="true">→</span></button>)}</div><p className="tour-disclosure">Interactive illustration. <br />Not a live analysis.</p></div><div className="tour-window" aria-live="polite"><div className="window-bar"><span>CodeLens <span aria-hidden="true">/</span> {sample}</span><span className="preview-chip">PREVIEW</span></div><div className="tour-window-body"><h2>{selected.title}</h2><p>{selected.description}</p><pre>{selected.code.join('\n')}</pre></div></div></section>
      <section className="workflow-section" aria-label="How it works"><div className="section-heading"><p className="eyebrow">A SIMPLE WORKFLOW</p><h2>From unfamiliar to understood.</h2></div><div className="workflow-grid">{[{ n: '01', title: 'Import your project', text: 'Paste a public GitHub URL or choose a ZIP archive.' }, { n: '02', title: 'Explore the connections', text: 'Browse source files and navigate import relationships.' }, { n: '03', title: 'Keep your context', text: 'Reopen saved analyses, export a report, or learn with AI when enabled.' }].map(step => <article key={step.n}><span className="step-number">{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
      <section id="questions" className="faq-section"><div><p className="eyebrow">GOOD TO KNOW</p><h2>A few details.</h2></div><div className="faq-list">{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
    </main>
    <footer className="site-footer"><Brand /><span>Codebase clarity for developers and students.</span><a href="https://github.com/sanithreddy06/CodeLens" target="_blank" rel="noreferrer">GitHub ↗</a><a href="#signin">Sign in</a></footer>
  </div>
}
