'use client';
/** The conversation with Claude Code: message list and composer, shared by the home page (centred) and the game thread (side panel). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Terminal, PencilLine, FileText, Search, BookOpen, Globe, ListChecks, ShieldAlert, RotateCcw, ArrowUp, Square as StopIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Msg, Studio } from '@/lib/use-studio';
import { Button, IconButton } from './ui';

const md = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^[-•] /gm, '• ');

const EMOJI = /^\p{Extended_Pictographic}️?\s*/u;
function step(text: string) {
  const e = text.match(EMOJI)?.[0].trim() ?? '';
  const Icon = { '✏️': PencilLine, '✏': PencilLine, '📖': FileText, '⚙️': Terminal, '⚙': Terminal, '🔎': Search, '📘': BookOpen, '🌐': Globe, '📝': ListChecks }[e] ?? Terminal;
  return { Icon, label: text.replace(EMOJI, '') };
}
export const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** consecutive tool calls collapse into one block of steps */
type Chunk = { kind: 'tools'; items: Msg[] } | { kind: 'msg'; m: Msg };
function chunk(items: Msg[]): Chunk[] {
  const out: Chunk[] = [];
  for (const m of items) {
    const last = out[out.length - 1];
    if (m.kind === 'tool') { if (last?.kind === 'tools') last.items.push(m); else out.push({ kind: 'tools', items: [m] }); }
    else out.push({ kind: 'msg', m });
  }
  return out;
}

/** the message list; scrolls to the newest message */
export function Messages({ s, chatKey, className }: { s: Studio; chatKey: string; className?: string }) {
  const list = s.chats[chatKey] ?? [], started = s.busy.get(chatKey);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [list.length, started]);
  return (
    <div className={cn('space-y-4', className)}>
      {chunk(list).map((c) => c.kind === 'tools' ? <Tools key={`t${c.items[0].id}`} items={c.items} /> : <Message key={c.m.id} m={c.m} s={s} chatKey={chatKey} />)}
      {started && <Working started={started} />}
      {s.queued[chatKey] && <div className="flex flex-col items-end gap-1"><div className="max-w-[85%] rounded-2xl bg-bubble px-3.5 py-2 leading-[1.6] whitespace-pre-wrap break-words opacity-55">{s.queued[chatKey]}</div><span className="text-[12px] text-subtle">Queued · sends when Claude Code finishes</span></div>}
      <div ref={end} />
    </div>
  );
}

