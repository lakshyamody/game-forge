'use client';
/** Window chrome: draggable title bar (macOS traffic lights live at its left) and the status bar. */
import { PanelLeft, PanelRight, Loader2 } from 'lucide-react';
import { NEW } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { Dot, IconButton, Kbd } from './ui';

export function TitleBar({ s, explorer, agent, toggleExplorer, toggleAgent }: { s: Studio; explorer: boolean; agent: boolean; toggleExplorer: () => void; toggleAgent: () => void }) {
  const title = s.active === NEW ? 'New game' : s.games.find((g) => g.slug === s.active)?.title ?? (s.active.startsWith('page:') ? s.active.slice(5)[0].toUpperCase() + s.active.slice(6) : s.active);
  return (
    <header className="drag relative flex h-[38px] shrink-0 items-center border-b border-line bg-panel pl-[78px] pr-2">
      <IconButton label="Toggle sidebar" shortcut="⌘B" active={explorer} onClick={toggleExplorer}><PanelLeft size={15} /></IconButton>
      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
        <div className="flex items-center gap-2 rounded-md border border-line bg-bg/60 px-3 py-[3px] text-[12px] text-muted">
          <span className="font-medium text-fg">Game Forge</span><span className="text-subtle">/</span><span>{title}</span>
        </div>
      </div>
      <div className="flex-1" />
      <IconButton label="Toggle agent" shortcut="⌘J" active={agent} onClick={toggleAgent}><PanelRight size={15} /></IconButton>
    </header>
  );
}

export function StatusBar({ s }: { s: Studio }) {
  const e = s.env, working = s.busy.size;
  const claude = !e ? 'Checking Claude Code…' : !e.claude ? 'Claude Code not installed' : !e.loggedIn ? 'Not signed in' : `Claude Code ${e.version?.split(' ')[0] ?? ''}`;
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] text-subtle">
      <button className="flex items-center gap-1.5 hover:text-fg" onClick={() => s.setSetupOpen(true)}>
        <Dot tone={!e ? 'idle' : s.ready ? 'ok' : 'bad'} /> {claude}{e?.email && s.ready ? <span className="text-subtle">· {e.email}</span> : null}
      </button>
      <span className="flex items-center gap-1.5"><Dot tone={e?.port ? 'ok' : 'idle'} /> Game server {e?.port ? `:${e.port}` : '—'}</span>
      {working > 0 && <span className="flex items-center gap-1.5 text-accent"><Loader2 size={11} className="animate-spin" /> {working} running</span>}
      {e && e.tools !== 'ready' && <span className="text-warn">{e.tools}</span>}
      <div className="flex-1" />
      <span className="flex items-center gap-1"><Kbd>⌘N</Kbd> new <Kbd>⌘W</Kbd> close <Kbd>⌘R</Kbd> reload <Kbd>⌘J</Kbd> agent</span>
    </footer>
  );
}
