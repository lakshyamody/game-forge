'use client';
/** First-run / account dialog. Install and sign-in both happen in Anthropic's own tools (a terminal window). */
import { Check, Download, LogIn, Package, RefreshCw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Studio } from '@/lib/use-studio';
import { Button, IconButton } from './ui';

export function Setup({ s }: { s: Studio }) {
  if (!s.setupOpen) return null;
  const e = s.env;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-[2px]">
      <div className="w-[520px] rounded-xl border border-line-strong bg-panel shadow-2xl">
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h2 className="text-[16px] font-semibold">{s.ready ? 'Account' : 'Set up Game Forge Studio'}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Studio runs <b className="text-fg">Claude Code</b> on this computer with your own Claude account. Sign-in stays with Claude — the app never sees your password or tokens.</p>
          </div>
          {s.ready && <IconButton label="Close" onClick={() => s.setSetupOpen(false)}><X size={15} /></IconButton>}
        </div>
        <ol className="space-y-2 px-5">
          <Step done={!!e?.claude} icon={<Download size={15} />} title="Install Claude Code" note={e?.claude ? `Installed · ${e.version}` : 'Opens a terminal window with the official installer.'}
            action={<Button size="sm" variant="primary" onClick={() => void s.api?.installClaude()}>Install</Button>} />
          <Step done={!!e?.loggedIn} icon={<LogIn size={15} />} title="Sign in with Claude" note={e?.loggedIn ? `Signed in${e.email ? ` as ${e.email}` : ''}` : "Opens Claude's sign-in page. Needs a Claude Pro or Max plan."}
            action={<Button size="sm" variant="primary" disabled={!e?.claude} onClick={() => void s.api?.login()}>Sign in</Button>} />
          <Step done={!!e?.deps} icon={<Package size={15} />} title="Game tools" note={!e?.deps ? 'Missing — reinstall Game Forge Studio.' : e.tools === 'ready' ? 'Ready' : e.tools} />
        </ol>
        <div className="flex items-center justify-between p-5 pt-4">
          <span className="text-[11.5px] text-subtle">Checks again automatically every few seconds.</span>
          <Button size="sm" variant="secondary" onClick={() => void s.check()}><RefreshCw size={13} /> Check again</Button>
        </div>
      </div>
    </div>
  );
}

function Step({ done, icon, title, note, action }: { done: boolean; icon: ReactNode; title: string; note: string; action?: ReactNode }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', done ? 'border-ok/25 bg-ok/[0.05]' : 'border-line bg-raised/50')}>
      <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md', done ? 'bg-ok/15 text-ok' : 'bg-hover text-muted')}>{done ? <Check size={15} /> : icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{title}</span><span className="block truncate text-[12px] text-muted">{note}</span></span>
      {!done && action}
    </li>
  );
}
