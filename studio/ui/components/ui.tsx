'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fg text-panel hover:opacity-85',
  secondary: 'bg-raised text-fg hover:bg-hover',
  outline: 'border border-line bg-panel text-fg hover:bg-raised',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }>(
  ({ variant = 'secondary', size = 'md', className, ...p }, ref) => (
    <button ref={ref} {...p}
      className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-[13.5px]', VARIANTS[variant], className)} />
  ),
);
Button.displayName = 'Button';

export function IconButton({ label, active, outline, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; outline?: boolean; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} {...p}
      className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40',
        outline && 'border border-line bg-panel hover:bg-raised', active && 'bg-hover text-fg', className)}>
      {children}
    </button>
  );
}

/** small grey label pill (status, metadata, actions) */
export function Chip({ children, onClick, title, className, mono }: { children: ReactNode; onClick?: () => void; title?: string; className?: string; mono?: boolean }) {
  const cls = cn('inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-md bg-raised px-2 text-[12.5px] text-fg', mono && 'font-mono text-[12px]', onClick && 'hover:bg-hover', className);
  return onClick ? <button type="button" title={title} onClick={onClick} className={cls}>{children}</button> : <span title={title} className={cls}>{children}</span>;
}

/** the soft red "New"-style badge */
export const Badge = ({ children, title }: { children: ReactNode; title?: string }) => (
  <span title={title} className="inline-flex h-5 shrink-0 items-center rounded-md bg-badge px-1.5 text-[12px] font-medium text-bad tabular-nums">{children}</span>
);

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="font-sans text-[12px] text-subtle">{children}</kbd>;

/** the Game Forge mark: a nine-spoke asterisk, inheriting the text colour so it works light and dark */
export const Mark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
    <g fill="currentColor">
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x="10.9" y="3.6" width="2.2" height="8.4" rx="1.1" transform={`rotate(${i * 40 + 27} 12 12)`} />
      ))}
    </g>
  </svg>
);

export const Dot = ({ color, className }: { color: string; className?: string }) => <span className={cn('h-2 w-2 shrink-0 rounded-full', className)} style={{ background: color }} />;
export const Square = ({ color, size = 12 }: { color: string; size?: number }) => <span className="shrink-0 rounded-[3px]" style={{ background: color, width: size, height: size }} />;

/** people get initials, the agent gets a glyph — both in a soft circle */
export function Avatar({ label, glyph, tone = '#8b8b94', size = 24 }: { label?: string; glyph?: ReactNode; tone?: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold" style={{ width: size, height: size, fontSize: size * 0.42, color: tone, background: `color-mix(in srgb, ${tone} 18%, transparent)` }}>
      {glyph ?? label?.slice(0, 1).toUpperCase()}
    </span>
  );
}

export const Spinner = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 animate-spin text-subtle', className)} aria-hidden><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.75" /><path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
);

export function Thumb({ url, color, className }: { url: string; color: string; className?: string }) {
  return url ? <img src={url} alt="" draggable={false} className={cn('shrink-0 rounded-md bg-black object-cover', className)} />
    : <span className={cn('block shrink-0 rounded-md', className)} style={{ background: color }} />;
}
