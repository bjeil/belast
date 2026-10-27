import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`mb-3 font-display text-sm uppercase tracking-widest text-viking-gold ${className}`}>
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
      ? 'text-viking-gold'
      : accent === 'red'
        ? 'text-[#E05A66]'
        : accent === 'green'
          ? 'text-emerald-400'
          : 'text-viking-white';
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-viking-white/55">
        {label}
      </span>
      <span className={`font-display text-2xl ${color}`}>{value}</span>
      {sub && <span className="text-xs text-viking-white/60">{sub}</span>}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 font-display text-base uppercase tracking-widest text-viking-white">
      {children}
    </h2>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="card border-dashed p-6 text-center text-sm text-viking-white/60">
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
          ? 'bg-gradient-to-r from-viking-blue-light via-viking-gold/60 to-viking-gold'
          : 'bg-gradient-to-r from-slate-600 via-orange-400 to-[#E05A66]'
      } slider-${variant}`}
    />
  );
}

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
