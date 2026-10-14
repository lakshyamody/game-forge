'use client';
/** The top bar: logo, open tabs as pills (new game, games, arcade, asset library), and search. */
import { useMemo, useRef, useState, type RefObject } from 'react';
import { Sparkles, LayoutGrid, Boxes, X, Search as SearchIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS, IS_MAC, kbd } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { Kbd, Mark, Spinner, Square } from './ui';

const PAGES: Record<string, { title: string; Icon: typeof Sparkles }> = {
  [NEW]: { title: 'New game', Icon: Sparkles }, [PAGE_ARCADE]: { title: 'Arcade', Icon: LayoutGrid }, [PAGE_ASSETS]: { title: 'Asset library', Icon: Boxes },
};

function TabIcon({ s, k }: { s: Studio; k: string }) {
  if (s.busy.has(k)) return <Spinner className="h-[15px] w-[15px] text-accent" />;
  const p = PAGES[k];
  if (p) return <p.Icon size={16} strokeWidth={1.8} />;
  return <Square color={s.games.find((g) => g.slug === k)?.color ?? '#999'} />;
}

export function TopBar({ s, searchRef }: { s: Studio; searchRef: RefObject<HTMLInputElement | null> }) {
  return (
    <header className={cn('drag flex h-14 shrink-0 items-center gap-1 border-b border-line', IS_MAC ? 'pl-[84px] pr-4' : 'pl-4 pr-[150px]')}>
      <span className="mr-3 flex items-center"><Mark size={22} /></span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {s.tabs.map((k) => {
          const on = k === s.active, title = PAGES[k]?.title ?? s.games.find((g) => g.slug === k)?.title ?? k;
          return (
            <div key={k} role="tab" aria-selected={on} title={title} onClick={() => s.setActive(k)} onMouseDown={(e) => { if (e.button === 1) s.close(k); }}
              className={cn('group flex h-8 max-w-[240px] shrink-0 cursor-default items-center gap-2 rounded-lg pr-1.5 pl-3 text-[14.5px] transition-colors',
                on ? 'bg-hover text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg')}>
              <span className={cn('grid w-4 place-items-center', on ? 'text-fg' : 'text-muted')}><TabIcon s={s} k={k} /></span>
              <span className="truncate">{title}</span>
              <button aria-label={`Close ${title}`} title={`Close tab (${kbd('W')})`} onClick={(e) => { e.stopPropagation(); s.close(k); }}
                className={cn('grid h-5 w-5 place-items-center rounded-md text-subtle hover:bg-line hover:text-fg', !on && 'invisible group-hover:visible')}><X size={12} strokeWidth={2.2} /></button>
            </div>
          );
        })}
      </div>
      <Search s={s} inputRef={searchRef} />
    </header>
  );
}

/** search games and pages; Return opens the first match */
function Search({ s, inputRef }: { s: Studio; inputRef: RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = useState(''), [focus, setFocus] = useState(false), [sel, setSel] = useState(0);
  const blur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const results = useMemo(() => {
    const all = [...s.games.map((g) => ({ key: g.slug, title: g.title, note: g.engine, color: g.color })),
      ...Object.entries(PAGES).map(([key, p]) => ({ key, title: p.title, note: 'Page', color: '' }))];
    const t = q.trim().toLowerCase();
    return (t ? all.filter((r) => r.title.toLowerCase().includes(t) || r.key.includes(t)) : all).slice(0, 8);
  }, [q, s.games]);
  const go = (key: string) => { s.open(key); setQ(''); inputRef.current?.blur(); };
  return (
    <div className="relative ml-3 w-[320px] shrink-0">
      <div className="flex h-9 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-line-strong">
        <SearchIcon size={15} strokeWidth={1.8} className="shrink-0 text-subtle" />
        <input ref={inputRef} value={q} placeholder="Search games" aria-label="Search games" spellCheck={false}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onFocus={() => { clearTimeout(blur.current); setFocus(true); }} onBlur={() => { blur.current = setTimeout(() => setFocus(false), 120); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(results.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
            // preventDefault: the chat box takes focus right away and would otherwise receive this Return as a newline
            else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) go(results[sel].key); }
            else if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); }
          }}
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-subtle" />
        <Kbd>{kbd('K')}</Kbd>
      </div>
      {focus && (
        <div className="absolute top-11 right-0 left-0 z-30 rounded-xl border border-line bg-panel p-1 shadow-card">
          {results.length ? results.map((r, i) => (
            <button key={r.key} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.key)} onMouseEnter={() => setSel(i)}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[14px]', i === sel && 'bg-hover')}>
              <span className="grid w-4 place-items-center text-muted">{r.color ? <Square color={r.color} /> : (() => { const P = PAGES[r.key]; return <P.Icon size={15} strokeWidth={1.8} />; })()}</span>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="text-[12.5px] text-subtle">{r.note}</span>
            </button>
          )) : <p className="px-2.5 py-2 text-[13.5px] text-subtle">No games match “{q}”</p>}
        </div>
      )}
    </div>
  );
}
