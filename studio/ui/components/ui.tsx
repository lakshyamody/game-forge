'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:bg-white disabled:bg-fg/40',
  secondary: 'bg-raised text-fg border border-line-strong hover:bg-hover hover:border-[#3a3a42]',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
  danger: 'bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }>(
  ({ variant = 'secondary', size = 'md', className, ...p }, ref) => (
    <button ref={ref} {...p}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-default disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]', VARIANTS[variant], className)} />
  ),
);
Button.displayName = 'Button';

/** square icon button with a native tooltip (+ optional shortcut) */
export function IconButton({ label, shortcut, active, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; active?: boolean; children: ReactNode }) {
  return (
    <button aria-label={label} title={shortcut ? `${label}  ${shortcut}` : label} {...p}
      className={cn('no-drag grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent', active && 'bg-active text-fg', className)}>
      {children}
    </button>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line-strong bg-raised px-1 font-mono text-[10px] text-subtle">{children}</kbd>
);

export const Dot = ({ tone = 'ok', pulse }: { tone?: 'ok' | 'warn' | 'bad' | 'accent' | 'idle'; pulse?: boolean }) => (
  <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full',
    { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', accent: 'bg-accent', idle: 'bg-subtle' }[tone], pulse && 'animate-pulse')} />
);

/** small coloured rounded square standing in for a game's icon */
export const GameIcon = ({ color, title, size = 16 }: { color: string; title: string; size?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-[4px] font-semibold text-black/75"
    style={{ background: color, width: size, height: size, fontSize: size * 0.6 }}>{title.trim()[0]?.toUpperCase()}</span>
);
