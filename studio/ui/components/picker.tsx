'use client';
/** "Choose the look": the options Claude rendered for each key visual (scripts/ask.mjs), picked with a click. */
import { useEffect, useState } from 'react';
import { Check, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Studio } from '@/lib/use-studio';
import { Button, IconButton } from './ui';

export function Picker({ s }: { s: Studio }) {
  const slug = s.picker, a = slug ? s.asks[slug] : null;
  const [picks, setPicks] = useState<Record<string, number>>({});
  useEffect(() => setPicks({}), [slug, a?.created]);
  useEffect(() => {
    if (!a) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') s.setPicker(null); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [a, s]);
  if (!slug || !a) return null;
  const base = s.env?.port ? `http://localhost:${s.env.port}/games/${slug}/` : '';
  const done = a.questions.every((q) => picks[q.id] !== undefined);
  const game = s.games.find((g) => g.slug === slug)?.title ?? slug;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-6 py-[6vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) s.setPicker(null); }}>
      <div role="dialog" aria-label="Choose the look" className="w-full max-w-[880px] rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex items-start gap-3 px-6 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{a.title || `Choose the look for ${game}`}</h2>
            <p className="mt-1 text-[13.5px] text-muted">Pick one for each, then Claude Code builds {game} with them.</p>
          </div>
          <IconButton label="Close (choose later)" onClick={() => s.setPicker(null)}><X size={16} /></IconButton>
        </header>
        <div className="space-y-6 px-6 pt-5 pb-2">
          {a.questions.map((q) => (
            <section key={q.id}>
              <h3 className="mb-2.5 text-[14.5px] font-medium">{q.question}</h3>
              <div className={cn('grid gap-3', q.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                {q.options.map((o, i) => {
                  const on = picks[q.id] === i;
                  return (
                    <button key={i} onClick={() => setPicks((p) => ({ ...p, [q.id]: i }))} aria-pressed={on}
                      className={cn('group relative overflow-hidden rounded-xl border bg-raised text-left transition-all', on ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-line-strong')}>
                      <img src={`${base}${o.image}?v=${a.created}`} alt="" draggable={false} className="block aspect-[4/3] w-full object-cover" />
                      {on && <span className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-white shadow"><Check size={14} strokeWidth={3} /></span>}
                      <span className="block px-3 pt-2 text-[14px] font-medium">{o.label}</span>
                      <span className="block truncate px-3 pb-2.5 text-[12.5px] text-muted" title={o.asset}>{o.note || (o.asset.startsWith('code:') ? 'Made for this game' : 'From the asset library')}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer className="flex items-center gap-2 px-6 py-5">
          <span className="text-[13px] text-subtle">{Object.keys(picks).length}/{a.questions.length} chosen</span>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => void s.answerAsk(slug, null)}><Sparkles size={14} /> Let Claude decide</Button>
          <Button variant="primary" disabled={!done} onClick={() => void s.answerAsk(slug, picks)}>Build it</Button>
        </footer>
      </div>
    </div>
  );
}
