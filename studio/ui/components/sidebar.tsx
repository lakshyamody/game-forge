'use client';
/** Left sidebar: main pages, your games, recent prompts, and the Claude Code account at the bottom. */
import type { ReactNode } from 'react';
import { Plus, LayoutGrid, Boxes, FolderOpen, CircleHelp, Moon, Sun, Monitor, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS, FILE_MANAGER } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { Dot, IconButton, Spinner, Square } from './ui';

export type ThemePref = 'dark' | 'light' | 'system';

function Item({ on, icon, label, end, onClick, title }: { on?: boolean; icon?: ReactNode; label: string; end?: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} className={cn('flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14.5px] transition-colors', on ? 'bg-hover' : 'hover:bg-hover/60')}>
      {icon && <span className="grid w-[18px] shrink-0 place-items-center text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {end}
    </button>
  );
}

const Section = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <div className="mt-6">
    <div className="flex h-7 items-center justify-between px-3 text-[13.5px] text-subtle">{title}{action}</div>
    <div className="space-y-px">{children}</div>
  </div>
);

export function Sidebar({ s, theme, setTheme }: { s: Studio; theme: ThemePref; setTheme: (t: ThemePref) => void }) {
  const next: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'system', system: 'light' };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const recents = s.recents.filter((r) => r.key === NEW || s.games.some((g) => g.slug === r.key)).slice(0, 6);
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-line">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4">
        <nav className="space-y-px">
          <Item on={s.active === NEW} icon={<Plus size={17} strokeWidth={1.8} />} label="New game" end={s.busy.has(NEW) ? <Spinner className="text-accent" /> : null} onClick={s.newGame} />
          <Item on={s.active === PAGE_ARCADE} icon={<LayoutGrid size={16} strokeWidth={1.8} />} label="Arcade" onClick={() => s.open(PAGE_ARCADE)} />
          <Item on={s.active === PAGE_ASSETS} icon={<Boxes size={17} strokeWidth={1.8} />} label="Asset library" onClick={() => s.open(PAGE_ASSETS)} />
        </nav>

        <Section title="Games" action={<button title={`Show the games folder in ${FILE_MANAGER}`} onClick={() => void s.api?.openFolder(null)} className="hover:text-fg"><FolderOpen size={15} strokeWidth={1.8} /></button>}>
          {s.games.map((g) => {
            const left = g.fixes.filter((f) => !f.done).length;
            return <Item key={g.slug} on={s.active === g.slug} icon={<Square color={g.color} />} label={g.title} onClick={() => s.open(g.slug)}
              end={s.busy.has(g.slug) ? <Spinner className="text-accent" /> : left ? <span title={`${left} suggested fixes`} className="text-[13px] text-subtle tabular-nums">{left}</span> : null} />;
          })}
        </Section>

        {recents.length > 0 && (
          <Section title="Recents">
            {recents.map((r) => <Item key={r.at} label={r.text} title={r.text} onClick={() => s.open(r.key)} />)}
          </Section>
        )}
      </div>

      {/* the account, laid out like the reference's "Connect apps" block */}
      <div className="shrink-0 border-t border-line px-5 pt-4 pb-4">
        <Account s={s} />
        <div className="mt-3 flex items-center gap-1">
          <IconButton outline label={s.ready ? 'Account' : 'Set up Claude Code'} onClick={() => s.setSetupOpen(true)}><UserRound size={14} strokeWidth={1.8} /></IconButton>
          <IconButton outline label={`Appearance: ${theme[0].toUpperCase()}${theme.slice(1)}`} onClick={() => setTheme(next[theme])}><ThemeIcon size={14} strokeWidth={1.8} /></IconButton>
          <IconButton outline label="Help" onClick={() => void s.api?.openExternal('https://github.com/npmiaman/game-forge#readme')}><CircleHelp size={14} strokeWidth={1.8} /></IconButton>
        </div>
      </div>
    </aside>
  );
}

function Account({ s }: { s: Studio }) {
  const e = s.env;
  if (!e) return <><div className="text-[15px] font-medium">Claude Code</div><p className="mt-1 flex items-center gap-2 text-[13.5px] text-muted"><Spinner /> Checking…</p></>;
  if (s.ready) return <>
    <div className="flex items-center gap-2 text-[15px] font-medium">Claude Code <Dot color="var(--c-ok)" /></div>
    <p className="mt-1 truncate text-[13.5px] leading-snug text-muted" title={e.email ?? ''}>{e.email ?? 'Signed in'}{e.version ? ` · ${e.version.split(' ')[0]}` : ''}</p>
    {e.tools !== 'ready' && <p className="mt-1 text-[13px] text-warn">{e.tools}</p>}
  </>;
  return <>
    <div className="flex items-center gap-2 text-[15px] font-medium">{!e.claude && e.installing ? <><Spinner className="text-accent" /> Installing Claude Code…</> : <>Claude Code <Dot color="var(--c-warn)" /></>}</div>
    <p className="mt-1 text-[13.5px] leading-snug text-muted">{e.claude ? 'Sign in with your Claude Pro or Max account to start.' : 'Needs Claude Code and a Claude Pro or Max account.'}</p>
  </>;
}
