'use client';
/** The chat panel beside a game: the conversation with Claude Code about that game. */
import { PanelRightClose, SquarePen } from 'lucide-react';
import { kbd, type Game } from '@/lib/studio';
import type { Studio } from '@/lib/use-studio';
import { IconButton, Square } from './ui';
import { Composer, Messages } from './chat';

const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function Thread({ s, g, width, onHide }: { s: Studio; g: Game; width: number; onHide: () => void }) {
  const empty = !(s.chats[g.slug] ?? []).length;
  return (
    <aside className="flex shrink-0 flex-col border-l border-line bg-panel" style={{ width }}>
      <header className="flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
        <span className="truncate text-[14px] font-medium">Chat</span>
        <div className="flex-1" />
        <IconButton label="New chat" onClick={() => void s.resetChat(g.slug)}><SquarePen size={15} strokeWidth={1.8} /></IconButton>
        <IconButton label={`Hide chat (${kbd('J')})`} onClick={onHide}><PanelRightClose size={16} strokeWidth={1.8} /></IconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
        <div className="flex-1" />
        {empty && (
          <div className="flex flex-col items-center pb-6 text-center">
            <Square color={g.color} size={28} />
            <p className="mt-3 text-[14px] font-medium">{g.title}</p>
            <p className="mt-1 max-w-[260px] text-[13px] leading-snug text-muted">Ask for changes in plain words: new levels, colours, enemies, sounds.{g.created ? ` Created ${date(g.created)}.` : ''}</p>
          </div>
        )}
        <Messages s={s} chatKey={g.slug} className="pb-4" />
      </div>
      <div className="shrink-0 px-3 pb-3">
        <Composer s={s} chatKey={g.slug} placeholder={`Ask for a change to ${g.title}…`} />
        <p className="px-1 pt-1.5 text-[12px] text-subtle">{s.busy.has(g.slug) ? 'Sends when Claude Code finishes, or press Stop' : 'Return to send · Shift-Return for a new line'}</p>
      </div>
    </aside>
  );
}
