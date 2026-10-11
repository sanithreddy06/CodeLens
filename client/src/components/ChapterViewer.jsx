import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useRef, useState } from 'react'
import MermaidDiagram from './MermaidDiagram'

function isLikelyFileName(value) {
  return /^[\w./-]+\.[a-z0-9]{1,8}$/i.test(value)
}

export default function ChapterViewer({ chapter, chapters, currentIndex, onNavigate, fileContents = {}, onOpenSource }) {
  const contentRef = useRef(null)
  const [hoveredFile, setHoveredFile] = useState(null)

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
    window.scrollTo({ top: 0 })
  }, [currentIndex])

  if (!chapter) return null

  const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null

  return (
    <div className="chapter-content" ref={contentRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return children?.props?.className === 'language-mermaid' ? <div>{children}</div> : <pre>{children}</pre>
          },
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || '')
            const lang = match ? match[1] : ''

            if (lang === 'mermaid') {
              return <MermaidDiagram chart={String(children).trim()} />
            }

            if (className || String(children).includes('\n')) {
              return <code className={className}>{children}</code>
            }

            const codeText = String(children).trim()
            const fullCode = fileContents[codeText]

            if (isLikelyFileName(codeText) && fullCode) {
              return (
                <button
                  type="button"
                  className="file-chip"
                  onClick={() => {
                    const matches = chapter.files.filter(path => path === codeText || path.split('/').pop() === codeText)
                    if (matches.length === 1) onOpenSource?.({ path: matches[0] })
                  }}
                  onMouseEnter={(e) => {
                    setHoveredFile({
                      name: codeText,
                      content: fullCode,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }}
                  onMouseMove={(e) => {
                    setHoveredFile((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
                    )
                  }}
                  onMouseLeave={() => setHoveredFile(null)}
                >
                  {codeText}
                </button>
              )
            }

            return <code className={className}>{children}</code>
          }
        }}
      >
        {chapter.content}
      </ReactMarkdown>

      {hoveredFile && (
        <div
          className="file-hover-preview"
          style={{
            left: `${Math.min(hoveredFile.x + 16, window.innerWidth - 560)}px`,
            top: `${Math.min(hoveredFile.y + 16, window.innerHeight - 420)}px`,
          }}
        >
          <div className="file-hover-title">{hoveredFile.name}</div>
          <pre>{hoveredFile.content}</pre>
        </div>
      )}

      <div className="chapter-nav">
        {prev ? (
          <button className="btn btn-ghost" onClick={() => onNavigate(currentIndex - 1)} id="prev-chapter-btn">
            ← {prev.name}
          </button>
        ) : <div />}
        {next ? (
          <button className="btn btn-ghost" onClick={() => onNavigate(currentIndex + 1)} id="next-chapter-btn">
            {next.name} →
          </button>
        ) : <div />}
      </div>
    </div>
  )
}
