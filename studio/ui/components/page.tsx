'use client';
/** The centre panel: the home page (new game), a game's page, or a web page (arcade / asset library). */
import { useState } from 'react';
import { RotateCw, ExternalLink, Smartphone, Maximize2, Minimize2, Download, FolderOpen, Undo2, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS, FILE_MANAGER, kbd, type Game } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { Chip, Dot, IconButton, Spinner, Square } from './ui';
import { Home } from './home';

export function CenterPanel({ s, addressRef }: { s: Studio; addressRef: React.RefObject<HTMLInputElement | null> }) {
  const base = s.env?.port ? `http://localhost:${s.env.port}/` : '';
  const g = s.games.find((x) => x.slug === s.active);
  return (
    <main className="min-w-0 flex-1 overflow-hidden bg-panel">
      {s.active === NEW ? <Home s={s} />
        : s.active === PAGE_ARCADE ? <Preview key={s.active} s={s} tab={s.active} url={base} addressRef={addressRef} full />
        : s.active === PAGE_ASSETS ? <Preview key={s.active} s={s} tab={s.active} url={base && `${base}assets.html`} addressRef={addressRef} full />
        : g ? <GamePage key={g.slug} s={s} g={g} addressRef={addressRef} /> : null}
    </main>
  );
}

const date = (ms: number) => ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function GamePage({ s, g, addressRef }: { s: Studio; g: Game; addressRef: React.RefObject<HTMLInputElement | null> }) {
  const [focus, setFocus] = useState(false);   // preview fills the panel
  const applied = g.fixes.filter((f) => f.done).length, busy = s.busy.has(g.slug);
  if (focus) return <Preview s={s} tab={g.slug} url={s.previewUrl(g.slug)} addressRef={addressRef} full onFocus={() => setFocus(false)} />;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[880px] px-10 pt-10 pb-16">
        <div className="flex items-center gap-2.5 text-[13.5px] text-subtle"><Square color={g.color} size={14} /><span className="font-mono text-[12.5px]">games/{g.slug}</span></div>
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.015em]">{g.title}</h1>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip>{busy ? <><Spinner className="h-3 w-3 text-accent" /> Working…</> : <><Dot color="var(--c-ok)" /> Ready</>}</Chip>
          <Chip><Dot color={g.engine === 'Three.js' ? '#8b5cf6' : '#0ea5e9'} /> {g.engine}</Chip>
          {g.fixes.length > 0 && <Chip><span className="text-muted">Fixes</span> {applied}/{g.fixes.length}</Chip>}
          {g.created > 0 && <Chip><span className="text-muted">Created</span> {date(g.created)}</Chip>}
          <Chip onClick={() => void s.exportGame(g.slug)} title={`Export a zip for itch.io (${kbd('E')})`}><Download size={13} strokeWidth={2} className="text-muted" /> Export</Chip>
          <Chip onClick={() => void s.api?.openFolder(g.slug)} title={`Show in ${FILE_MANAGER}`}><FolderOpen size={13} strokeWidth={2} className="text-muted" /> Folder</Chip>
        </div>

        {(g.pitch || g.tagline) && <p className="mt-6 text-[15px] leading-[1.65]">{g.pitch || g.tagline}</p>}
        {g.controls && <p className="mt-3 text-[14px] leading-relaxed text-muted"><span className="text-subtle">Controls</span>&nbsp; {g.controls}</p>}

        <div className="mt-7 overflow-hidden rounded-xl border border-line shadow-card">
          <div className="aspect-[16/10]"><Preview s={s} tab={g.slug} url={s.previewUrl(g.slug)} addressRef={addressRef} onFocus={() => setFocus(true)} /></div>
        </div>

        {g.fixes.length > 0 && <Fixes s={s} g={g} />}
      </div>
    </div>
  );
}

