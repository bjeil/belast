/**
 * Tema-hjelpere. Fargene leses fra CSS-variablene i index.css, slik at
 * grafer (recharts) følger samme tema som resten av appen — også i lyst tema.
 */

/** true når lyst tema er aktivt (html har class="light"). */
export function isLightTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light');
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function rgbTriplet(name: string, fallback: string): string {
  const v = cssVar(name, fallback);
  // Formatet er "r g b" (space-separert) — recharts vil ha "rgb(r, g, b)"
  return `rgb(${v.replace(/\s+/g, ', ')})`;
}

export interface ChartTheme {
  tick: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  gold: string;
  pain: string;
  loadMid: string;
  sleep: string;
  nutrition: string;
  text: string;
}

/** Fargepalett for grafer i aktivt tema. */
export function chartTheme(): ChartTheme {
  const light = isLightTheme();
  return {
    tick: rgbTriplet('--chart-tick', light ? '51 65 85' : '255 255 255'),
    grid: `${rgbTriplet('--chart-grid', light ? '15 23 42' : '255 255 255')}`, // brukes med opacity
    tooltipBg: rgbTriplet('--chart-tooltip-bg', light ? '255 255 255' : '29 58 84'),
    tooltipBorder: cssVar('--app-border', light ? '15 23 42' : '255 255 255'),
    tooltipText: rgbTriplet('--app-text', light ? '15 23 42' : '255 255 255'),
    gold: rgbTriplet('--app-gold', '219 192 103'),
    pain: rgbTriplet('--app-pain-soft', '224 90 102'),
    loadMid: rgbTriplet('--load-mid', '79 179 232'),
    sleep: rgbTriplet('--app-sleep', '129 140 248'),
    nutrition: rgbTriplet('--app-nutrition', '52 211 153'),
    text: rgbTriplet('--app-text', light ? '15 23 42' : '255 255 255')
  };
}

/** Kontrast-tekstfarge for gull-bakgrunn (mørk tekst i begge tema). */
export const ON_GOLD_TEXT = '#132436';

/** Standard tooltip-stil for recharts, tema-tilpasset. */
export function chartTooltipStyle(): {
  background: string;
  border: string;
  borderRadius: number;
  color: string;
} {
  const t = chartTheme();
  return {
    background: t.tooltipBg,
    border: `1px solid ${t.tooltipBorder}${isLightTheme() ? '33' : '26'}`,
    borderRadius: 12,
    color: t.tooltipText
  };
}
