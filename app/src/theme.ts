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
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
};