function Working({ started }: { started: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return <div className="flex items-center gap-2 text-[13px] text-subtle"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />Claude Code is working… {clock(Date.now() - started)}</div>;
}

function Tools({ items }: { items: Msg[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(-3);
  return (
    <div className="space-y-1 border-l-2 border-line pl-3">
      {!all && items.length > 3 && <button onClick={() => setAll(true)} className="text-[12.5px] text-subtle hover:text-fg">+{items.length - 3} earlier steps</button>}
      {shown.map((m) => { const st = step('text' in m ? m.text : ''); return (
        <div key={m.id} className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
          <st.Icon size={13} strokeWidth={1.9} className="shrink-0 text-subtle" /><span className="truncate">{st.label}</span>
        </div>
      ); })}
    </div>
  );
}

function Message({ m, s, chatKey }: { m: Msg; s: Studio; chatKey: string }) {
  const text = 'leading-[1.6] whitespace-pre-wrap break-words';
  if (m.kind === 'user') return <div className="flex justify-end"><div className={cn(text, 'max-w-[85%] rounded-2xl bg-bubble px-3.5 py-2')}>{m.text}</div></div>;
  if (m.kind === 'bot') return <div className={cn(text, 'md')} dangerouslySetInnerHTML={{ __html: md(m.text) }} />;
  if (m.kind === 'note') return <div className="text-[13px] text-subtle">{m.text}</div>;
  if (m.kind === 'err') return <div className={cn(text, 'rounded-xl bg-bad/10 px-3.5 py-2.5 text-[13.5px] text-bad')}>{m.text}</div>;
  if (m.kind === 'tool') return null;
  const a = m as Extract<Msg, { kind: 'perm' | 'retry' }>;
  return (
    <div className="rounded-xl border border-line px-3.5 py-3">
      <div className="flex items-start gap-2 text-[13.5px]">
        {a.kind === 'perm' ? <ShieldAlert size={15} className="mt-[2px] shrink-0 text-warn" /> : <RotateCcw size={15} className="mt-[2px] shrink-0 text-warn" />}
        <span className="min-w-0 break-words">{a.kind === 'perm' ? <>Claude Code needs permission to run <code className="font-mono text-[12.5px]">{a.what}</code></> : a.text}</span>
      </div>
      <Button size="sm" variant="primary" className="mt-2.5" disabled={a.done} onClick={async () => {
        s.patch(chatKey, a.id, { done: true });
        if (a.kind === 'perm') { await s.api?.allow(a.rule); await s.send(`I've allowed ${a.what}. Please continue.`, chatKey); }
        else await s.send('Please continue where you left off.', chatKey);
      }}>{a.done ? 'Done' : a.kind === 'perm' ? 'Allow' : 'Continue'}</Button>
    </div>
  );
}

/** the message box: a white card with a send button; `tools` sit bottom-left, `tray` is the grey strip under the card */
export function Composer({ s, chatKey, placeholder, rows = 1, tools, tray, autoFocus = true }: {
  s: Studio; chatKey: string; placeholder: string; rows?: number; tools?: ReactNode; tray?: ReactNode; autoFocus?: boolean;
}) {
  const text = s.drafts[chatKey] ?? '', setText = (t: string) => s.setDraft(chatKey, t);
  const started = s.busy.get(chatKey);
  const ta = useRef<HTMLTextAreaElement>(null);
  const min = rows * 22 + 10;
  useEffect(() => { const t = ta.current; if (t) { t.style.height = '0'; t.style.height = `${Math.min(200, Math.max(min, t.scrollHeight))}px`; } }, [text, min]);
  const hasText = text !== '';
  useEffect(() => { const t = ta.current; if (t && autoFocus) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, [chatKey, hasText, autoFocus]);
  const submit = () => { if (!text.trim()) return; if (started) s.queue(chatKey, text.trim()); else void s.send(text, chatKey); setText(''); };
  return (
    <div className={cn(tray && 'rounded-2xl bg-raised')}>
      <div className="rounded-2xl border border-line bg-panel px-3.5 pt-2.5 pb-2 shadow-card focus-within:border-line-strong">
        <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} disabled={!s.ready && !!s.env}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          placeholder={s.env && !s.ready ? 'Set up Claude Code to start…' : started ? 'Claude Code is working. Type your next message and it sends after…' : placeholder} aria-label="Message" rows={rows}
          className="block w-full resize-none bg-transparent py-1 text-[15px] leading-[22px] outline-none placeholder:text-subtle disabled:cursor-not-allowed" />
        <div className="mt-1.5 flex items-center gap-2">
          {tools}
          <div className="flex-1" />
          {started
            ? <IconButton label="Stop" onClick={() => void s.stop(chatKey)} className="h-8 w-8 rounded-full bg-fg text-panel hover:bg-fg hover:text-panel hover:opacity-85"><StopIcon size={11} fill="currentColor" /></IconButton>
            : <IconButton label="Send" onClick={submit} disabled={!text.trim()} className="h-8 w-8 rounded-full bg-fg text-panel hover:bg-fg hover:text-panel hover:opacity-85 disabled:bg-hover disabled:text-subtle disabled:opacity-100"><ArrowUp size={16} strokeWidth={2.2} /></IconButton>}
        </div>
      </div>
      {tray && <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-[14px] text-muted">{tray}</div>}
    </div>
  );
}
