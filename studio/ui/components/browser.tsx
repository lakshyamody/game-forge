'use client';
/** The centre: editor-style tabs, a browser toolbar (reload · address bar · viewport · open outside) and the page. */
import { useEffect, useRef, useState } from 'react';
import { RotateCw, ExternalLink, Monitor, Smartphone, X, Plus, Globe, Sparkles, Loader2, LayoutGrid, Boxes, FolderOpen, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { GameIcon, IconButton } from './ui';
import { PAGE_ARCADE, PAGE_ASSETS } from './sidebar';

const IDEAS = [
  { t: 'Neon block racer', d: 'Drift through a city made of blocks against the clock' },
  { t: 'Meteor dodger', d: 'A tiny spaceship weaving through falling meteors' },
  { t: 'Kitchen rush', d: 'A cooking game where orders keep getting faster' },
  { t: 'Castle siege', d: 'Knights defend the walls from waves of skeletons' },
  { t: 'Star platformer', d: 'Jump, wall-slide and collect stars across 5 levels' },
  { t: 'Night taxi', d: 'Drive fares across a realistic city before the meter runs out' },
];

function tabInfo(s: Studio, key: string) {
  if (key === NEW) return { title: 'New game', icon: <Sparkles size={13} className="text-accent" /> };
  if (key === PAGE_ARCADE) return { title: 'Arcade', icon: <LayoutGrid size={13} className="text-muted" /> };
  if (key === PAGE_ASSETS) return { title: 'Asset library', icon: <Boxes size={13} className="text-muted" /> };
  const g = s.games.find((x) => x.slug === key);
  return { title: g?.title ?? key, icon: <GameIcon color={g?.color ?? '#666'} title={g?.title ?? key} size={14} /> };
}

export function Tabs({ s }: { s: Studio }) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-panel">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]">
        {s.tabs.map((key) => {
          const { title, icon } = tabInfo(s, key), on = key === s.active;
          return (
            <div key={key} onMouseDown={(e) => { if (e.button === 1) s.close(key); }}
              className={cn('group relative flex min-w-[120px] max-w-[200px] shrink-0 cursor-default items-center gap-2 border-r border-line pl-3 pr-1.5 text-[12.5px]',
                on ? 'bg-bg text-fg' : 'text-muted hover:bg-hover hover:text-fg')}
              onClick={() => s.setActive(key)}>
              {on && <span className="absolute inset-x-0 top-0 h-px bg-accent" />}
              {s.busy.has(key) ? <Loader2 size={13} className="animate-spin text-accent" /> : icon}
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <button aria-label={`Close ${title}`} onClick={(e) => { e.stopPropagation(); s.close(key); }}
                className={cn('grid h-5 w-5 place-items-center rounded text-subtle hover:bg-active hover:text-fg', !on && 'opacity-0 group-hover:opacity-100')}>
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <IconButton label="New game" shortcut="⌘N" className="mx-1 self-center" onClick={() => s.open(NEW)}><Plus size={15} /></IconButton>
    </div>
  );
}

export function Browser({ s }: { s: Studio }) {
  const key = s.active;
  const base = s.env?.port ? `http://localhost:${s.env.port}/` : '';
  const page = key === PAGE_ARCADE ? base : key === PAGE_ASSETS ? `${base}assets.html` : key !== NEW && base ? s.previewUrl(key) : '';
  const [query, setQuery] = useState<Record<string, string>>({});   // per-tab ?query typed in the address bar
  const [mobile, setMobile] = useState(false);
  const url = page && (query[key] ? `${page}?${query[key]}` : page);
  const [draft, setDraft] = useState(url);
  const addr = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(url), [url]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.metaKey && e.key === 'l') { e.preventDefault(); addr.current?.select(); } };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);
  const go = () => { const q = draft.split('?')[1] ?? ''; setQuery((x) => ({ ...x, [key]: q })); if (key !== NEW) s.reload(key); };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg">
      <Tabs s={s} />
      {key === NEW ? <NewTab s={s} /> : (
        <>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
            <IconButton label="Reload" shortcut="⌘R" onClick={() => s.reload(key)}><RotateCw size={14} /></IconButton>
            <form className="mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-panel px-2.5 focus-within:border-accent/60" onSubmit={(e) => { e.preventDefault(); go(); }}>
              <Globe size={13} className="shrink-0 text-subtle" />
              <input ref={addr} value={draft.replace(/^http:\/\//, '')} onChange={(e) => setDraft(e.target.value)} spellCheck={false}
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-muted outline-none focus:text-fg" aria-label="Address" />
              <span className="hidden shrink-0 text-[11px] text-subtle lg:inline">add <code className="font-mono">?god</code>, <code className="font-mono">?tune</code></span>
            </form>
            <IconButton label={mobile ? 'Desktop size' : 'Phone size'} onClick={() => setMobile((m) => !m)} active={mobile}>{mobile ? <Smartphone size={14} /> : <Monitor size={14} />}</IconButton>
            {key !== PAGE_ARCADE && key !== PAGE_ASSETS && <IconButton label="Open game folder" onClick={() => s.api?.openFolder(key)}><FolderOpen size={14} /></IconButton>}
            <IconButton label="Open in your browser" onClick={() => url && s.api?.openExternal(url)}><ExternalLink size={14} /></IconButton>
          </div>
          <div className={cn('relative min-h-0 flex-1', mobile && 'grid place-items-center bg-panel p-6')}>
            {url ? (
              <iframe key={`${key}:${s.reloads[key] ?? 0}`} src={url} title="Game preview" allow="autoplay; fullscreen; pointer-lock; gamepad"
                className={cn('border-0 bg-black', mobile ? 'h-[min(844px,100%)] w-[390px] rounded-[28px] border-[6px] border-[#1c1c20] shadow-2xl' : 'absolute inset-0 h-full w-full')} />
            ) : <div className="grid h-full place-items-center text-subtle">Starting the game server…</div>}
          </div>
        </>
      )}
    </section>
  );
}

/** like a browser's new-tab page: start a game from an idea, or jump back into one */
function NewTab({ s }: { s: Studio }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[880px] px-10 py-14">
        <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-accent"><Sparkles size={14} /> New game</div>
        <h1 className="text-[28px] font-semibold tracking-tight">What do you want to make?</h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-muted">
          Describe it in the chat on the right. Claude Code designs it, builds it, playtests it, and lists five things to polish — each a single click to fix. About 20–30 minutes.
        </p>
        <h2 className="mb-3 mt-10 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Start from an idea</h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {IDEAS.map((i) => (
            <button key={i.t} onClick={() => void s.send(`Make a game: ${i.t.toLowerCase()} — ${i.d.toLowerCase()}`, NEW)} disabled={s.busy.has(NEW)}
              className="group rounded-lg border border-line bg-panel p-3.5 text-left transition-colors hover:border-line-strong hover:bg-raised disabled:opacity-50">
              <div className="flex items-center justify-between text-[13px] font-medium">{i.t}<ArrowUpRight size={14} className="text-subtle transition-colors group-hover:text-fg" /></div>
              <div className="mt-1 text-[12px] leading-snug text-muted">{i.d}</div>
            </button>
          ))}
        </div>
        {!!s.games.length && <>
          <h2 className="mb-3 mt-10 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Your games</h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {s.games.map((g) => (
              <button key={g.slug} onClick={() => s.open(g.slug)}
                className="flex items-start gap-3 rounded-lg border border-line bg-panel p-3 text-left transition-colors hover:border-line-strong hover:bg-raised">
                <GameIcon color={g.color} title={g.title} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{g.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted">{g.tagline}</span>
                </span>
              </button>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}
