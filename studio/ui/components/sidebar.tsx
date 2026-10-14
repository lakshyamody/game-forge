'use client';
import { Gamepad2, Plus, Boxes, LayoutGrid, Settings, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { GameIcon, IconButton } from './ui';

export const PAGE_ARCADE = 'page:arcade', PAGE_ASSETS = 'page:assets';

/** VS Code / Cursor-style activity bar: one column of icons */
export function ActivityBar({ s, explorer, toggleExplorer }: { s: Studio; explorer: boolean; toggleExplorer: () => void }) {
  return (
    <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
      <IconButton label="Games" shortcut="⌘B" active={explorer} onClick={toggleExplorer}><Gamepad2 size={17} /></IconButton>
      <IconButton label="New game" shortcut="⌘N" onClick={() => s.open(NEW)}><Plus size={17} /></IconButton>
      <IconButton label="Arcade" active={s.active === PAGE_ARCADE} onClick={() => s.open(PAGE_ARCADE)}><LayoutGrid size={16} /></IconButton>
      <IconButton label="Asset library" active={s.active === PAGE_ASSETS} onClick={() => s.open(PAGE_ASSETS)}><Boxes size={17} /></IconButton>
      <div className="flex-1" />
      <IconButton label="Account & setup" onClick={() => s.setSetupOpen(true)}><Settings size={16} /></IconButton>
    </nav>
  );
}

export function Explorer({ s }: { s: Studio }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Games <span className="ml-1 font-normal normal-case tracking-normal text-subtle">{s.games.length}</span></span>
        <div className="flex">
          <IconButton label="Open games folder" onClick={() => s.api?.openFolder(null)}><FolderOpen size={14} /></IconButton>
          <IconButton label="New game" onClick={() => s.open(NEW)}><Plus size={15} /></IconButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {s.games.map((g) => {
          const open = g.fixes.filter((f) => !f.done).length, on = s.active === g.slug, working = s.busy.has(g.slug);
          return (
            <button key={g.slug} onClick={() => s.open(g.slug)} title={g.tagline}
              className={cn('group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                on ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
              <GameIcon color={g.color} title={g.title} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{g.title}</span>
              {working ? <Loader2 size={13} className="animate-spin text-accent" />
                : open > 0 && <span className="rounded-full bg-warn/15 px-1.5 text-[10px] font-medium text-warn" title={`${open} kid-check fixes ready`}>{open}</span>}
            </button>
          );
        })}
        {!s.games.length && <p className="px-2 py-6 text-center text-[12px] text-subtle">No games yet — start one with <b className="text-muted">New game</b>.</p>}
      </div>
      <div className="border-t border-line p-2">
        <button onClick={() => s.open(NEW)} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-fg py-1.5 text-[13px] font-medium text-bg hover:bg-white">
          <Plus size={14} /> New game
        </button>
      </div>
    </aside>
  );
}
