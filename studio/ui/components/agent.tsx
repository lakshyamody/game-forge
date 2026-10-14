'use client';
/** The agent panel: conversation with Claude Code for the active tab, the kid-check fixes, and the composer. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Square, SquarePen, ChevronRight, FileText, Terminal, Search, BookOpen, Globe, ListChecks, PencilLine, ShieldAlert, RotateCcw, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW } from '@/lib/studio';
import type { Msg, Studio } from '@/lib/use-studio';
import { Button, IconButton, Spinner } from './ui';

/** tiny safe markdown: escape, then **bold**, `code`, bullets */
const md = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^[-•] /gm, '• ');

/** tool lines arrive as "✏️ Editing games/x/main.ts" — map the emoji to an icon and drop it */
const EMOJI = /^\p{Extended_Pictographic}️?\s*/u;
function step(text: string) {
  const e = text.match(EMOJI)?.[0].trim() ?? '';
  const Icon = { '✏️': PencilLine, '✏': PencilLine, '📖': FileText, '⚙️': Terminal, '⚙': Terminal, '🔎': Search, '📘': BookOpen, '🌐': Globe, '📝': ListChecks }[e] ?? Terminal;
  return { Icon, label: text.replace(EMOJI, '') };
}

type Block = { kind: 'steps'; id: number; items: { id: number; text: string }[] } | Msg;
function blocks(list: Msg[]): Block[] {
  const out: Block[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (m.kind === 'tool') { if (last?.kind === 'steps') last.items.push(m); else out.push({ kind: 'steps', id: m.id, items: [m] }); }
    else out.push(m);
  }
  return out;
}

