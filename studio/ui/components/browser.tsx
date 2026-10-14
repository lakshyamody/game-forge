'use client';
/** The centre: document tabs, a browser toolbar (reload · address · viewport · open outside) and the page. */
import { useEffect, useRef, useState } from 'react';
import { RotateCw, ExternalLink, Smartphone, X, Plus, LayoutGrid, Boxes, Lock, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS, TEMPLATES } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { IconButton, Spinner, Thumb } from './ui';

function tabInfo(s: Studio, key: string) {
  if (key === NEW) return { title: 'New Game', icon: <FileCode2 size={13} strokeWidth={1.75} className="text-subtle" /> };
  if (key === PAGE_ARCADE) return { title: 'Arcade', icon: <LayoutGrid size={13} strokeWidth={1.75} className="text-subtle" /> };
  if (key === PAGE_ASSETS) return { title: 'Asset Library', icon: <Boxes size={13} strokeWidth={1.75} className="text-subtle" /> };
  const g = s.games.find((x) => x.slug === key);
  return { title: g?.title ?? key, icon: g ? <Thumb g={g} url={s.thumbUrl(g)} className="h-3 w-[18px]" /> : null };
}

export function Tabs({ s }: { s: Studio }) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-chrome">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]">
        {s.tabs.map((key) => {
          const { title, icon } = tabInfo(s, key), on = key === s.active;
          return (
            <div key={key} role="tab" aria-selected={on} onMouseDown={(e) => { if (e.button === 1) s.close(key); }} onClick={() => s.setActive(key)}
              className={cn('group relative flex min-w-[120px] max-w-[210px] shrink-0 cursor-default items-center gap-2 border-r border-line pl-3 pr-1.5 text-[12.5px]',
                on ? 'bg-bg text-fg' : 'text-muted hover:text-fg')}>
              {on && <span className="absolute inset-x-0 -bottom-px h-px bg-bg" />}
              {s.busy.has(key) ? <Spinner className="text-accent" /> : icon}
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <button aria-label={`Close ${title}`} title="Close (⌘W)" onClick={(e) => { e.stopPropagation(); s.close(key); }}
                className={cn('grid h-5 w-5 place-items-center rounded text-subtle hover:bg-hover hover:text-fg', !on && 'invisible group-hover:visible')}>
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
      <IconButton label="New game (⌘N)" className="mx-1 self-center" onClick={() => s.open(NEW)}><Plus size={15} strokeWidth={1.75} /></IconButton>
    </div>
  );
}

export function Browser({ s, addressRef }: { s: Studio; addressRef: React.RefObject<HTMLInputElement | null> }) {
  const key = s.active;
  const base = s.env?.port ? `http://localhost:${s.env.port}/` : '';
  const page = key === PAGE_ARCADE ? base : key === PAGE_ASSETS ? `${base}assets.html` : key !== NEW && base ? s.previewUrl(key) : '';
  const [query, setQuery] = useState<Record<string, string>>({});   // per-tab ?query from the address bar
  const [mobile, setMobile] = useState(false);
  const url = page && (query[key] ? `${page}?${query[key]}` : page);
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  const go = () => { setQuery((x) => ({ ...x, [key]: draft.split('?')[1] ?? '' })); if (key !== NEW) s.reload(key); };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg">
      <Tabs s={s} />
      {key === NEW ? <NewGame s={s} /> : (
        <>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
            <IconButton label="Reload (⌘R)" onClick={() => s.reload(key)}><RotateCw size={14} strokeWidth={1.75} /></IconButton>
            <form className="mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-chrome px-2.5 ring-1 ring-line focus-within:bg-bg focus-within:ring-accent" onSubmit={(e) => { e.preventDefault(); go(); }}>
              <Lock size={11} strokeWidth={2} className="shrink-0 text-subtle" />
              <input ref={addressRef} value={draft.replace(/^http:\/\//, '')} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="Address"
                title="Add ?god, ?tune or a game's debug flags, then press Return"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-muted outline-none focus:text-fg" />
            </form>
            <IconButton label={mobile ? 'Fit window' : 'Phone size (390 × 844)'} active={mobile} onClick={() => setMobile((m) => !m)}><Smartphone size={14} strokeWidth={1.75} /></IconButton>
            <IconButton label="Open in browser" onClick={() => url && s.api?.openExternal(url)}><ExternalLink size={14} strokeWidth={1.75} /></IconButton>
          </div>
          <div className={cn('relative min-h-0 flex-1', mobile ? 'grid place-items-center bg-chrome p-6' : 'bg-[#0b0b0c]')}>
            {url ? (
              <iframe key={`${key}:${s.reloads[key] ?? 0}`} src={url} title="Game preview" allow="autoplay; fullscreen; pointer-lock; gamepad"
                className={cn('border-0 bg-black', mobile ? 'h-[min(844px,100%)] w-[390px] rounded-[10px] shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_12px_40px_rgba(0,0,0,0.18)]' : 'absolute inset-0 h-full w-full')} />
            ) : <div className="grid h-full place-items-center text-[12px] text-subtle">Starting the game server…</div>}
          </div>
        </>
      )}
    </section>
  );
}

/** start page for a new game: real templates and real games, nothing invented */
function NewGame({ s }: { s: Studio }) {
  const pick = (name: string) => s.setDraft(NEW, `Make a ${name.toLowerCase()} game where `);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-10 pb-16 pt-12">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">New Game</h1>
        <p className="mt-1 text-[13px] text-muted">Describe the game in the agent panel. Pick a starting point to pre-fill it, or start from scratch.</p>

        <h2 className="mb-2 mt-8 text-[12px] font-semibold text-muted">Starting points</h2>
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => pick(t.name)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-chrome">
              <span className="w-40 shrink-0 text-[13px] font-medium">{t.name}</span>
              <span className="flex-1 text-[12.5px] text-muted">{t.note}</span>
              <code className="font-mono text-[11px] text-subtle">templates/{t.id}</code>
            </button>
          ))}
        </div>

        {!!s.games.length && <>
          <h2 className="mb-2 mt-10 text-[12px] font-semibold text-muted">Recent games</h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-5">
            {s.games.map((g) => (
              <button key={g.slug} onClick={() => s.open(g.slug)} className="group text-left">
                <Thumb g={g} url={s.thumbUrl(g)} className="aspect-[16/10] w-full rounded-md transition-shadow group-hover:shadow-[0_0_0_2px_#2563eb]" />
                <span className="mt-1.5 block truncate text-[13px] font-medium">{g.title}</span>
                <span className="block truncate text-[12px] text-subtle">{g.tagline}</span>
              </button>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}
