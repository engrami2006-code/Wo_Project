import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Brain, MessageSquarePlus, SendHorizontal, ShieldCheck, UserRound } from 'lucide-react';
import { RecommendationCard } from '../components/explain/RecommendationCard';
import { Badge, Button, Drawer, Spinner, Toggle, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { http } from '../services/api';
import { chatbotService } from '../services/chatbot';
import type { ChatOption, ChatReply, Explanation, UUID } from '../types/api';
import { cn } from '../utils/cn';
import { errorText } from '../utils/errors';
import { fmtNumber } from '../utils/format';

const SESSION_KEY = 'wo.chat.session';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: ChatReply['status'];
  options?: ChatOption[];
  explanation?: Explanation | null;
  nlu?: ChatReply['nlu'];
  intent?: string | null;
}

interface HistoryItem {
  id: string;
  role: string;
  text: string;
  payload: { status?: ChatReply['status']; options?: ChatOption[]; explanation?: Explanation | null; nlu?: ChatReply['nlu'] };
}

function readSession(): UUID | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function storeSession(id: UUID | null) {
  try {
    if (id) window.localStorage.setItem(SESSION_KEY, id);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked */
  }
}

function NluPanel({ m }: { m: ChatMessage }) {
  const { t, lang } = useI18n();
  const nlu = m.nlu ?? {};
  const scores = Object.entries(nlu.scores ?? {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...scores.map(([, v]) => v));
  return (
    <div className="mt-2 rounded-xl border border-dashed border-forest-200 bg-surface/70 p-3 text-xs">
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-forest-700">
        <Brain className="h-3.5 w-3.5" aria-hidden />
        {t('chat.nlu.title')}
      </p>
      <dl className="space-y-1">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted">{t('chat.nlu.intent')}</dt>
          <dd className="font-mono text-ink" dir="ltr">{nlu.intent ?? m.intent ?? '—'}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted">{t('chat.nlu.normalized')}</dt>
          <dd className="text-ink" dir="auto">{nlu.normalized ?? '—'}</dd>
        </div>
        {nlu.entities ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{t('chat.nlu.entities')}</dt>
            <dd className="break-all font-mono text-ink" dir="ltr">{JSON.stringify(nlu.entities)}</dd>
          </div>
        ) : null}
      </dl>
      {scores.length ? (
        <ul className="mt-2 space-y-1" aria-label={t('chat.nlu.scores')}>
          {scores.map(([k, v]) => (
            <li key={k} className="flex items-center gap-2">
              <span className="w-32 shrink-0 truncate font-mono" dir="ltr">{k}</span>
              <span className="h-1.5 flex-1 rounded-full bg-canvas">
                <span className="block h-1.5 rounded-full bg-teal" style={{ width: `${(v / max) * 100}%` }} />
              </span>
              <span className="tabular w-8 text-end">{fmtNumber(v, lang, 1)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted">{t('chat.nlu.noScores')}</p>
      )}
    </div>
  );
}

export default function ChatbotPage() {
  const { t, lang, dir } = useI18n();
  const toast = useToast();
  const [sessionId, setSessionId] = useState<UUID | null>(readSession);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [showNlu, setShowNlu] = useState(false);
  const [reasoning, setReasoning] = useState<Explanation | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);

  // Restore the previous conversation when a session id is remembered.
  const history = useQuery({
    queryKey: ['chat-history', sessionId],
    queryFn: () => http.get<HistoryItem[]>(`/chatbot/sessions/${sessionId}`),
    enabled: !!sessionId && !restored.current,
    retry: false,
  });
  useEffect(() => {
    if (restored.current) return;
    if (history.isSuccess) {
      restored.current = true;
      setMessages(
        history.data.map((h) => ({
          id: h.id,
          role: h.role === 'user' ? 'user' : 'assistant',
          text: h.text,
          status: h.payload?.status,
          options: h.payload?.options ?? [],
          explanation: h.payload?.explanation ?? null,
          nlu: h.payload?.nlu,
        })),
      );
    } else if (history.isError) {
      restored.current = true;
      storeSession(null);
      setSessionId(null);
    }
  }, [history.isSuccess, history.isError, history.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (text: string) => chatbotService.query(text, sessionId, lang),
    onSuccess: (reply) => {
      restored.current = true;
      setSessionId(reply.session_id);
      storeSession(reply.session_id);
      setMessages((ms) => [
        ...ms,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: reply.text,
          status: reply.status,
          options: reply.options,
          explanation: reply.explanation,
          nlu: reply.nlu,
          intent: reply.intent,
        },
      ]);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    onError: (err) => {
      setMessages((ms) => ms.slice(0, -1));
      toast.error(t('chat.error'), errorText(err, t));
    },
  });

  /** Sends `text`; quick replies show their label in the bubble but send their value. */
  const submit = (text: string, shown?: string) => {
    const msg = text.trim();
    if (!msg || send.isPending) return;
    setMessages((ms) => [...ms, { id: `u-${Date.now()}`, role: 'user', text: shown ?? msg }]);
    setInput('');
    send.mutate(msg);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(input);
    }
  };

  const reset = () => {
    storeSession(null);
    setSessionId(null);
    setMessages([]);
    restored.current = true;
  };

  const suggestions = [t('chat.suggest.irrigate'), t('chat.suggest.requirement'), t('chat.suggest.usage'), t('chat.suggest.hydro'), t('chat.suggest.weather'), t('chat.suggest.alerts')];
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col sm:h-[calc(100dvh-9.5rem)]">
      <header className="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-forest-700 text-white" aria-hidden>
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-ink">{t('chat.title')}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden />
            {t('chat.note')}
          </p>
        </div>
        <Toggle size="sm" checked={showNlu} onChange={setShowNlu} label={t('chat.nluToggle')} />
        <Button variant="ghost" size="sm" icon={<MessageSquarePlus className="h-4 w-4" aria-hidden />} onClick={reset} disabled={messages.length === 0}>
          {t('chat.new')}
        </Button>
      </header>

      <section className="card scrollbar-thin flex-1 overflow-y-auto p-4 sm:p-6" aria-label={t('chat.conversation')} aria-live="polite" aria-busy={send.isPending}>
        {history.isFetching && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6 text-forest-600" label={t('common.loading')} /></div>
        ) : messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
            <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-forest-50 text-forest-700 ring-8 ring-forest-50/50" aria-hidden>
              <Bot className="h-8 w-8" />
            </span>
            <h2 className="text-lg font-semibold text-ink">{t('chat.empty.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('chat.empty.hint')}</p>
            <ul className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => submit(s)} className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink transition-colors hover:border-teal hover:bg-[#F0FAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-5">
            {messages.map((m) => {
              const mine = m.role === 'user';
              return (
                <li key={m.id} className={cn('flex items-end gap-2.5', mine && 'flex-row-reverse')}>
                  <span className={cn('mb-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full', mine ? 'bg-teal text-white' : 'bg-forest-700 text-white')} aria-hidden>
                    {mine ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </span>
                  <div className={cn('flex max-w-[min(42rem,85%)] flex-col', mine ? 'items-end' : 'items-start')}>
                    <span className="sr-only">{mine ? t('chat.you') : t('chat.assistant')}</span>
                    <div
                      className={cn(
                        'whitespace-pre-line rounded-3xl px-4 py-3 text-[0.9375rem] leading-relaxed',
                        mine ? 'rounded-ee-md bg-forest-700 text-white' : 'rounded-es-md border border-line bg-canvas text-ink',
                        m.status === 'missing_data' && 'border-warning/40 bg-[#FFF9EF]',
                      )}
                      dir="auto"
                    >
                      {m.text}
                    </div>
                    {!mine && (m.status === 'clarification' || m.status === 'missing_data' || m.status === 'fallback') ? (
                      <Badge tone={m.status === 'missing_data' ? 'warning' : 'outline'} size="xs" className="mt-1.5">
                        {t(`chat.status.${m.status}` as const)}
                      </Badge>
                    ) : null}
                    {!mine && m.options?.length ? (
                      <ul className="mt-2 flex flex-wrap gap-2" aria-label={t('chat.quickReplies')}>
                        {m.options.map((o) => (
                          <li key={`${m.id}-${o.value}`}>
                            <button
                              type="button"
                              disabled={send.isPending || m !== lastAssistant}
                              onClick={() => submit(o.value, o.label)}
                              className="rounded-full border border-teal/50 bg-surface px-3 py-1.5 text-sm font-medium text-[#0B6B63] transition-colors hover:bg-[#E0F4F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {o.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {!mine && m.explanation ? (
                      <Button variant="subtle" size="xs" className="mt-2" icon={<Brain className="h-3.5 w-3.5" aria-hidden />} onClick={() => setReasoning(m.explanation ?? null)}>
                        {t('chat.showReasoning')}
                      </Button>
                    ) : null}
                    {!mine && showNlu && m.nlu ? <NluPanel m={m} /> : null}
                  </div>
                </li>
              );
            })}
            {send.isPending ? (
              <li className="flex items-end gap-2.5">
                <span className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-forest-700 text-white" aria-hidden>
                  <Bot className="h-4 w-4" />
                </span>
                <div className="flex gap-1 rounded-3xl rounded-es-md border border-line bg-canvas px-4 py-4" role="status" aria-label={t('chat.thinking')}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-forest-300" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </li>
            ) : null}
          </ol>
        )}
        <div ref={endRef} />
      </section>

      <form onSubmit={onSubmit} className="card mt-4 flex items-end gap-2 p-2.5">
        <label htmlFor="chat-input" className="sr-only">
          {t('chat.placeholder')}
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={1000}
          dir="auto"
          placeholder={t('chat.placeholder')}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-xl bg-transparent px-3 py-2.5 text-[0.9375rem] text-ink placeholder:text-muted/70 focus:outline-none"
        />
        <Button type="submit" size="md" className="h-11 w-11 shrink-0 px-0" disabled={!input.trim()} loading={send.isPending} aria-label={t('chat.send')}>
          {send.isPending ? null : <SendHorizontal className={cn('h-5 w-5', dir === 'rtl' && '-scale-x-100')} aria-hidden />}
        </Button>
      </form>
      <p className="mt-1.5 text-center text-[11px] text-muted">{t('chat.inputHint')}</p>

      <Drawer open={!!reasoning} onClose={() => setReasoning(null)} title={t('chat.reasoningTitle')} description={t('chat.reasoningHint')} width="xl">
        {reasoning ? <RecommendationCard explanation={reasoning} /> : null}
      </Drawer>
    </div>
  );
}
