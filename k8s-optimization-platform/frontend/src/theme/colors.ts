/**
 * Canonical color tokens for the platform's dark UI.
 *
 * Why this file exists: the 150+ page files under src/pages each hardcoded
 * their own copy of these values. Three slightly different palettes drifted
 * into use ("slate", "GitHub dark", plain MUI defaults), so the same kind of
 * element (a card border, a danger color, muted text) looks different from
 * page to page. This file is the single source of truth going forward —
 * pages should import `colors` and reference tokens instead of hex literals.
 *
 * Palette: GitHub dark — chosen as the canonical look. Pages that previously
 * used the "slate" or plain-MUI palettes get repainted to these values;
 * pages that already used GitHub dark are unaffected.
 */

// Deliberately NOT `as const`: with it, every value here becomes a narrow
// string-literal type (colors.border is typed as exactly "#30363d", not
// string). Any function elsewhere whose parameter default is a color token
// (e.g. `const card = (accent = DK.border) => ...`) then has its parameter
// type inferred as that one literal, and calling it with any OTHER color
// token fails to type-check (TS2345). Widening to plain `string` here fixes
// that for every such call site at once, rather than patching each one.
export const colors = {
  // Backgrounds
  background: '#0d1117',   // page background
  surface: '#161b22',      // card / paper background
  surfaceHover: '#1c2128', // row / item hover state
  surfaceAlt: '#1c2128',   // secondary panel background

  // Borders
  border: '#30363d',

  // Text
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#c8d0dc',

  // Status
  success: '#3fb950',
  successBg: '#052e16',
  danger: '#f85149',
  dangerBg: '#2d1515',
  warning: '#d29922',
  warningBg: '#2d1f0a',
  info: '#58a6ff',
  infoBg: '#0d2847',
  purple: '#a371f7',
  purpleBg: '#21134d',

  // Decorative gradient used on a handful of promo/banner cards
  gradientStart: '#667eea',
  gradientEnd: '#764ba2',
};

export type ColorToken = keyof typeof colors;
