'use client';
/** Window chrome: a native-feeling title bar (traffic lights sit at its left) and a quiet status bar. */
import { PanelLeft, PanelRight } from 'lucide-react';
import { NEW, PAGE_ARCADE, PAGE_ASSETS } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { IconButton, Spinner } from './ui';

export function TitleBar({ s, explorer, agent, toggleExplorer, toggleAgent }: { s: Studio; explorer: boolean; agent: boolean; toggleExplorer: () => void; toggleAgent: () => void }) {
  const title = s.active === NEW ? 'New Game' : s.active === PAGE_ARCADE ? 'Arcade' : s.active === PAGE_ASSETS ? 'Asset Library' : s.games.find((g) => g.slug === s.active)?.title ?? '';
  return (
    <header className="drag relative flex h-[38px] shrink-0 items-center border-b border-line bg-chrome pl-[80px] pr-2">
      <IconButton label="Toggle sidebar (⌘B)" active={explorer} onClick={toggleExplorer}><PanelLeft size={15} strokeWidth={1.75} /></IconButton>
      <div className="pointer-events-none absolute inset-x-0 text-center text-[13px] font-semibold text-fg/85">{title} <span className="font-normal text-subtle">— Game Forge</span></div>
      <div className="flex-1" />
      <IconButton label="Toggle agent (⌘J)" active={agent} onClick={toggleAgent}><PanelRight size={15} strokeWidth={1.75} /></IconButton>
    </header>
  );
}

export function StatusBar({ s }: { s: Studio }) {
  const e = s.env;
  const claude = !e ? 'Checking Claude Code' : !e.claude ? 'Claude Code not installed' : !e.loggedIn ? 'Signed out' : e.email ?? 'Signed in';
  return (
    <footer className="flex h-[22px] shrink-0 items-center gap-4 border-t border-line bg-chrome px-3 text-[11px] text-subtle">
      <button className="flex items-center gap-1.5 hover:text-fg" onClick={() => s.setSetupOpen(true)} title="Account (⌘,)">
        <span className={`h-[7px] w-[7px] rounded-full ${!e ? 'bg-line-strong' : s.ready ? 'bg-[#22c55e]' : 'bg-bad'}`} />{claude}
      </button>
      {e?.version && <span>Claude Code {e.version.split(' ')[0]}</span>}
      {s.busy.size > 0 && <span className="flex items-center gap-1.5"><Spinner className="h-3 w-3 text-accent" />{s.busy.size === 1 ? '1 task running' : `${s.busy.size} tasks running`}</span>}
      {e && e.tools !== 'ready' && <span className="text-warn">{e.tools}</span>}
      <div className="flex-1" />
      <span>{e?.port ? `localhost:${e.port}` : 'Game server starting'}</span>
    </footer>
  );
}
