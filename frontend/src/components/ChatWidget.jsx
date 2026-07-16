import { useState, useRef, useEffect } from 'react'
import { aiApi } from '../api/ai.js'

const WELCOME = { role: 'bot', text: "Hi! I'm MediCore's virtual assistant. Ask me about our departments, doctors, or how to book an appointment." }

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const data = await aiApi.chatPublic(q)
      setMessages((m) => [...m, { role: 'bot', text: data.answer || data.response || JSON.stringify(data) }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: `Sorry, I couldn't reach the server: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <>
      {open && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>MediCore Assistant</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>Powered by AI</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.25rem', cursor: 'pointer' }}
              aria-label="Close chat"
            >×</button>
          </div>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-message ${m.role}`}>{m.text}</div>
            ))}
            {loading && <div className="chat-message bot" style={{ opacity: 0.6 }}>Thinking…</div>}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question…"
              disabled={loading}
            />
            <button className="chat-send-btn" onClick={send} disabled={loading} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      <button
        className="chat-widget-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open chat assistant"
        title="Ask our AI assistant"
      >
        {open ? '×' : '💬'}
      </button>
    </>
  )
}
