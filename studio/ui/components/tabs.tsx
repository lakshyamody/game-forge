'use client';
/** Pill tabs on the window's top line: "<id> <title>", like the reference. */
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS, IS_MAC, kbd } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { IconButton, Spinner } from './ui';

function label(s: Studio, key: string): [string, string] {
  if (key === NEW) return ['new', 'New game'];
  if (key === PAGE_ARCADE) return ['arcade', 'All games'];
  if (key === PAGE_ASSETS) return ['assets', 'Asset library'];
  return [key, s.games.find((g) => g.slug === key)?.title ?? key];
}

export function Tabs({ s }: { s: Studio }) {
  return (
    <div className={cn('drag flex h-10 shrink-0 items-center gap-1', IS_MAC ? 'pr-2' : 'pr-[146px]')}>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {s.tabs.map((key) => {
          const [id, title] = label(s, key), on = key === s.active;
          return (
            <div key={key} role="tab" aria-selected={on} onClick={() => s.setActive(key)} onMouseDown={(e) => { if (e.button === 1) s.close(key); }}
              className={cn('group flex h-[26px] max-w-[300px] shrink-0 cursor-default items-center gap-1.5 rounded-md pl-2 pr-1 text-[12.5px] transition-colors',
                on ? 'bg-panel text-fg' : 'bg-panel/45 text-muted hover:bg-panel/75 hover:text-fg')}>
              {s.busy.has(key) && <Spinner className="h-3 w-3 text-accent" />}
              <span className="shrink-0 text-subtle">{id}</span>
              <span className="truncate font-medium">{title}</span>
              <button aria-label={`Close ${title}`} title={`Close tab (${kbd('W')})`} onClick={(e) => { e.stopPropagation(); s.close(key); }}
                className={cn('grid h-4 w-4 place-items-center rounded text-subtle hover:bg-hover hover:text-fg', !on && 'invisible group-hover:visible')}><X size={11} strokeWidth={2.2} /></button>
            </div>
          );
        })}
      </div>
      <IconButton label={`New game (${kbd('N')})`} onClick={() => s.open(NEW)}><Plus size={15} strokeWidth={1.8} /></IconButton>
    </div>
  );
}
