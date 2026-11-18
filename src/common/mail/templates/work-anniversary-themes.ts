/**
 * 15 Distinct Luxury Themes for Work Anniversary Celebration Emails.
 * - 100% self-contained local assets (no external image hosts or CDN dependencies)
 * - Rich high-contrast palettes and particle accents
 * - Zero hardcoding of employee data: all employee details and milestones are dynamic
 */

export interface AnniversaryTheme {
  id: number;
  slug: string;
  name: string;
  description: string;
  /** Main card background fallback color */
  cardBg: string;
  /** Outer email/page backdrop */
  outerBg: string;
  /** Footer bar background */
  footerBg: string;
  /** Footer bar text color */
  footerText: string;
  /** Primary metallic / stroke gold accent */
  goldAccent: string;
  /** Secondary gold / subtext color */
  subGold: string;
  /** Year number text color */
  yearColor: string;
  /** Employee full name color */
  nameColor: string;
  /** Role / designation color */
  roleColor: string;
  /** Heartfelt quote text color */
  quoteColor: string;
  /** Signoff toast text color */
  signoffColor: string;
  /** Congratulations script text color */
  congratulationsColor: string;
  /** WORK ANNIVERSARY capsule background */
  waBg: string;
  /** WORK ANNIVERSARY capsule text color */
  waText: string;
  /** Category pill background */
  tagBg: string;
  /** Category pill text color */
  tagText: string;
  /** Category pill border color */
  tagBorder: string;
  /** Profile photo inner border */
  photoBorder: string;
  /** Profile photo outer shadow ring */
  photoShadow: string;
  /** Monogram profile background (fallback when no photo) */
  photoFallbackBg: string;
  /** Rising bokeh particle color */
  bokehColor: string;
  /** Falling confetti ribbon alternating colors */
  confettiColors: [string, string];
  /** Twinkling star particle color */
  sparkleColor: string;
  /** Background layer radiant gradient */
  bgGradient: string;
  /** Optional theme-specific background URL override */
  bgUrl?: string;
}

const SHARED_THEME_DEFAULTS = {
  cardBg: '#FFFFFF',
  outerBg: '#FDFBF7',
  footerText: '#94A3B8',
  goldAccent: '#C59B27',
  subGold: '#A56F1E',
  nameColor: '#1E293B',
  roleColor: '#C59B27',
  quoteColor: '#334155',
  signoffColor: '#C59B27',
  congratulationsColor: '#C59B27',
  waText: '#FFFFFF',
  tagBg: 'rgba(255, 255, 255, 0.85)',
  tagText: '#C59B27',
  tagBorder: '#E2C974',
  photoBorder: '#FFFFFF',
  photoShadow: '#C59B27',
} as const;

const buildRadialBg = (
  top: string,
  mid: string,
  edge: string = '#C98B2A',
): string =>
  `radial-gradient(ellipse at 50% 30%, ${top} 0%, ${mid} 60%, ${edge} 100%)`;

const DEFAULT_BOKEH = 'rgba(243, 206, 116, 0.35)';

type ThemeOverride = Omit<AnniversaryTheme, keyof typeof SHARED_THEME_DEFAULTS>;

