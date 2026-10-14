'use client';
/** Cursor-style agent panel: conversation with Claude Code for the active tab, kid-check fixes, composer. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Square, SquarePen, Download, ChevronRight, FileEdit, FileText, Terminal, Search, BookOpen, Globe, ListChecks, Wrench, Package, ShieldAlert, RotateCcw, Check, Sparkles, AtSign, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW } from '@/lib/studio';
import type { Msg, Studio } from '@/lib/use-studio';
import { Button, GameIcon, IconButton } from './ui';

const TWEAKS = ['Make it harder', 'Make it easier', 'Add a boss', 'Make it look nicer', 'Add sound effects', 'Add a high score'];
const STARTERS = ['A racing game in a city made of blocks', 'Dodge falling meteors with a tiny spaceship', 'Knights defend a castle from skeletons'];

/** tiny safe markdown: escape, then **bold**, `code`, bullets */
const md = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^[-•] /gm, '• ');

/** tool lines arrive as "✏️ Editing games/x/main.ts" — map the emoji to an icon and drop it */
const EMOJI = /^\p{Extended_Pictographic}️?\s*/u;
function stepIcon(text: string) {
  const e = text.match(EMOJI)?.[0].trim() ?? '';
  const i = { '✏️': FileEdit, '✏': FileEdit, '📖': FileText, '⚙️': Terminal, '⚙': Terminal, '🔎': Search, '📘': BookOpen, '🌐': Globe, '📝': ListChecks }[e]
    ?? (/fix/i.test(text) ? Wrench : /zip|pack/i.test(text) ? Package : Terminal);
  return { Icon: i, label: text.replace(EMOJI, '') };
}

type Block = { kind: 'steps'; id: number; items: Msg[] } | Msg;
function blocks(list: Msg[]): Block[] {
  const out: Block[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (m.kind === 'tool') { if (last && last.kind === 'steps') last.items.push(m); else out.push({ kind: 'steps', id: m.id, items: [m] }); }
    else out.push(m);
  }
  return out;
}

export function Agent({ s, width }: { s: Studio; width: number }) {
  const key = s.games.some((g) => g.slug === s.active) ? s.active : NEW;   // pages (arcade, assets) talk in the new-game chat
  const g = s.games.find((x) => x.slug === key) ?? null;
  const list = s.chats[key] ?? [], busy = s.busy.has(key);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [list.length, busy]);
  const bl = useMemo(() => blocks(list), [list]);

  return (
    <aside className="flex shrink-0 flex-col border-l border-line bg-panel" style={{ width }}>
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5">
        <span className="text-[12px] font-semibold">Agent</span>
        <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-raised px-1.5 py-0.5 text-[11.5px] text-muted">
          {g ? <GameIcon color={g.color} title={g.title} size={12} /> : <Sparkles size={11} className="text-accent" />}
          <span className="truncate">{g ? g.title : 'New game'}</span>
        </span>
        <div className="flex-1" />
        {g && <IconButton label="Export for itch.io" onClick={() => void s.exportGame(g.slug)}><Download size={14} /></IconButton>}
        <IconButton label="New chat" onClick={() => void s.resetChat(key)}><SquarePen size={14} /></IconButton>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-3">
        {!list.length && <Empty game={g?.title ?? null} />}
        <div className="flex flex-col gap-3">
          {bl.map((b) => <MsgView key={b.kind === 'steps' ? `s${b.id}` : b.id} b={b} s={s} chatKey={key} running={busy} />)}
          {busy && <div className="thinking flex items-center gap-2 py-1 text-[12px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-accent" /><span className="h-1.5 w-1.5 rounded-full bg-accent" /><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Working</div>}
        </div>
      </div>

      {g && g.fixes.length > 0 && <Fixes s={s} slug={g.slug} />}
      <Composer s={s} chatKey={key} game={g?.title ?? null} busy={busy} empty={!list.length} />
    </aside>
  );
}

function Empty({ game }: { game: string | null }) {
  return (
    <div className="mt-10 flex flex-col items-center px-4 text-center">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-line-strong bg-raised"><Wand2 size={16} className="text-muted" /></div>
      <div className="text-[13px] font-medium">{game ? `Change ${game}` : 'Build a new game'}</div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
        {game ? 'Ask in plain words — “make the enemies slower”, “add a jump”, “purple sky”. The preview reloads by itself.'
          : 'Describe a game in a sentence or two. Claude Code builds it, playtests it and hands it over with five one-click polish fixes.'}
      </p>
    </div>
  );
}

