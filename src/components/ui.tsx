import type { ReactNode } from 'react';
import { chartTheme } from '../lib/theme';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`mb-3 font-display text-sm uppercase tracking-widest text-app-gold ${className}`}>
      {children}
    </h2>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = 'gold'
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: 'gold' | 'white' | 'red' | 'green';
}) {
  const color =
    accent === 'gold'
      ? 'text-app-gold'
      : accent === 'red'
        ? 'text-app-pain-soft'
        : accent === 'green'
          ? 'text-emerald-500 dark:text-emerald-400'
          : 'text-app-text';
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-app-text/55">
        {label}
      </span>
      <span className={`font-display text-2xl ${color}`}>{value}</span>
      {sub && <span className="text-xs text-app-text/60">{sub}</span>}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 font-display text-base uppercase tracking-widest text-app-text">
      {children}
    </h2>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="card border-dashed p-6 text-center text-sm text-app-text/60">
      {children}
    </div>
  );
}

export function Slider({
  value,
  min = 1,
  max = 10,
  onChange,
  variant = 'load',
  ariaLabel
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  variant?: 'load' | 'pain';
  ariaLabel: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`h-2 w-full cursor-pointer appearance-none rounded-full ${
        variant === 'load'
          ? 'bg-gradient-to-r from-load-low via-app-gold/60 to-app-gold'
          : 'bg-gradient-to-r from-slate-500 via-red-400 to-app-pain-soft'
      } slider-${variant}`}
    />
  );
}

/** Farge for belastningsnivå i kalender/heatmap (0-10). */
export function loadColorClass(v: number): string {
  if (v === 0) return 'bg-rest/40 text-app-text/50';
  if (v >= 8) return 'bg-app-gold text-[#132436] font-bold';
  if (v >= 5) return 'bg-load-mid text-[#132436]';
  return 'bg-load-low text-app-text';
}

/** Inline-stil-variant for heatmap-celler (små firkanter). */
export function loadColorBgClass(v: number): string {
  if (v === 0) return 'bg-rest/40';
  if (v >= 8) return 'bg-app-gold';
  if (v >= 5) return 'bg-load-mid';
  return 'bg-load-low';
}

export { chartTheme };

export function loadLabel(v: number): string {
  if (v <= 2) return 'Veldig lett';
  if (v <= 4) return 'Lett';
  if (v <= 6) return 'Moderat';
  if (v <= 8) return 'Hardt';
  return 'Maksimalt';
}

export function painLabel(v: number): string {
  if (v <= 2) return 'Nesten ingenting';
  if (v <= 4) return 'Lett smerte';
  if (v <= 6) return 'Moderat smerte';
  if (v <= 8) return 'Sterk smerte';
  return 'Veldig sterk smerte';
}
