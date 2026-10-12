import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { apiRequest } from '../config/api'

export default function ChatBot({ jobId, projectName, variant = 'floating', onOpenSource }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'ai', text: `Hi! I've analyzed **${projectName}**. Ask me anything about the codebase! 🤖` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const messagesEndRef = useRef(null)
  const pending = useRef(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    apiRequest(`/jobs/${jobId}/messages`, { signal: controller.signal }).then(json => {
      if (!controller.signal.aborted && json.messages.length) setMessages(json.messages)
    }).catch(err => {
      if (!controller.signal.aborted) setMessages(previous => [...previous, { role: 'ai', text: `Could not restore conversation: ${err.message}` }])
    }).finally(() => { if (!controller.signal.aborted) setRestoring(false) })
    return () => controller.abort()
  }, [jobId])

  const suggestions = [
    'How does this project work?',
    'What are the main components?',
    'Explain the architecture',
    'How do I get started?',
  ]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text) => {
    if (!text.trim() || loading || restoring || pending.current) return
    const userMsg = text.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    try {
      const controller = new AbortController()
      pending.current = controller
      const json = await apiRequest('/chat', { method: 'POST', body: { message: userMsg, jobId }, signal: controller.signal, timeout: 100000 })
      controller.signal.throwIfAborted()
      const responseText = json?.response
      if (!responseText) {
        throw new Error('Server returned an invalid chat response')
      }

      setMessages(prev => [...prev, { role: 'ai', text: responseText, sources: json.sources || [] }])
    } catch (err) {
      if (pending.current?.signal.aborted) return
      setMessages(prev => [...prev, { role: 'ai', text: `Sorry, I encountered an error: ${err.message}` }])
    } finally {
      if (!pending.current?.signal.aborted) setLoading(false)
      pending.current = null
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const panel = (
    <div className={`chat-panel glass ${variant === 'embedded' ? 'chat-panel-embedded' : ''}`}>
          <div className="chat-header">
            <h3>Project Q&A — {projectName}</h3>
            {variant !== 'embedded' && (
              <button className="chat-close" onClick={() => setOpen(false)}>×</button>
            )}
          </div>

          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                {msg.role === 'ai' ? (
                  <>
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                    {msg.sources?.length > 0 && <div className="chat-sources">
                      <p>Source excerpts used for this answer</p>
                      {msg.sources.map(source => <details key={source.id}>
                        <summary>[{source.id}] {source.path}:{source.startLine}–{source.endLine}</summary>
                        {onOpenSource && <button className="file-chip" onClick={() => onOpenSource(source)}>Open source at line {source.startLine}</button>}
                        <pre><code>{source.content}</code></pre>
                      </details>)}
                    </div>}
                  </>
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {loading && (
              <div className="chat-loading-row">
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
                <span className="chat-loading-text">Thinking…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {!restoring && messages.length <= 1 && (
            <div className="chat-suggestions">
              {suggestions.map((s, i) => (
                <button key={i} className="suggestion-chip" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              className="chat-input"
              placeholder="Ask about a file, function, or feature..."
              aria-label="Question about this project"
              maxLength={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || restoring}
              id="chat-input"
            />
            <button
              type="submit"
              className="chat-send"
              disabled={loading || restoring || !input.trim()}
              aria-label="Send question"
              id="chat-send-btn"
            >
              ➤
            </button>
          </form>
    </div>
  )

  if (variant === 'embedded') return panel

  return (
    <>
      <button
        className={`chat-toggle ${!open ? 'has-dot' : ''}`}
        onClick={() => setOpen(!open)}
        id="chat-toggle-btn"
        title="AI Assistant"
      >
        {open ? '✕' : '💬'}
      </button>
      {open && panel}
    </>
  )
}