function MsgView({ b, s, chatKey, running }: { b: Block; s: Studio; chatKey: string; running: boolean }) {
  if (b.kind === 'steps') return <Steps items={b.items} running={running} />;
  if (b.kind === 'user') return <div className="rounded-lg border border-line-strong bg-raised px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">{b.text}</div>;
  if (b.kind === 'bot') return <div className="md px-0.5 text-[13px] leading-[1.65] whitespace-pre-wrap text-[#d6d6db]" dangerouslySetInnerHTML={{ __html: md(b.text) }} />;
  if (b.kind === 'tool') return null;   // always grouped into steps
  if (b.kind === 'err') return <div className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-[#ffb4b7]">{b.text}</div>;
  const a = b as Extract<Msg, { kind: 'perm' | 'retry' }>, perm = a.kind === 'perm';
  return (
    <Callout icon={perm ? <ShieldAlert size={14} className="text-warn" /> : <RotateCcw size={14} className="text-warn" />}
      action={<Button size="sm" variant="primary" disabled={a.done} onClick={async () => {
        s.patch(chatKey, a.id, { done: true });
        if (a.kind === 'perm') { await s.api?.allow(a.rule); await s.send(`I've allowed ${a.what}. Please continue.`, chatKey); }
        else await s.send('Please continue where you left off.', chatKey);
      }}>{a.done ? <><Check size={13} /> Done</> : perm ? 'Allow & continue' : 'Retry'}</Button>}>
      {a.kind === 'perm' ? <>Claude Code wants to run <code className="font-mono text-[12px] text-warn">{a.what}</code></> : a.text}
    </Callout>
  );
}

function Callout({ icon, action, children }: { icon: ReactNode; action: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[12.5px]">
      {icon}<div className="min-w-0 flex-1 break-words">{children}</div>{action}
    </div>
  );
}

/** consecutive tool calls → one collapsible "N steps" block (latest step shown while working) */
function Steps({ items, running }: { items: Msg[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  const last = stepIcon(items[items.length - 1].kind === 'tool' ? (items[items.length - 1] as { text: string }).text : '');
  return (
    <div className="rounded-lg border border-line bg-bg/40">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-muted hover:text-fg">
        <ChevronRight size={13} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="shrink-0 font-medium">{items.length === 1 ? '1 step' : `${items.length} steps`}</span>
        {!open && <span className="flex min-w-0 items-center gap-1.5 text-subtle"><last.Icon size={12} className="shrink-0" /><span className="truncate">{last.label}</span></span>}
        {running && !open && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
      </button>
      {open && (
        <ul className="border-t border-line px-2.5 py-1.5">
          {items.map((m) => { const st = stepIcon((m as { text: string }).text); return (
            <li key={m.id} className="flex items-center gap-2 py-[3px] text-[12px] text-muted"><st.Icon size={12} className="shrink-0 text-subtle" /><span className="truncate font-mono text-[11.5px]">{st.label}</span></li>
          ); })}
        </ul>
      )}
    </div>
  );
}

/** the five staged kid-check fixes as a checklist */
function Fixes({ s, slug }: { s: Studio; slug: string }) {
  const g = s.games.find((x) => x.slug === slug)!;
  const [open, setOpen] = useState(true), [pending, setPending] = useState<number | 'all' | null>(null);
  const left = g.fixes.filter((f) => !f.done).length;
  const run = async (n: number | 'all', undo: boolean) => { setPending(n); await s.runFix(slug, n, undo); setPending(null); };
  return (
    <div className="mx-3 mb-2 rounded-lg border border-line bg-raised/60">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronRight size={13} className={cn('text-subtle transition-transform', open && 'rotate-90')} />
        <span className="text-[12px] font-medium">Kid check</span>
        <span className="text-[11.5px] text-subtle">{left ? `${left} of ${g.fixes.length} ready to apply` : 'all applied'}</span>
        <div className="flex-1" />
        {left > 1 && <Button size="sm" variant="secondary" className="h-6 px-2 text-[11.5px]" disabled={pending !== null} onClick={(e) => { e.stopPropagation(); void run('all', false); }}>Fix all</Button>}
      </button>
      {open && (
        <ul className="max-h-44 overflow-y-auto border-t border-line py-1">
          {g.fixes.map((f) => (
            <li key={f.n}>
              <button disabled={pending !== null} onClick={() => void run(f.n, f.done)} title={f.done ? 'Applied — click to undo' : 'Click to apply'}
                className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left text-[12px] hover:bg-hover disabled:opacity-60">
                <span className={cn('mt-[1px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border', f.done ? 'border-ok bg-ok text-bg' : 'border-line-strong')}>
                  {f.done && <Check size={10} strokeWidth={3} />}
                </span>
                <span className={cn('leading-snug', f.done ? 'text-subtle line-through' : 'text-muted')}>{f.text}</span>
                {pending === f.n && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ s, chatKey, game, busy, empty }: { s: Studio; chatKey: string; game: string | null; busy: boolean; empty: boolean }) {
  const [text, setText] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = ta.current; if (t) { t.style.height = '0'; t.style.height = `${Math.min(180, t.scrollHeight)}px`; } }, [text]);
  useEffect(() => { ta.current?.focus(); }, [chatKey]);
  const submit = () => { if (!text.trim() || busy) return; void s.send(text, chatKey); setText(''); };
  const ideas = game ? TWEAKS : STARTERS;
  return (
    <div className="shrink-0 px-3 pb-3">
      {empty && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {ideas.map((t) => (
            <button key={t} onClick={() => { setText(game ? t : `Make a game: ${t.toLowerCase()}`); ta.current?.focus(); }}
              className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-line-strong hover:text-fg">{t}</button>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-line-strong bg-raised transition-colors focus-within:border-[#45454d]">
        <textarea ref={ta} rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={!s.ready && !!s.env}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={game ? `Ask for a change to ${game}…` : 'Describe the game you want to make…'}
          className="block max-h-[180px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed text-fg outline-none placeholder:text-subtle" />
        <div className="flex items-center gap-2 px-2 pb-2">
          <span className="flex items-center gap-1 rounded-md bg-hover px-1.5 py-0.5 text-[11px] text-muted"><AtSign size={11} />{game ?? 'new game'}</span>
          <span className="text-[11px] text-subtle">Claude Code</span>
          <div className="flex-1" />
          {busy
            ? <button aria-label="Stop" title="Stop" onClick={() => void s.api?.stop(chatKey)} className="grid h-7 w-7 place-items-center rounded-full bg-fg text-bg hover:bg-white"><Square size={11} fill="currentColor" /></button>
            : <button aria-label="Send" title="Send  ⏎" onClick={submit} disabled={!text.trim()} className="grid h-7 w-7 place-items-center rounded-full bg-fg text-bg transition-opacity hover:bg-white disabled:opacity-30"><ArrowUp size={15} strokeWidth={2.4} /></button>}
        </div>
      </div>
    </div>
  );
}
