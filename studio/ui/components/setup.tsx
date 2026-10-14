'use client';
/** Account sheet. Claude Code installs in the background with Anthropic's official installer; sign-in happens in Claude's own sign-in page. */
import { useEffect, type ReactNode } from 'react';
import { Check, Bot, ArrowRight } from 'lucide-react';
import type { Studio } from '@/lib/use-studio';
import { IS_MAC } from '@/lib/studio';
import { Button, Spinner } from './ui';

export function Setup({ s }: { s: Studio }) {
  const open = s.setupOpen, close = s.setSetupOpen;
  useEffect(() => {
    if (!open) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(false); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [open, close]);
  if (!open) return null;
  const e = s.env;
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/25 pt-[12vh]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) s.setSetupOpen(false); }}>
      <div className="h-fit w-[480px] rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="px-6 pt-6">
          <h2 className="text-[17px] font-semibold">{s.ready ? 'Account' : 'Set up Game Forge'}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">Game Forge uses Claude Code on this computer with your own Claude account. You sign in through Claude; Game Forge never sees your password or tokens.</p>
        </div>
        <ul className="mx-4 mt-5 space-y-1.5">
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
        <div className="flex items-center justify-end gap-2 px-6 py-5">
          <Button size="sm" variant="ghost" onClick={() => void s.check()}>Refresh</Button>
          <Button size="sm" variant="primary" onClick={() => s.setSetupOpen(false)}>{s.ready ? 'Done' : 'Later'}</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ done, busy, title, note, action, optional }: { done: boolean; busy?: boolean; title: string; note: string; action?: ReactNode; optional?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3">
      {busy ? <Spinner className="h-[18px] w-[18px] shrink-0 text-accent" />
        : <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${done ? 'bg-ok text-white' : optional ? 'ring-1 ring-dashed ring-line-strong ring-inset' : 'ring-1 ring-line-strong ring-inset'}`}>{done && <Check size={11} strokeWidth={3} />}</span>}
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{title}</span><span className="block truncate text-[13px] text-muted" title={note}>{note}</span></span>
      {!done && action}
    </li>
  );
}

/** bottom-right card while Claude Code isn't ready (like the reference's "Connect your channel") */
export function SetupToast({ s, hidden }: { s: Studio; hidden?: boolean }) {
  const e = s.env;
  if (!e || s.ready || s.setupOpen || hidden) return null;
  const title = !e.claude ? (e.installing ? 'Installing Claude Code…' : 'Install Claude Code') : 'Sign in to Claude';
  const note = !e.claude ? (e.installing ? 'Almost there. Sign in when it finishes.' : 'Game Forge needs it to build your games.') : 'Use your Claude Pro or Max account to start making games.';
  return (
    <button onClick={() => s.setSetupOpen(true)} className="fixed right-6 bottom-6 z-40 flex w-[380px] items-center gap-4 rounded-2xl border border-line bg-panel p-2.5 pr-5 text-left shadow-card hover:border-line-strong">
      <span className="grid h-[68px] w-[96px] shrink-0 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #8ab4ff, #c4a7ff 55%, #ffb38a)' }}>
        {e.installing ? <Spinner className="h-6 w-6 text-white" /> : <Bot size={26} strokeWidth={1.7} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{note}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-subtle" />
    </button>
  );
}
