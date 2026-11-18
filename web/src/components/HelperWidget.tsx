import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { apiFetch } from '../api/client';
import styles from './HelperWidget.module.css';

export type ToolName = 'search_plants' | 'open_plant' | 'add_to_cart' | 'care_tip';
export type ToolArgs = Record<string, unknown>;

export interface RecordedCall {
  name: ToolName;
  args: ToolArgs;
  source: 'model' | 'direct';
  at: string;
}

interface Message {
  from: 'you' | 'helper';
  text: string;
}

interface ChatAnswer {
  reply: string;
  toolCall: { name: ToolName; args: ToolArgs } | null;
}

const calls: RecordedCall[] = [];

declare global {
  interface Window {
    /** Development only: call a tool directly, read every tool call, clear the record. */
    __fernlyHelper?: {
      run: (name: ToolName, args: ToolArgs) => Promise<void>;
      calls: RecordedCall[];
      clear: () => void;
    };
  }
}

const GREETING = 'Hi! I can find plants, open a plant page, add plants to your cart and answer care questions.';

/** "Ask Fernly": a chat helper that turns a message into one shop tool and runs it. */
export function HelperWidget() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ from: 'helper', text: GREETING }]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const run = useCallback(
    async (name: ToolName, args: ToolArgs, source: RecordedCall['source']) => {
      calls.push({ name, args, source, at: new Date().toISOString() });
      if (name === 'search_plants') {
        const params = new URLSearchParams();
        if (typeof args.query === 'string') params.set('search', args.query);
        if (typeof args.light === 'string') params.set('light', args.light);
        if (args.petSafe === true) params.set('petSafe', 'true');
        navigate(params.size ? `/?${params}` : '/');
      } else if (name === 'open_plant') {
        navigate(`/plants/${String(args.plantId)}`);
      } else if (name === 'add_to_cart') {
        const quantity = Number(args.quantity ?? 1);
        await apiFetch('/cart/lines', { method: 'POST', body: { plantId: args.plantId, size: 'S', quantity } }).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: ['carts'] });
      }
    },
    [navigate, queryClient],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__fernlyHelper = {
      run: (name, args) => run(name, args, 'direct'),
      calls,
      clear: () => {
        calls.length = 0;
      },
    };
    return () => {
      delete window.__fernlyHelper;
    };
  }, [run]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setMessages((current) => [...current, { from: 'you', text }]);
    setBusy(true);
    try {
      const answer = await apiFetch<ChatAnswer>('/helper/chat', { method: 'POST', body: { text } });
      if (answer.toolCall) await run(answer.toolCall.name, answer.toolCall.args, 'model');
      setMessages((current) => [...current, { from: 'helper', text: answer.reply }]);
    } catch {
      setMessages((current) => [...current, { from: 'helper', text: 'Sorry — I could not reach the shop. Try again in a moment.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.helper}>
      {open ? (
        <section id="fernly-helper" aria-label="Fernly Helper" className={styles.panel}>
          <header className={styles.top}>
            <h2>Fernly Helper</h2>
          </header>
          <ol className={styles.log} role="log" aria-live="polite" aria-busy={busy}>
            {messages.map((message, index) => (
              <li key={index} className={message.from === 'you' ? styles.you : styles.bot}>
                <span className="visually-hidden">{message.from === 'you' ? 'You: ' : 'Helper: '}</span>
                {message.text}
              </li>
            ))}
            {busy ? (
              <li className={styles.bot} aria-hidden="true">
                …
              </li>
            ) : null}
          </ol>
          <form onSubmit={send} className={styles.form}>
            <label htmlFor="helper-input" className="visually-hidden">
              Message the helper
            </label>
            <input
              id="helper-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about plants or your cart"
              autoComplete="off"
            />
            <button type="submit" disabled={busy}>
              Send
            </button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={open ? 'fernly-helper' : undefined}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Close helper' : 'Ask Fernly'}
      </button>
    </div>
  );
}
