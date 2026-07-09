// Ballast design tokens — ported from the approved prototype
// (Runway light style + Envelopes category colors).

export const colors = {
  ground: '#F6F7F9',
  card: '#FFFFFF',
  ink: '#0E1726',
  inkMid: '#5C6472',
  inkSoft: '#6B7280',
  greige: '#8A8578',
  faint: '#A7A294',
  line: '#EEF0F2',
  lineSoft: '#F2F3F5',
  teal: '#0E5B57',
  tealBright: '#7FE7C4',
  mintBg: '#E7F4EC',
  good: '#1C8C55',
  bad: '#D0603F',
  warn: '#E9A23B',
  indigo: '#5A51C8',
  blue: '#2D6FB8',
  blueBg: '#EAF2FB',
  greenBg: '#E9F5EF',
  green: '#137A54',
  badBg: '#FAECE7',
  scrim: 'rgba(14,23,38,0.42)',
} as const;

// Per-category palette (ring color, track background, text tint) — from Envelopes.
export const categoryPalette: Record<string, { c: string; track: string; tx: string }> = {
  groceries: { c: '#639922', track: '#EAF3DE', tx: '#3B6D11' },
  dining: { c: '#D85A30', track: '#FAECE7', tx: '#993C1D' },
  transport: { c: '#378ADD', track: '#E6F1FB', tx: '#185FA5' },
  shopping: { c: '#7F77DD', track: '#EEEDFE', tx: '#3C3489' },
  entertainment: { c: '#1D9E75', track: '#E1F5EE', tx: '#0F6E56' },
  health: { c: '#D4537E', track: '#FBEAF0', tx: '#993556' },
};

const PALETTE_CYCLE = Object.values(categoryPalette);

/** Stable palette for any envelope id: known ids get their classic color,
 *  user-created ones hash into the cycle so each keeps a consistent color. */
export function paletteFor(id: string): { c: string; track: string; tx: string } {
  if (categoryPalette[id]) return categoryPalette[id];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE_CYCLE[h % PALETTE_CYCLE.length];
}

// Card-tile colors (deep, so white text/logo reads on them).
export const CARD_COLORS = [
  '#1A1D29', // graphite/black (metal cards — Venture X)
  '#1E3A8A', // deep blue (Prime/Chase, Amex Blue)
  '#0E5B57', // Ballast teal
  '#7A1F2B', // burgundy
  '#1E3A2A', // forest
  '#4B2E83', // purple
  '#B45309', // amber/bronze
  '#334155', // slate
  '#0B4A6F', // ocean
  '#5B2A1E', // rust
  '#2E7D5B', // emerald
  '#6B2D5B', // plum
  '#3A2E1E', // espresso
  '#25455B', // steel
] as const;

// Accent colors for goals + envelopes (readable as an icon/ring tint on light bg).
export const ACCENT_COLORS = [
  '#1C8C55', '#2E7D5B', '#0E5B57', '#2D6FB8', '#0B7EA8', '#2563EB',
  '#7F77DD', '#7C3AED', '#D4537E', '#DB2777', '#E9A23B', '#D9822B',
  '#C2410C', '#B45309', '#4B5563', '#0F766E',
] as const;

/** Ring/icon palette from a user-picked accent color (fill / tint track / text). */
export function ringPalette(hex: string): { c: string; track: string; tx: string } {
  return { c: hex, track: hex + '22', tx: hex };
}

/** Best-guess card color from the issuer/name so cards look distinct out of the box;
 *  the user can override it. */
export function guessCardColor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('venture') || t.includes('capital one')) return '#1A1D29';
  if (t.includes('prime') || t.includes('amazon') || t.includes('chase')) return '#1E3A8A';
  if (t.includes('costco') || t.includes('citi')) return '#334155';
  if (t.includes('amex') || t.includes('american express')) return '#1E5F8A';
  if (t.includes('discover')) return '#B45309';
  return '#1A1D29';
}

export const radius = { card: 18, hero: 20, pill: 999, sheet: 22 } as const;

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
} as const;

export const money = (n: number | null | undefined, opts?: { sign?: boolean }): string => {
  if (n == null) return '—';
  const sign = opts?.sign && n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** Serialize a Date to yyyy-mm-dd using LOCAL components (NOT toISOString, which is UTC
 *  and can shift the day/month/year across timezone boundaries). */
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
