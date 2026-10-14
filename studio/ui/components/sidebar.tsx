'use client';
import { Plus, LayoutGrid, Boxes, FolderOpen, CircleHelp, Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS, IS_MAC, FILE_MANAGER } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { Spinner, Square } from './ui';

export type ThemePref = 'dark' | 'light' | 'system';

function Item({ on, icon, label, count, busy, onClick }: { on?: boolean; icon: React.ReactNode; label: string; count?: number; busy?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors', on ? 'bg-hover text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg')}>
      <span className="grid w-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {busy ? <Spinner className="text-accent" /> : !!count && <span className="text-[11.5px] tabular-nums text-subtle" title={`${count} suggested fixes`}>{count}</span>}
    </button>
  );
}

export function Sidebar({ s, theme, setTheme }: { s: Studio; theme: ThemePref; setTheme: (t: ThemePref) => void }) {
  const e = s.env;
  const nextTheme: Record<ThemePref, ThemePref> = { dark: 'light', light: 'system', system: 'dark' };
  return (
    <aside className="flex w-[216px] shrink-0 flex-col">
      {/* header row shares the top line with the tabs; macOS traffic lights sit on its left */}
      <div className={cn('drag flex h-10 shrink-0 items-center gap-2 pr-3', IS_MAC ? 'pl-[82px]' : 'pl-4')}>
        <span className="h-4 w-4 shrink-0 rounded-[4px] bg-[#f5c518]" />
        <span className="truncate text-[13px] font-semibold">Game Forge</span>
      </div>

      <nav className="mt-2 space-y-px px-2">
        <Item on={s.active === NEW} icon={<Plus size={15} strokeWidth={1.8} />} label="New game" busy={s.busy.has(NEW)} onClick={() => s.open(NEW)} />
        <Item on={s.active === PAGE_ARCADE} icon={<LayoutGrid size={14} strokeWidth={1.8} />} label="Arcade" onClick={() => s.open(PAGE_ARCADE)} />
        <Item on={s.active === PAGE_ASSETS} icon={<Boxes size={15} strokeWidth={1.8} />} label="Asset library" onClick={() => s.open(PAGE_ASSETS)} />
      </nav>

      <div className="mt-5 flex items-center justify-between px-4 pb-1">
        <span className="text-[11.5px] font-medium text-subtle">Games</span>
        <button title={`Show games folder in ${FILE_MANAGER}`} onClick={() => void s.api?.openFolder(null)} className="text-subtle hover:text-fg"><FolderOpen size={13} strokeWidth={1.8} /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-px overflow-y-auto px-2">
        {s.games.map((g) => (
          <Item key={g.slug} on={s.active === g.slug} icon={<Square color={g.color} />} label={g.title} busy={s.busy.has(g.slug)}
            count={g.fixes.filter((f) => !f.done).length || undefined} onClick={() => s.open(g.slug)} />
        ))}
      </div>

      <div className="space-y-2 p-2 pb-3">
        <div className="rounded-lg bg-panel p-3">
          {!e ? <div className="flex items-center gap-2 text-[12.5px] text-muted"><Spinner /> Checking Claude Code…</div> : s.ready ? <>
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium"><span className="h-2 w-2 rounded-full bg-ok" /> Claude Code connected</div>
            <p className="mt-1 truncate text-[12px] text-muted">{e?.email ?? 'Signed in'} · {e?.version?.split(' ')[0]}</p>
            {e && e.tools !== 'ready' && <p className="mt-1 text-[12px] text-warn">{e.tools}</p>}
          </> : <>
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
              {!e.claude && e.installing ? <><Spinner className="text-accent" /> Installing Claude Code…</> : <><span className="h-2 w-2 rounded-full bg-warn" /> {e.claude ? 'Not signed in' : 'Claude Code not installed'}</>}
            </div>
            <p className="mt-1 text-[12px] leading-snug text-muted">{e.claude ? 'Sign in with your Claude Pro or Max account to start.' : 'Game Forge needs Claude Code and a Claude Pro or Max account.'}</p>
          </>}
          {e && <button onClick={() => s.setSetupOpen(true)} className="mt-2 text-[12.5px] font-medium text-accent hover:underline">{s.ready ? 'Account' : 'Set up'}</button>}
        </div>
        <div className="space-y-px">
          <Item icon={theme === 'dark' ? <Moon size={14} strokeWidth={1.8} /> : theme === 'light' ? <Sun size={14} strokeWidth={1.8} /> : <Monitor size={14} strokeWidth={1.8} />}
            label={`Appearance: ${theme[0].toUpperCase()}${theme.slice(1)}`} onClick={() => setTheme(nextTheme[theme])} />
          <Item icon={<CircleHelp size={14} strokeWidth={1.8} />} label="Help" onClick={() => void s.api?.openExternal('https://github.com/npmiaman/game-forge#readme')} />
        </div>
      </div>
    </aside>
  );
}
