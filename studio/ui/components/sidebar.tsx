'use client';
import { Gamepad2, LayoutGrid, Boxes, CircleUser, Plus, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { IconButton, Spinner, Thumb } from './ui';

export function ActivityBar({ s, explorer, toggleExplorer }: { s: Studio; explorer: boolean; toggleExplorer: () => void }) {
  return (
    <nav className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-chrome py-2">
      <IconButton label="Games (⌘B)" active={explorer} onClick={toggleExplorer}><Gamepad2 size={17} strokeWidth={1.75} /></IconButton>
      <IconButton label="Arcade" active={s.active === PAGE_ARCADE} onClick={() => s.open(PAGE_ARCADE)}><LayoutGrid size={16} strokeWidth={1.75} /></IconButton>
      <IconButton label="Asset library" active={s.active === PAGE_ASSETS} onClick={() => s.open(PAGE_ASSETS)}><Boxes size={17} strokeWidth={1.75} /></IconButton>
      <div className="flex-1" />
      <IconButton label="Account (⌘,)" onClick={() => s.setSetupOpen(true)}><CircleUser size={17} strokeWidth={1.75} /></IconButton>
    </nav>
  );
}

export function Explorer({ s }: { s: Studio }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-chrome">
      <div className="flex h-9 shrink-0 items-center justify-between pl-3 pr-1.5">
        <span className="text-[12px] font-semibold text-muted">Games</span>
        <div className="flex">
          <IconButton label="Show games folder in Finder" onClick={() => s.api?.openFolder(null)}><FolderOpen size={14} strokeWidth={1.75} /></IconButton>
          <IconButton label="New game (⌘N)" onClick={() => s.open(NEW)}><Plus size={15} strokeWidth={1.75} /></IconButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {s.games.map((g) => {
          const on = s.active === g.slug;
          return (
            <button key={g.slug} onClick={() => s.open(g.slug)} title={g.tagline}
              className={cn('flex w-full items-center gap-2.5 rounded-md px-1.5 py-[5px] text-left transition-colors',
                on ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
              <Thumb g={g} url={s.thumbUrl(g)} className="h-[18px] w-7" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{g.title}</span>
              {s.busy.has(g.slug) && <Spinner className="text-accent" />}
            </button>
          );
        })}
        {!s.games.length && <p className="px-2 py-4 text-[12px] text-subtle">No games yet.</p>}
      </div>
    </aside>
  );
}
