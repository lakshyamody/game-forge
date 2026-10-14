'use client';
/** The centre panel: one document per tab — a game, the new-game page, or a web page (arcade / asset library). */
import { useEffect, useState, type ReactNode } from 'react';
import { RotateCw, ExternalLink, Smartphone, Maximize2, Minimize2, Download, FolderOpen, Check, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, PAGE_ARCADE, PAGE_ASSETS, TEMPLATES, FILE_MANAGER, kbd, type Game } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { Chip, Dot, IconButton, Spinner, Thumb } from './ui';

export function CenterPanel({ s, addressRef }: { s: Studio; addressRef: React.RefObject<HTMLInputElement | null> }) {
  const base = s.env?.port ? `http://localhost:${s.env.port}/` : '';
  const g = s.games.find((x) => x.slug === s.active);
  return (
    <main className="min-w-0 flex-1 overflow-hidden rounded-lg bg-panel">
      {s.active === NEW ? <NewGamePage s={s} />
        : s.active === PAGE_ARCADE ? <Preview s={s} tab={s.active} url={base} addressRef={addressRef} full />
        : s.active === PAGE_ASSETS ? <Preview s={s} tab={s.active} url={base && `${base}assets.html`} addressRef={addressRef} full />
        : g ? <GamePage s={s} g={g} addressRef={addressRef} /> : null}
    </main>
  );
}

const date = (ms: number) => ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function GamePage({ s, g, addressRef }: { s: Studio; g: Game; addressRef: React.RefObject<HTMLInputElement | null> }) {
  const [focus, setFocus] = useState(false);   // preview fills the panel
  useEffect(() => setFocus(false), [g.slug]);
  const applied = g.fixes.filter((f) => f.done).length, busy = s.busy.has(g.slug);
  if (focus) return <Preview s={s} tab={g.slug} url={s.previewUrl(g.slug)} addressRef={addressRef} full onFocus={() => setFocus(false)} />;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[820px] px-12 pt-12 pb-16">
        <div className="flex flex-wrap gap-1.5">
          <Chip mono>{g.slug}</Chip>
          {g.fixes.length > applied && <Chip><span className="grid h-3 w-3 place-items-center rounded-[3px] bg-warn text-[9px] font-bold text-black">!</span><span className="text-muted">{g.fixes.length - applied} suggested fixes</span></Chip>}
        </div>
        <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-[-0.015em]">{g.title}</h1>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip>{busy ? <><Spinner className="h-3 w-3 text-accent" /> Agent working</> : <><Dot color="var(--c-ok)" /> Ready</>}</Chip>
          <Chip><Dot color={g.engine === 'Three.js' ? '#a78bfa' : '#38bdf8'} /> {g.engine}</Chip>
          {g.fixes.length > 0 && <Chip><span className="text-muted">Fixes</span> {applied}/{g.fixes.length}</Chip>}
          {g.created > 0 && <Chip><span className="text-muted">Created</span> {date(g.created)}</Chip>}
          <Chip onClick={() => void s.exportGame(g.slug)} title={`Export a zip for itch.io (${kbd('E')})`}><Download size={12} strokeWidth={2} className="text-muted" /> Export</Chip>
          <Chip onClick={() => void s.api?.openFolder(g.slug)} title={`Show in ${FILE_MANAGER}`}><FolderOpen size={12} strokeWidth={2} className="text-muted" /> Folder</Chip>
        </div>

        <p className="mt-6 text-[14px] leading-[1.7] text-fg/90">{g.pitch || g.tagline}</p>
        {g.controls && <p className="mt-3 text-[13px] leading-relaxed text-muted"><span className="text-subtle">Controls</span>&nbsp; {g.controls}</p>}

        <div className="mt-7 overflow-hidden rounded-lg bg-raised">
          <div className="aspect-[16/10]"><Preview s={s} tab={g.slug} url={s.previewUrl(g.slug)} addressRef={addressRef} onFocus={() => setFocus(true)} /></div>
        </div>

        {g.fixes.length > 0 && <Fixes s={s} g={g} />}
      </div>
    </div>
  );
}

