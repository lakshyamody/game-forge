'use client';
/** Account sheet. Claude Code installs in the background with Anthropic's official installer; sign-in happens in Claude's own sign-in page. */
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { Studio } from '@/lib/use-studio';
import { IS_MAC } from '@/lib/studio';
import { Button, Spinner } from './ui';

export function Setup({ s }: { s: Studio }) {
  if (!s.setupOpen) return null;
  const e = s.env;
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-[12vh]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget && s.ready) s.setSetupOpen(false); }}>
      <div className="h-fit w-[460px] rounded-xl bg-panel shadow-2xl ring-1 ring-line">
        <div className="px-5 pt-5">
          <h2 className="text-[15px] font-semibold">{s.ready ? 'Account' : 'Set up Game Forge'}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Game Forge uses Claude Code on this computer with your own Claude account. You sign in through Claude; Game Forge never sees your password or tokens.</p>
        </div>
        <ul className="mx-3 mt-4 space-y-1">
          <Row done={!!e?.claude} busy={!e?.claude && e?.installing} title="Claude Code"
            note={e?.claude ? `Version ${e.version?.split(' ')[0]}` : e?.installing ? 'Installing with the official installer…' : e?.installError ? `Install failed: ${e.installError}` : 'Installs with the official installer.'}
            action={e?.installing ? null : e?.installError
              ? <Button size="sm" onClick={() => void s.api?.installClaude({ terminal: true })}>Install in {IS_MAC ? 'Terminal' : 'PowerShell'}…</Button>
              : <Button size="sm" onClick={() => void s.api?.installClaude().then(() => s.check())}>Install</Button>} />
          <Row done={!!e?.loggedIn} title="Claude account" note={e?.loggedIn ? e.email ?? 'Signed in' : 'Requires a Claude Pro or Max plan.'}
            action={<Button size="sm" disabled={!e?.claude} onClick={() => void s.api?.login()}>Sign in…</Button>} />
          {e && !IS_MAC && <Row done={e.gitBash} optional title="Git for Windows" note={e.gitBash ? 'Installed. Claude Code uses Git Bash.' : 'Optional. Without it Claude Code runs commands in PowerShell.'}
            action={<Button size="sm" onClick={() => void s.api?.installGit()}>Download…</Button>} />}
          <Row done={!!e?.deps && e.tools === 'ready'} title="Game tools" note={!e?.deps ? 'Missing. Reinstall Game Forge.' : e.tools === 'ready' ? 'Installed' : e.tools} />
        </ul>
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <Button size="sm" variant="ghost" onClick={() => void s.check()}>Refresh</Button>
          <Button size="sm" variant="primary" disabled={!s.ready} onClick={() => s.setSetupOpen(false)}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ done, busy, title, note, action, optional }: { done: boolean; busy?: boolean; title: string; note: string; action?: ReactNode; optional?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2.5">
      {busy ? <Spinner className="h-[18px] w-[18px] shrink-0 text-accent" />
        : <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${done ? 'bg-ok text-white' : optional ? 'ring-1 ring-dashed ring-line-strong ring-inset' : 'ring-1 ring-line-strong ring-inset'}`}>{done && <Check size={11} strokeWidth={3} />}</span>}
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{title}</span><span className="block truncate text-[12px] text-muted">{note}</span></span>
      {!done && action}
    </li>
  );
}