const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function Agent({ s, width }: { s: Studio; width: number }) {
  const key = s.games.some((g) => g.slug === s.active) ? s.active : NEW;   // arcade / assets tabs use the new-game chat
  const g = s.games.find((x) => x.slug === key) ?? null;
  const list = s.chats[key] ?? [], started = s.busy.get(key);
  const scroller = useRef<HTMLDivElement>(null);
  const bl = useMemo(() => blocks(list), [list]);
  const [, tick] = useState(0);
  useEffect(() => { if (!started) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [started]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [list.length, started]);

  return (
    <aside className="flex shrink-0 flex-col border-l border-line bg-bg" style={{ width }}>
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-chrome pl-3 pr-1.5">
        <span className="text-[12px] font-semibold text-muted">Agent</span>
        <span className="truncate text-[12px] text-subtle">{g ? g.title : 'New Game'}</span>
        <div className="flex-1" />
        <IconButton label="New conversation" onClick={() => void s.resetChat(key)}><SquarePen size={14} strokeWidth={1.75} /></IconButton>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
        {!list.length && (
          <p className="text-[12.5px] leading-relaxed text-subtle">
            {g ? `Describe a change to ${g.title}. The preview reloads when it's done.` : "Describe the game you want. The agent builds it, playtests it, and suggests five visual fixes when it's finished."}
          </p>
        )}
        <div className="flex flex-col gap-3.5">
          {bl.map((b) => <MsgView key={b.kind === 'steps' ? `s${b.id}` : b.id} b={b} s={s} chatKey={key} />)}
          {started && <div className="flex items-center gap-2 text-[12px] text-subtle"><Spinner className="text-accent" /> Working · {clock(Date.now() - started)}</div>}
        </div>
      </div>

      {g && g.fixes.length > 0 && <Fixes s={s} slug={g.slug} />}
      <Composer s={s} chatKey={key} game={g?.title ?? null} busy={!!started} />
    </aside>
  );
}

function MsgView({ b, s, chatKey }: { b: Block; s: Studio; chatKey: string }) {
  if (b.kind === 'steps') return <Steps items={b.items} />;
  if (b.kind === 'tool') return null;
  if (b.kind === 'user') return <div className="rounded-md bg-chrome px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ring-1 ring-line">{b.text}</div>;
  if (b.kind === 'bot') return <div className="md text-[13px] leading-[1.6] whitespace-pre-wrap text-fg" dangerouslySetInnerHTML={{ __html: md(b.text) }} />;
  if (b.kind === 'err') return <div className="rounded-md border border-bad/25 bg-[#fef2f2] px-3 py-2 text-[12.5px] whitespace-pre-wrap text-[#991b1b]">{b.text}</div>;
  const a = b as Extract<Msg, { kind: 'perm' | 'retry' }>;
  return (
    <Notice icon={a.kind === 'perm' ? <ShieldAlert size={14} strokeWidth={1.75} /> : <RotateCcw size={14} strokeWidth={1.75} />}
      action={<Button size="sm" variant={a.done ? 'secondary' : 'primary'} disabled={a.done} onClick={async () => {
        s.patch(chatKey, a.id, { done: true });
        if (a.kind === 'perm') { await s.api?.allow(a.rule); await s.send(`I've allowed ${a.what}. Please continue.`, chatKey); }
        else await s.send('Please continue where you left off.', chatKey);
      }}>{a.done ? <><Check size={13} /> {a.kind === 'perm' ? 'Allowed' : 'Resumed'}</> : a.kind === 'perm' ? 'Allow' : 'Continue'}</Button>}>
      {a.kind === 'perm' ? <>The agent needs permission to run <code className="font-mono text-[12px]">{a.what}</code>.</> : a.text}
    </Notice>
  );
}

function Notice({ icon, action, children }: { icon: ReactNode; action: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12.5px] text-[#78350f]">
      <span className="text-warn">{icon}</span><div className="min-w-0 flex-1 break-words">{children}</div>{action}
    </div>
  );
}

/** consecutive tool calls → one collapsible line: "6 steps · Editing games/x/main.ts" */
function Steps({ items }: { items: { id: number; text: string }[] }) {
  const [open, setOpen] = useState(false);
  const last = step(items[items.length - 1].text);
  return (
    <div className="text-[12px]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 text-left text-subtle hover:text-muted">
        <ChevronRight size={13} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="shrink-0">{items.length} {items.length === 1 ? 'step' : 'steps'}</span>
        {!open && <><span className="text-line-strong">·</span><span className="truncate">{last.label}</span></>}
      </button>
      {open && (
        <ul className="mt-1 ml-[5px] border-l border-line pl-3">
          {items.map((m) => { const st = step(m.text); return (
            <li key={m.id} className="flex items-center gap-2 py-[3px] text-muted"><st.Icon size={12} strokeWidth={1.75} className="shrink-0 text-subtle" /><span className="truncate font-mono text-[11.5px]">{st.label}</span></li>
          ); })}
        </ul>
      )}
    </div>
  );
}

/** the kid-check fixes as a checklist: tick to apply, untick to revert */
function Fixes({ s, slug }: { s: Studio; slug: string }) {
  const g = s.games.find((x) => x.slug === slug)!;
  const [open, setOpen] = useState(true), [pending, setPending] = useState<number | 'all' | null>(null);
  const left = g.fixes.filter((f) => !f.done).length;
  const run = async (n: number | 'all', undo: boolean) => { setPending(n); await s.runFix(slug, n, undo); setPending(null); };
  return (
    <div className="mx-3 mb-2 rounded-md border border-line">
      <div className="flex h-8 items-center gap-1.5 pl-2 pr-1">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <ChevronRight size={13} className={cn('shrink-0 text-subtle transition-transform', open && 'rotate-90')} />
          <span className="text-[12px] font-medium">Suggested fixes</span>
          <span className="text-[12px] text-subtle">{g.fixes.length - left}/{g.fixes.length}</span>
        </button>
        {left > 1 && <Button size="sm" variant="ghost" className="h-6 px-2 text-accent hover:text-accent" disabled={pending !== null} onClick={() => void run('all', false)}>Apply all</Button>}
      </div>
      {open && (
        <ul className="max-h-48 overflow-y-auto border-t border-line py-1">
          {g.fixes.map((f) => (
            <li key={f.n}>
              <label className={cn('flex cursor-pointer items-start gap-2.5 px-2.5 py-1.5 text-[12.5px] hover:bg-chrome', pending !== null && 'pointer-events-none opacity-60')}>
                <input type="checkbox" checked={f.done} onChange={() => void run(f.n, f.done)} className="mt-[2px] h-3.5 w-3.5 shrink-0 accent-[#2563eb]" />
                <span className={cn('leading-snug', f.done ? 'text-subtle line-through' : 'text-fg')}>{f.text}</span>
                {pending === f.n && <Spinner className="ml-auto mt-[1px]" />}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ s, chatKey, game, busy }: { s: Studio; chatKey: string; game: string | null; busy: boolean }) {
  const text = s.drafts[chatKey] ?? '', setText = (t: string) => s.setDraft(chatKey, t);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = ta.current; if (t) { t.style.height = '0'; t.style.height = `${Math.min(200, t.scrollHeight)}px`; } }, [text]);
  const hasText = text !== '';
  useEffect(() => { const t = ta.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, [chatKey, hasText]);
  const submit = () => { if (!text.trim() || busy) return; void s.send(text, chatKey); setText(''); };
  return (
    <div className="shrink-0 px-3 pb-3">
      <div className="rounded-md bg-bg ring-1 ring-line-strong transition-shadow focus-within:ring-[1.5px] focus-within:ring-accent">
        <textarea ref={ta} rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={!s.ready && !!s.env}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={game ? `Describe a change to ${game}` : 'Describe the game you want to make'}
          className="block max-h-[200px] w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed outline-none placeholder:text-subtle" />
        <div className="flex items-center gap-2 px-2 pb-2">
          <span className="pl-1 text-[11px] text-subtle">{busy ? 'Working…' : '⏎ to send · ⇧⏎ for a new line'}</span>
          <div className="flex-1" />
          {busy
            ? <Button size="sm" variant="secondary" onClick={() => void s.api?.stop(chatKey)}><Square size={10} fill="currentColor" /> Stop</Button>
            : <Button size="sm" variant="primary" onClick={submit} disabled={!text.trim()} aria-label="Send"><ArrowUp size={14} strokeWidth={2.25} /> Send</Button>}
        </div>
      </div>
    </div>
  );
}
