'use client';
/** Account sheet. Installing and signing in both happen in Anthropic's own tools (a Terminal window). */
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { Studio } from '@/lib/use-studio';
import { Button } from './ui';

export function Setup({ s }: { s: Studio }) {
  if (!s.setupOpen) return null;
  const e = s.env;
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-[12vh]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget && s.ready) s.setSetupOpen(false); }}>
      <div className="h-fit w-[460px] rounded-xl bg-panel shadow-2xl ring-1 ring-line">
        <div className="px-5 pt-5">
          <h2 className="text-[15px] font-semibold">{s.ready ? 'Account' : 'Set up Game Forge'}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Game Forge uses Claude Code on this Mac with your own Claude account. You sign in through Claude; Game Forge never sees your password or tokens.</p>
        </div>
        <ul className="mx-3 mt-4 space-y-1">
          <Row done={!!e?.claude} title="Claude Code" note={e?.claude ? `Version ${e.version?.split(' ')[0]}` : 'Installs with the official installer in Terminal.'}
            action={<Button size="sm" onClick={() => void s.api?.installClaude()}>Install…</Button>} />
          <Row done={!!e?.loggedIn} title="Claude account" note={e?.loggedIn ? e.email ?? 'Signed in' : 'Requires a Claude Pro or Max plan.'}
            action={<Button size="sm" disabled={!e?.claude} onClick={() => void s.api?.login()}>Sign in…</Button>} />
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

function Row({ done, title, note, action }: { done: boolean; title: string; note: string; action?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2.5">
      <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${done ? 'bg-ok text-white' : 'ring-1 ring-line-strong ring-inset'}`}>{done && <Check size={11} strokeWidth={3} />}</span>
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{title}</span><span className="block truncate text-[12px] text-muted">{note}</span></span>
      {!done && action}
    </li>
  );
}
