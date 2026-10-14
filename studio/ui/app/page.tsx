'use client';
import { useEffect, useRef, useState } from 'react';
import { useStudio } from '@/lib/use-studio';
import { NEW } from '@/lib/studio';
import { ActivityBar, Explorer } from '@/components/sidebar';
import { Browser } from '@/components/browser';
import { Agent } from '@/components/agent';
import { StatusBar, TitleBar } from '@/components/chrome';
import { Setup } from '@/components/setup';

const pref = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(`studio:${k}`); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const keep = (k: string, v: unknown) => { try { localStorage.setItem(`studio:${k}`, JSON.stringify(v)); } catch { /* private mode */ } };

export default function Studio() {
  const s = useStudio();
  const [mounted, setMounted] = useState(false);   // the static export has no Electron bridge: render only in the window
  useEffect(() => setMounted(true), []);
  const [explorer, setExplorer] = useState(true), [agent, setAgent] = useState(true), [width, setWidth] = useState(400);
  useEffect(() => { setExplorer(pref('explorer', true)); setAgent(pref('agent', true)); setWidth(pref('agentWidth', 400)); }, []);
  useEffect(() => keep('explorer', explorer), [explorer]);
  useEffect(() => keep('agent', agent), [agent]);
  useEffect(() => keep('agentWidth', width), [width]);

  // shortcuts come from the native menu (studio/main/ui.mjs) as actions
  const sRef = useRef(s); sRef.current = s;
  const address = useRef<HTMLInputElement>(null);
  useEffect(() => {
    s.api?.onMenu((action) => {
      const st = sRef.current, i = st.tabs.indexOf(st.active);
      if (action === 'new') st.open(NEW);
      else if (action === 'close') st.close(st.active);
      else if (action === 'reload') { if (st.active !== NEW) st.reload(st.active); }
      else if (action === 'sidebar') setExplorer((x) => !x);
      else if (action === 'agent') setAgent((x) => !x);
      else if (action === 'address') address.current?.select();
      else if (action === 'account') st.setSetupOpen(true);
      else if (action === 'export') { if (st.game) void st.exportGame(st.game.slug); }
      else if (action === 'folder') void st.api?.openFolder(st.game?.slug ?? null);
      else if (action === 'nextTab') st.setActive(st.tabs[(i + 1) % st.tabs.length]);
      else if (action === 'prevTab') st.setActive(st.tabs[(i - 1 + st.tabs.length) % st.tabs.length]);
    });
  }, [s.api]);

  // drag the divider to resize the agent panel
  const drag = (e: React.PointerEvent) => {
    const x0 = e.clientX, w0 = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(720, Math.max(320, w0 - (ev.clientX - x0))));
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.style.cursor = ''; };
    addEventListener('pointermove', move); addEventListener('pointerup', up); document.body.style.cursor = 'col-resize';
  };

  if (!mounted) return <div className="h-full bg-bg" />;
  if (!s.api) return <div className="grid h-full place-items-center text-muted">Open this page inside Game Forge Studio.</div>;
  return (
    <div className="flex h-full flex-col">
      <TitleBar s={s} explorer={explorer} agent={agent} toggleExplorer={() => setExplorer((x) => !x)} toggleAgent={() => setAgent((x) => !x)} />
      <div className="flex min-h-0 flex-1">
        <ActivityBar s={s} explorer={explorer} toggleExplorer={() => setExplorer((x) => !x)} />
        {explorer && <Explorer s={s} />}
        <Browser s={s} addressRef={address} />
        {agent && <>
          <div onPointerDown={drag} className="-mx-[2px] w-[4px] shrink-0 cursor-col-resize bg-transparent z-10 hover:bg-accent/40" />
          <Agent s={s} width={width} />
        </>}
      </div>
      <StatusBar s={s} />
      <Setup s={s} />
    </div>
  );
}
