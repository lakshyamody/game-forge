'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Game } from '@/lib/studio';

type Variant = 'primary' | 'secondary' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-[#1d4ed8] shadow-[0_1px_0_rgba(0,0,0,0.06)]',
  secondary: 'bg-bg text-fg border border-line-strong hover:bg-chrome shadow-[0_1px_0_rgba(0,0,0,0.04)]',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }>(
  ({ variant = 'secondary', size = 'md', className, ...p }, ref) => (
    <button ref={ref} {...p}
      className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-default disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        size === 'sm' ? 'h-[26px] px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]', VARIANTS[variant], className)} />
  ),
);
Button.displayName = 'Button';

export function IconButton({ label, active, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} {...p}
      className={cn('no-drag grid h-7 w-7 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent', active && 'bg-active text-fg', className)}>
      {children}
    </button>
  );
}

/** a game's title-screen thumbnail (npm run thumbs), or a neutral tile in its colour until one exists */
export function Thumb({ g, url, className }: { g: Game; url: string; className?: string }) {
  return url
    ? <img src={url} alt="" draggable={false} className={cn('shrink-0 rounded-[3px] bg-[#111] object-cover ring-1 ring-black/10', className)} />
    : <span className={cn('block shrink-0 rounded-[3px] ring-1 ring-black/10', className)} style={{ background: `linear-gradient(135deg, ${g.color}, ${g.color}99)` }} />;
}

export const Spinner = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 animate-spin text-subtle', className)} aria-hidden><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.75" /><path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
);
