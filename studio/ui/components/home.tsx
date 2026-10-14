'use client';
/** The home page (the "New game" tab): what should we make, a composer, starting points. Becomes the chat once you send. */
import { useEffect, useRef, useState } from 'react';
import { Plus, Dices, LayoutGrid, Boxes, FolderOpen, Crosshair, Footprints, Puzzle, Atom, Box, Shapes } from 'lucide-react';
import { NEW, TEMPLATES, PAGE_ARCADE, PAGE_ASSETS } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { Dot, IconButton, Mark } from './ui';
import { Composer, Messages } from './chat';

const ICONS = { topdown: Crosshair, platformer: Footprints, puzzle: Puzzle, physics: Atom, '3d': Box, blank: Shapes } as const;
const IDEAS = [
  'Make a top-down game where a tiny robot vacuums a haunted house before the ghosts wake up',
  'Make a platformer where a frog climbs a waterfall that speeds up every level',
  'Make a 3D racing game on rooftops at sunset with drift boosts',
  'Make a puzzle game where you slide ice blocks to rescue penguins',
  'Make a physics game where you launch pizzas into a busy street of open windows',
  'Make a top-down survival game in a snowy forest at night, with a torch that runs out',
  'Make a 3D game where you are a cat knocking things off shelves before the owner gets home',
  'Make a platformer about a pixel knight who can only jump on enemies to move',
];

export function Home({ s }: { s: Studio }) {
  const chatting = (s.chats[NEW] ?? []).length > 0 || s.busy.has(NEW);
  const start = (text: string) => s.setDraft(NEW, text);
  return (
    <div className="relative h-full overflow-hidden">
      <div className="dots pointer-events-none absolute top-0 right-0 h-32 w-[520px]" />
      <AccountPill s={s} />
      {chatting ? (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-20"><Messages s={s} chatKey={NEW} className="mx-auto max-w-[720px] pb-6" /></div>
          <div className="mx-auto w-full max-w-[720px] shrink-0 px-6 pb-5"><Composer s={s} chatKey={NEW} placeholder="Reply…" /></div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto px-6">
          <div className="mx-auto max-w-[720px] pt-[16vh] pb-16">
            <h1 className="flex items-center justify-center gap-3 text-[28px] font-normal tracking-[-0.01em]"><Mark size={26} /> What should we make?</h1>
            <div className="mt-8">
              <Composer s={s} chatKey={NEW} rows={3} placeholder="Describe a game…"
                tools={<>
                  <TemplateMenu onPick={(name) => start(`Make a ${name.toLowerCase()} game where `)} />
                  <IconButton outline label="Surprise me" onClick={() => start(IDEAS[Math.floor(Math.random() * IDEAS.length)])}><Dices size={15} strokeWidth={1.8} /></IconButton>
                  <span className="ml-1 hidden truncate text-[13px] text-subtle sm:inline">Builds, playtests and suggests 5 fixes · about 25 min</span>
                </>}
                tray={<>
                  <button onClick={() => s.open(PAGE_ARCADE)} className="flex items-center gap-2 hover:text-fg"><LayoutGrid size={15} strokeWidth={1.8} /> Arcade</button>
                  <button onClick={() => s.open(PAGE_ASSETS)} className="flex items-center gap-2 hover:text-fg"><Boxes size={15} strokeWidth={1.8} /> Asset library</button>
                  <button onClick={() => void s.api?.openFolder(null)} className="flex items-center gap-2 hover:text-fg"><FolderOpen size={15} strokeWidth={1.8} /> Games folder</button>
                </>} />
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
              {TEMPLATES.map((t) => { const Icon = ICONS[t.id]; return (
                <button key={t.id} onClick={() => start(`Make a ${t.name.toLowerCase()} game where `)}
                  className="flex flex-col items-start justify-start rounded-xl border border-line bg-panel px-4 py-4 text-left shadow-card transition-colors hover:border-line-strong hover:bg-raised/60">
                  <Icon size={19} strokeWidth={1.6} className="text-muted" />
                  <div className="mt-4 text-[15px] font-medium">{t.name}</div>
                  <div className="mt-0.5 text-[13.5px] text-muted">{t.note}</div>
                </button>
              ); })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** top-right: who's signed in (like a plan pill) */
function AccountPill({ s }: { s: Studio }) {
  const e = s.env;
  if (!e) return null;
  return (
    <div className="absolute top-5 right-6 z-10 flex h-8 items-center gap-2 rounded-full bg-raised pr-3 pl-3 text-[13.5px]">
      <Dot color={s.ready ? 'var(--c-ok)' : 'var(--c-warn)'} />
      <span>{s.ready ? 'Claude Code' : e.claude ? 'Not signed in' : e.installing ? 'Installing Claude Code…' : 'Claude Code not set up'}</span>
      <button onClick={() => s.setSetupOpen(true)} className="font-medium text-accent hover:underline">{s.ready ? 'Account' : 'Set up'}</button>
    </div>
  );
}

function TemplateMenu({ onPick }: { onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', away); return () => removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <IconButton outline label="Starting point" active={open} onClick={() => setOpen((o) => !o)}><Plus size={16} strokeWidth={1.8} /></IconButton>
      {open && (
        <div className="absolute top-9 left-0 z-20 w-64 rounded-xl border border-line bg-panel p-1 shadow-card">
          <p className="px-2.5 pt-1.5 pb-1 text-[12px] text-subtle">Start from</p>
          {TEMPLATES.map((t) => { const Icon = ICONS[t.id]; return (
            <button key={t.id} onClick={() => { onPick(t.name); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] hover:bg-hover">
              <Icon size={15} strokeWidth={1.7} className="text-muted" /><span className="flex-1">{t.name}</span>
            </button>
          ); })}
        </div>
      )}
    </div>
  );
}