const THEME_DEFINITIONS: ThemeOverride[] = [
  // ── 1. Champagne Gold & Corporate Navy (anniversary-bg.gif) ───────────────
  {
    id: 1,
    slug: 'champagne-gold-navy',
    name: 'Champagne Gold & Corporate Navy',
    description: 'Warm ivory-champagne glow with sweeping navy & liquid-gold silk ribbons and floating balloons.',
    footerBg: '#0C1F42',
    yearColor: '#0B1F3F',
    waBg: '#0C1F42',
    photoFallbackBg: '#1E3A6E',
    bokehColor: 'rgba(255, 250, 235, 0.65)',
    confettiColors: ['#E4B13E', '#FFF2AE'],
    sparkleColor: '#FFF7D6',
    bgGradient: buildRadialBg('#FFFDF8', '#FAF3E5', '#EFE1C6'),
  },

  // ── 2. Golden Fireworks & Cheering Crowd (anniversary-bg2.gif) ────────────
  {
    id: 2,
    slug: 'golden-fireworks-crowd',
    name: 'Golden Fireworks & Cheering Crowd',
    description: 'Warm parchment backdrop with shimmering golden firework bursts and cheering navy crowd silhouettes.',
    footerBg: '#0A224B',
    yearColor: '#0A224B',
    waBg: '#143368',
    photoFallbackBg: '#27477E',
    bokehColor: 'rgba(232, 184, 72, 0.35)',
    confettiColors: ['#E4B13E', '#F6D56E'],
    sparkleColor: '#FFF7D6',
    bgGradient: buildRadialBg('#FFFDF8', '#FAF0DB', '#F1DCB6'),
  },

  // ── 3. Royal Purple & Gold Botanical (anniversary-bg3.gif) ────────────────
  {
    id: 3,
    slug: 'royal-purple-gold-botanical',
    name: 'Royal Purple & Gold Botanical',
    description: 'Parchment canvas with painterly royal purple brushstrokes and swaying metallic gold botanical sprigs.',
    footerBg: '#290449',
    yearColor: '#4B0E7B',
    waBg: '#3D0A66',
    photoFallbackBg: '#5B1A8E',
    bokehColor: 'rgba(164, 92, 206, 0.32)',
    confettiColors: ['#E7B33D', '#C690E4'],
    sparkleColor: '#FFF4BE',
    bgGradient: buildRadialBg('#FFFDF8', '#FAF2E2', '#F2E2C7'),
  },

  // ── 4. Crimson Silk & Beveled Gold Stars (anniversary-bg4.gif) ────────────
  {
    id: 4,
    slug: 'crimson-silk-gold-stars',
    name: 'Crimson Silk & Beveled Gold Stars',
    description: 'Warm cream canvas framed by royal burgundy silk arcs and slow-floating 3D beveled gold stars.',
    footerBg: '#4A0309',
    yearColor: '#7D0915',
    waBg: '#6B0812',
    photoFallbackBg: '#8F1120',
    bokehColor: 'rgba(231, 179, 61, 0.35)',
    confettiColors: ['#F2C654', '#A61425'],
    sparkleColor: '#FFF7D6',
    bgGradient: buildRadialBg('#FFFDF8', '#FAF1E0', '#F2E0C3'),
  },

  // ── 5. Sunrise Cliff & Misty Skyline (anniversary-bg5.gif) ────────────────
  {
    id: 5,
    slug: 'sunrise-cliff-skyline',
    name: 'Sunrise Cliff & Misty Skyline',
    description: 'Morning blue sky fading into golden sunrise glow over a misty skyline and rocky summit.',
    footerBg: '#18233C',
    yearColor: '#1E2F4D',
    waBg: '#243A60',
    photoFallbackBg: '#3D2B28',
    bokehColor: 'rgba(252, 231, 190, 0.45)',
    confettiColors: ['#E7AC58', '#A6C8F2'],
    sparkleColor: '#FFF9E2',
    bgGradient: buildRadialBg('#F6F9FE', '#D9E8FB', '#FDEED6'),
  },

  // ── 6. Sage Botanical Watercolor (anniversary-bg6.gif) ────────────────────
  {
    id: 6,
    slug: 'sage-botanical-watercolor',
    name: 'Sage Botanical Watercolor',
    description: 'Soft mint-ivory watercolor paper framed by gently swaying sage and forest green corner leaves.',
    footerBg: '#2E5629',
    yearColor: '#2E5629',
    waBg: '#3D6B37',
    photoFallbackBg: '#4A7A42',
    bokehColor: 'rgba(164, 198, 140, 0.36)',
    confettiColors: ['#8EB878', '#CBE2B4'],
    sparkleColor: '#EFF7E6',
    bgGradient: buildRadialBg('#FCFDF9', '#F2F8EC', '#DFECD4'),
  },

  // ── 7. Festive Party Blast Streamers (anniversary-bg7.gif) ────────────────
  {
    id: 7,
    slug: 'festive-party-blast-streamers',
    name: 'Festive Party Blast Streamers',
    description: 'Crisp pearl-white celebration backdrop with slow-floating teal, coral, and gold serpentine streamers.',
    footerBg: '#134E4A',
    yearColor: '#0F3F3C',
    waBg: '#1F9E9A',
    photoFallbackBg: '#B83B28',
    bokehColor: DEFAULT_BOKEH,
    confettiColors: ['#F5B623', '#1F9E9A'],
    sparkleColor: '#FFE58F',
    bgGradient: buildRadialBg('#FFFFFF', '#FCFDFE', '#F6F8FA'),
  },

  // ── 8. Royal Purple Night & Gold Gifts (anniversary-bg8.gif) ──────────────
  {
    id: 8,
    slug: 'royal-purple-night-gifts',
    name: 'Royal Purple Night & Gold Gifts',
    description: 'Velvety indigo-purple night sky with gold gift boxes, floating purple/gold balloons, and stars.',
    footerBg: '#170435',
    yearColor: '#250A4C',
    waBg: '#321163',
    photoFallbackBg: '#4B167A',
    bokehColor: 'rgba(246, 200, 90, 0.35)',
    confettiColors: ['#F6C851', '#9A8CE2'],
    sparkleColor: '#FFF4C2',
    bgGradient: buildRadialBg('#FFF5DC', '#F3EEFC', '#5D4BA8'),
  },

  // ── 9. Lavender Watercolor Floral (anniversary-bg9.gif) ───────────────────
  {
    id: 9,
    slug: 'lavender-watercolor-floral',
    name: 'Lavender Watercolor Floral',
    description: 'Luminous blush-lavender surface with rose-gold hairline framing and drifting lilac blossoms.',
    footerBg: '#4C2875',
    yearColor: '#5C318E',
    waBg: '#6B3FA0',
    photoFallbackBg: '#7E52B5',
    bokehColor: 'rgba(201, 162, 242, 0.35)',
    confettiColors: ['#C9A2F2', '#D4A238'],
    sparkleColor: '#FAF2FF',
    bgGradient: buildRadialBg('#FFFFFF', '#FAF4FF', '#EFE2FA'),
  },

  // ── 10. Midnight Stage Curtains & Spotlights (anniversary-bg10.gif) ───────
  {
    id: 10,
    slug: 'midnight-stage-spotlights',
    name: 'Midnight Stage Curtains & Spotlights',
    description: 'Royal-blue velvet theater curtains parting over volumetric spotlights, hanging gold stars, and podium.',
    footerBg: '#02071A',
    yearColor: '#061640',
    waBg: '#0C2A6E',
    photoFallbackBg: '#113C9E',
    bokehColor: 'rgba(122, 198, 255, 0.35)',
    confettiColors: ['#F7CC58', '#2286EE'],
    sparkleColor: '#FFF8CE',
    bgGradient: buildRadialBg('#FFF7DF', '#EBF4FF', '#113C9E'),
  },

  // ── 11. Twilight Crowd & Violet Stars (anniversary-bg11.gif) ──────────────
  {
    id: 11,
    slug: 'twilight-crowd-violet-stars',
    name: 'Twilight Crowd & Violet Stars',
    description: 'Deep royal-purple twilight stage with violet light shafts, waving crowd hands, and floating stars.',
    footerBg: '#110733',
    yearColor: '#221056',
    waBg: '#331B78',
    photoFallbackBg: '#5B33B8',
    bokehColor: 'rgba(176, 140, 255, 0.35)',
    confettiColors: ['#FFD84D', '#CFB8FF'],
    sparkleColor: '#FFFBE0',
    bgGradient: buildRadialBg('#FFF6DF', '#F3EFFF', '#5B33B8'),
  },

  // ── 12. Spring Tree & Party Streamers (anniversary-bg12.gif) ──────────────
  {
    id: 12,
    slug: 'spring-tree-party-streamers',
    name: 'Spring Tree & Party Streamers',
    description: 'Bright spring-white canvas with rolling lime waves, swaying green tree canopy, and party ribbons.',
    footerBg: '#2B6B04',
    yearColor: '#3C7308',
    waBg: '#489208',
    photoFallbackBg: '#5B9B10',
    bokehColor: 'rgba(155, 226, 38, 0.32)',
    confettiColors: ['#9BE226', '#F3B41C'],
    sparkleColor: '#E7FBBE',
    bgGradient: buildRadialBg('#FFFFFF', '#FAFCF6', '#EEF6E2'),
  },

  // ── 13. Sky Meadow Tree & Balloons (anniversary-bg13.gif) ─────────────────
  {
    id: 13,
    slug: 'sky-meadow-tree-balloons',
    name: 'Sky Meadow Tree & Balloons',
    description: 'Sunlit sky-blue to meadow-green horizon with fluffy clouds, leafy tree, and floating balloons.',
    footerBg: '#0E4410',
    yearColor: '#1A6E1C',
    waBg: '#176E1C',
    photoFallbackBg: '#36A22E',
    bokehColor: 'rgba(198, 233, 253, 0.45)',
    confettiColors: ['#3FA424', '#F3B41C'],
    sparkleColor: '#EBF7FE',
    bgGradient: buildRadialBg('#FFFFFF', '#EBF7FE', '#E7F7C8'),
  },

  // ── 14. Lavender Corner Floral Frame (anniversary-bg14.gif) ───────────────
  {
    id: 14,
    slug: 'lavender-corner-floral-frame',
    name: 'Lavender Corner Floral Frame',
    description: 'Luminous lavender corner washes framed in rounded champagne-gold lines with drifting petals and berries.',
    footerBg: '#4A1E8A',
    yearColor: '#6838A8',
    waBg: '#8246CA',
    photoFallbackBg: '#2D4A9A',
    bokehColor: 'rgba(228, 202, 250, 0.4)',
    confettiColors: ['#C98EF6', '#EAB74C'],
    sparkleColor: '#F6EEFF',
    bgGradient: buildRadialBg('#FFFFFF', '#FDFBFE', '#F6EFFC'),
  },

  // ── 15. Woodland Tree, Value Tags & Trophy (anniversary-bg15.gif) ─────────
  {
    id: 15,
    slug: 'woodland-tree-tags-trophy',
    name: 'Woodland Tree, Value Tags & Trophy',
    description: 'Sunlit cream backdrop with oak tree, swinging wooden value tags, golden trophy cup, and balloons.',
    footerBg: '#42240E',
    yearColor: '#643B1A',
    waBg: '#276206',
    photoFallbackBg: '#865329',
    bokehColor: 'rgba(215, 237, 155, 0.4)',
    confettiColors: ['#F2BF3C', '#56A810'],
    sparkleColor: '#FFF4B2',
    bgGradient: buildRadialBg('#FFFFFF', '#FCFDF7', '#EEF5DC'),
  },
];