/** the kid-check fixes staged for this game, one click to apply or revert */
function Fixes({ s, g }: { s: Studio; g: Game }) {
  const [pending, setPending] = useState<number | 'all' | null>(null);
  const run = async (n: number | 'all', undo: boolean) => { setPending(n); await s.runFix(g.slug, n, undo); setPending(null); };
  const left = g.fixes.filter((f) => !f.done).length, done = g.fixes.length - left;
  const link = 'flex items-center gap-1 text-[13.5px] text-muted hover:text-fg disabled:opacity-40';
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-4">
        <h2 className="flex-1 text-[15px] font-medium">Suggested fixes <span className="font-normal text-subtle">{done}/{g.fixes.length} applied</span></h2>
        {done > 1 && <button disabled={pending !== null} onClick={() => void run('all', true)} className={link}><Undo2 size={14} /> Revert all</button>}
        {left > 1 && <button disabled={pending !== null} onClick={() => void run('all', false)} className={link}><Plus size={14} /> Apply all</button>}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {g.fixes.map((f) => (
          <div key={f.n} className="flex items-center gap-3 px-4 py-3">
            <span className="w-4 shrink-0 text-[13px] text-subtle tabular-nums">{f.n}</span>
            <span className={cn('min-w-0 flex-1 text-[14.5px]', f.done && 'text-muted')}>{f.text}</span>
            <Chip className={f.done ? 'text-ok' : 'text-muted'}>{pending === f.n || pending === 'all' ? <Spinner className="h-3 w-3" /> : <Dot color={f.done ? 'var(--c-ok)' : 'var(--c-line-strong)'} />}{f.done ? 'Applied' : 'To do'}</Chip>
            <button disabled={pending !== null} onClick={() => void run(f.n, f.done)} className="w-14 text-right text-[13.5px] font-medium text-accent hover:underline disabled:opacity-40">{f.done ? 'Revert' : 'Apply'}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** a live page with a slim toolbar: reload · address (?god, ?tune…) · phone size · expand · open outside */
function Preview({ s, tab, url: page, addressRef, full, onFocus }: { s: Studio; tab: string; url: string; addressRef: React.RefObject<HTMLInputElement | null>; full?: boolean; onFocus?: () => void }) {
  const [query, setQuery] = useState(''), [mobile, setMobile] = useState(false);
  const url = page && (query ? `${page}?${query}` : page);
  const [draft, setDraft] = useState(url), [shown, setShown] = useState(url);
  if (shown !== url) { setShown(url); setDraft(url); }   // follow the page when it changes
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
        <IconButton label={`Reload (${kbd('R')})`} onClick={() => s.reload(tab)}><RotateCw size={14} strokeWidth={2} /></IconButton>
        <form className="mx-1 flex h-7 min-w-0 flex-1 items-center rounded-lg bg-raised px-2.5" onSubmit={(e) => { e.preventDefault(); setQuery(draft.split('?')[1] ?? ''); s.reload(tab); }}>
          <input ref={full || onFocus ? addressRef : undefined} value={draft.replace(/^http:\/\//, '')} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="Address"
            title="Add ?god, ?tune or other debug flags, then press Return" className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-muted outline-none focus:text-fg" />
        </form>
        <IconButton label={mobile ? 'Fit' : 'Phone size'} active={mobile} onClick={() => setMobile((m) => !m)}><Smartphone size={14} strokeWidth={2} /></IconButton>
        {onFocus && <IconButton label={full ? 'Back to details' : 'Expand'} onClick={onFocus}>{full ? <Minimize2 size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}</IconButton>}
        <IconButton label="Open in browser" onClick={() => url && s.api?.openExternal(url)}><ExternalLink size={14} strokeWidth={2} /></IconButton>
      </div>
      <div className={cn('relative min-h-0 flex-1 bg-black', mobile && 'grid place-items-center bg-raised py-4')}>
        {url ? <iframe key={`${tab}:${s.reloads[tab] ?? 0}`} src={url} title="Preview" allow="autoplay; fullscreen; pointer-lock; gamepad"
          className={cn('border-0 bg-black', mobile ? 'h-full max-h-[844px] w-auto aspect-[390/844] rounded-[12px]' : 'absolute inset-0 h-full w-full')} />
          : <div className="grid h-full place-items-center text-[13px] text-subtle">Starting the game server…</div>}
      </div>
    </div>
  );
}