/** suggested fixes, laid out like the reference's sub-tasks */
function Fixes({ s, g }: { s: Studio; g: Game }) {
  const [pending, setPending] = useState<number | 'all' | null>(null);
  const run = async (n: number | 'all', undo: boolean) => { setPending(n); await s.runFix(g.slug, n, undo); setPending(null); };
  const left = g.fixes.filter((f) => !f.done).length;
  return (
    <section className="mt-9">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-muted">Suggested fixes</h2>
        {left > 1 && <button disabled={pending !== null} onClick={() => void run('all', false)} className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg disabled:opacity-40"><Plus size={13} /> Apply all</button>}
      </div>
      <div className="space-y-1.5">
        {g.fixes.map((f) => (
          <div key={f.n} className="rounded-lg bg-raised px-3 py-2.5">
            <div className={cn('text-[13px]', f.done && 'text-muted')}>{f.text}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip className="bg-hover" onClick={pending === null ? () => void run(f.n, f.done) : undefined} title={f.done ? 'Revert this fix' : 'Apply this fix'}>
                {pending === f.n ? <Spinner className="h-3 w-3" /> : <Dot color={f.done ? 'var(--c-ok)' : 'var(--c-bad)'} />}{f.done ? 'Applied' : 'To do'}
              </Chip>
              <Chip className="bg-hover"><Dot color="#a78bfa" /> Visual</Chip>
              <Chip className="bg-hover text-muted">Fix {f.n}</Chip>
              <span className="flex-1" />
              <button disabled={pending !== null} onClick={() => void run(f.n, f.done)} className="text-[12px] text-subtle hover:text-fg disabled:opacity-40">{f.done ? 'Revert' : 'Apply'}</button>
            </div>
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
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 px-2">
        <IconButton label={`Reload (${kbd('R')})`} onClick={() => s.reload(tab)}><RotateCw size={13} strokeWidth={2} /></IconButton>
        <form className="flex h-6 min-w-0 flex-1 items-center rounded-md px-2 hover:bg-hover focus-within:bg-hover" onSubmit={(e) => { e.preventDefault(); setQuery(draft.split('?')[1] ?? ''); s.reload(tab); }}>
          <input ref={full || onFocus ? addressRef : undefined} value={draft.replace(/^http:\/\//, '')} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="Address"
            title="Add ?god, ?tune or other debug flags, then press Return" className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-subtle outline-none focus:text-fg" />
        </form>
        <IconButton label={mobile ? 'Fit' : 'Phone size'} active={mobile} onClick={() => setMobile((m) => !m)}><Smartphone size={13} strokeWidth={2} /></IconButton>
        {onFocus && <IconButton label={full ? 'Back to details' : 'Expand'} onClick={onFocus}>{full ? <Minimize2 size={13} strokeWidth={2} /> : <Maximize2 size={13} strokeWidth={2} />}</IconButton>}
        <IconButton label="Open in browser" onClick={() => url && s.api?.openExternal(url)}><ExternalLink size={13} strokeWidth={2} /></IconButton>
      </div>
      <div className={cn('relative min-h-0 flex-1 bg-black', mobile && 'grid place-items-center bg-transparent py-4')}>
        {url ? <iframe key={`${tab}:${s.reloads[tab] ?? 0}`} src={url} title="Preview" allow="autoplay; fullscreen; pointer-lock; gamepad"
          className={cn('border-0 bg-black', mobile ? 'h-full max-h-[844px] w-auto aspect-[390/844] rounded-[10px]' : 'absolute inset-0 h-full w-full')} />
          : <div className="grid h-full place-items-center text-[12px] text-subtle">Starting the game server…</div>}
      </div>
    </div>
  );
}

function NewGamePage({ s }: { s: Studio }) {
  const pick = (name: string) => s.setDraft(NEW, `Make a ${name.toLowerCase()} game where `);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[820px] px-12 pt-12 pb-16">
        <Chip mono>new</Chip>
        <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-[-0.015em]">New game</h1>
        <p className="mt-3 text-[14px] leading-[1.7] text-fg/90">Describe the game in the thread on the right. The agent builds it, playtests it, and leaves five suggested fixes you can apply with a click. A build takes 20 to 30 minutes.</p>

        <h2 className="mt-9 mb-2 text-[13px] font-medium text-muted">Starting points</h2>
        <div className="space-y-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => pick(t.name)} className="block w-full rounded-lg bg-raised px-3 py-2.5 text-left hover:bg-hover">
              <div className="text-[13px]">{t.name}</div>
              <div className="mt-1.5 flex gap-1.5"><Chip className="bg-hover text-muted">{t.note}</Chip><Chip className="bg-hover" mono>templates/{t.id}</Chip></div>
            </button>
          ))}
        </div>

        {!!s.games.length && <>
          <h2 className="mt-9 mb-2 text-[13px] font-medium text-muted">Your games</h2>
          <div className="grid grid-cols-3 gap-3">
            {s.games.map((g) => (
              <button key={g.slug} onClick={() => s.open(g.slug)} className="group rounded-lg bg-raised p-1.5 text-left hover:bg-hover">
                <Thumb url={s.thumbUrl(g)} color={g.color} className="aspect-[16/10] w-full" />
                <span className="block truncate px-1 pt-1.5 text-[13px]">{g.title}</span>
                <span className="block truncate px-1 pb-0.5 text-[12px] text-subtle">{g.engine}</span>
              </button>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}

export type { ReactNode };