export const ANNIVERSARY_THEMES: AnniversaryTheme[] = THEME_DEFINITIONS.map(
  (theme) => ({
    ...SHARED_THEME_DEFAULTS,
    ...theme,
  }),
);

/**
 * Retrieve an anniversary theme by ID (1-15) or slug.
 * Safe fallback to Theme 1.
 */
export const getAnniversaryTheme = (idOrSlug: number | string): AnniversaryTheme => {
  const numericId =
    typeof idOrSlug === 'number'
      ? idOrSlug
      : typeof idOrSlug === 'string' && /^\d+$/.test(idOrSlug.trim())
        ? Number(idOrSlug.trim())
        : Number.NaN;

  if (Number.isInteger(numericId)) {
    const foundById = ANNIVERSARY_THEMES.find((t) => t.id === numericId);
    if (foundById) return foundById;
  }

  if (typeof idOrSlug === 'string') {
    const slugLower = idOrSlug.trim().toLowerCase();
    const foundBySlug = ANNIVERSARY_THEMES.find(
      (t) => t.slug.toLowerCase() === slugLower,
    );
    if (foundBySlug) return foundBySlug;
  }

  return ANNIVERSARY_THEMES[0];
};

/**
 * Milestone-based theme rotation across all configured themes.
 */
export const getThemeForMilestoneYear = (years: number): AnniversaryTheme => {
  const safeYears = Number.isFinite(years) ? Math.max(1, Math.floor(years)) : 1;
  const themeIndex = (safeYears - 1) % ANNIVERSARY_THEMES.length;
  return ANNIVERSARY_THEMES[themeIndex];
};

/**
 * Deterministically assign one of the configured themes to an employee based on their ID & years,
 * so each employee receives a distinct celebration background.
 */
export const getThemeForEmployee = (employeeId: string, years = 1): AnniversaryTheme => {
  const safeId = employeeId || '';
  const safeYears = Number.isFinite(years) ? Math.max(1, Math.floor(years)) : 1;
  let hash = 0;
  for (let i = 0; i < safeId.length; i++) {
    hash = (hash * 31 + safeId.charCodeAt(i)) >>> 0;
  }
  const themeIndex = (hash + safeYears) % ANNIVERSARY_THEMES.length;
  return ANNIVERSARY_THEMES[themeIndex];
};
