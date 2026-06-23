import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSpace } from '../space.jsx';

// Page 5 — Chat: ask questions about your spending in plain language.
// Posts to /api/chat, which summarizes your data and answers via the LLM.
const SUGGESTIONS = [
  'How much did I spend this month?',
  'Am I on track with my budgets?',
  'What did I spend the most on?',
  'How are my savings goals doing?',
];

export default function Chat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hi! I'm MoiMone. Ask me anything about your spending, budgets, or goals — like “how much did I spend on food this month?”",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const { currentSpaceId } = useSpace();

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setSending(true);
    try {
      const { answer } = await api.chat(question, currentSpaceId);
      setMessages((m) => [...m, { role: 'assistant', text: answer }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `Sorry — I couldn’t answer that. (${err.message})`, error: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    send();
  }

  const showSuggestions = messages.length === 1 && !sending;

  return (
    <section className="chat-page">
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Ask</div>
          <h2 className="stmt-title">Chat</h2>
        </div>
      </header>

      <div className="chat-thread" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}${m.error ? ' error' : ''}`}>
            {m.text}
          </div>
        ))}
        {sending && (
          <div className="chat-msg assistant typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
      </div>

      {showSuggestions && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form className="chat-input-bar" onSubmit={onSubmit}>
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your spending…"
          disabled={sending}
        />
        <button className="chat-send" type="submit" disabled={sending || !input.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </section>
  );
}
