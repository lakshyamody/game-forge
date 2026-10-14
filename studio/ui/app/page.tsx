'use client';
import { useEffect, useRef, useState } from 'react';
import { useStudio } from '@/lib/use-studio';
import { NEW } from '@/lib/studio';
import { Sidebar, type ThemePref } from '@/components/sidebar';
import { TopBar } from '@/components/topbar';
import { CenterPanel } from '@/components/page';
import { Thread } from '@/components/thread';
import { Setup, SetupToast } from '@/components/setup';

const pref = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(`studio:${k}`); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const keep = (k: string, v: unknown) => { try { localStorage.setItem(`studio:${k}`, JSON.stringify(v)); } catch { /* private mode */ } };

export default function Studio() {
  const s = useStudio();
  const [mounted, setMounted] = useState(false);   // the static export has no Electron bridge: render only in the window
  const [sidebar, setSidebar] = useState(true), [thread, setThread] = useState(true), [width, setWidth] = useState(400), [theme, setTheme] = useState<ThemePref>('light');
  useEffect(() => { setSidebar(pref('sidebar', true)); setThread(pref('thread', true)); setWidth(pref('threadWidth', 400)); setTheme(pref('appearance', 'light')); setMounted(true); }, []);
  useEffect(() => { if (mounted) { keep('sidebar', sidebar); keep('thread', thread); keep('threadWidth', width); keep('appearance', theme); } }, [mounted, sidebar, thread, width, theme]);

  // Appearance: dark / light / follow the system
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = t;
      void window.studio?.setTheme?.(t === 'dark');   // Windows caption buttons follow the theme
    };
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // shortcuts come from the native menu (studio/main/ui.mjs) as actions
  const sRef = useRef(s); sRef.current = s;
  const address = useRef<HTMLInputElement>(null), search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    return s.api?.onMenu((action) => {
      const st = sRef.current, i = st.tabs.indexOf(st.active);
      if (action === 'new') st.open(NEW);
      else if (action === 'close') st.close(st.active);
      else if (action === 'reload') { if (st.active !== NEW) st.reload(st.active); }
      else if (action === 'sidebar') setSidebar((x) => !x);
      else if (action === 'agent') setThread((x) => !x);
      else if (action === 'address') address.current?.select();
      else if (action === 'search') search.current?.focus();
      else if (action === 'account') st.setSetupOpen(true);
      else if (action === 'export') { if (st.game) void st.exportGame(st.game.slug); }
      else if (action === 'folder') void st.api?.openFolder(st.game?.slug ?? null);
      else if (action === 'nextTab') st.setActive(st.tabs[(i + 1) % st.tabs.length]);
      else if (action === 'prevTab') st.setActive(st.tabs[(i - 1 + st.tabs.length) % st.tabs.length]);
    });
  }, [s.api]);

  const drag = (e: React.PointerEvent) => {
    const x0 = e.clientX, w0 = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(640, Math.max(320, w0 - (ev.clientX - x0))));
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.style.cursor = ''; };
    addEventListener('pointermove', move); addEventListener('pointerup', up); document.body.style.cursor = 'col-resize';
  };

  if (!mounted) return <div className="h-full bg-window" />;
  if (!s.api) return <div className="grid h-full place-items-center text-muted">Open this page inside Game Forge Studio.</div>;
  const game = s.games.find((g) => g.slug === s.active);
  return (
    <div className="flex h-full flex-col bg-window">
      <TopBar s={s} searchRef={search} />
      <div className="flex min-h-0 flex-1">
        {sidebar && <Sidebar s={s} theme={theme} setTheme={setTheme} />}
        <CenterPanel s={s} addressRef={address} />
        {thread && game && <>
          <div onPointerDown={drag} className="relative z-10 -mr-1 w-1 shrink-0 cursor-col-resize" title="Drag to resize" />
          <Thread s={s} g={game} width={width} onHide={() => setThread(false)} />
        </>}
      </div>
      <Setup s={s} />
      <SetupToast s={s} />
    </div>
  );
}
