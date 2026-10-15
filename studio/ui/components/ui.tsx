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

/**
 * The Nacht mark — the official logo from nachtfellowship.xyz, not a redraw.
 * Inlined (72px alpha, ~4 KB) so it loads under the studio:// scheme with no asset pipeline, and used as a
 * CSS mask filled with currentColor so the one white-on-transparent artwork reads on light and dark alike.
 */
const MARK = 'data:image/png;base64,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';
export const Mark = ({ size = 22 }: { size?: number }) => (
  <span
    aria-hidden
    className="inline-block shrink-0 bg-current"
    style={{ width: size, height: size, maskImage: `url(${MARK})`, WebkitMaskImage: `url(${MARK})`, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center', WebkitMaskPosition: 'center' }}
  />
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
