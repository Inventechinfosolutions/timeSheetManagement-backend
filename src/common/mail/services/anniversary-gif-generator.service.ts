import * as sharp from 'sharp';
import * as GifEncoder from 'gif-encoder-2';
import * as fs from 'fs';
import * as path from 'path';
import {
  getOrdinalSuffix,
} from '../templates/work-anniversary.template';
import {
  IN_LOGO_PATH,
  INVENTECH_WORDMARK_PATH,
  getAnniversaryTemplatePath,
} from '../../../assets';
import { INVENTECH_BRAND } from '../email-templates';

/**
 * Parameters for generating the combined anniversary banner GIF.
 * All values are dynamic — zero hardcoding.
 */
export interface AnniversaryGifParams {
  /** Employee full name (dynamic) */
  name: string;
  /** Number of years at company (dynamic) */
  years: number;
  /** Employee job title / designation (dynamic) */
  designation?: string | null;
  /** Employee ID (optional metadata for callers) */
  employeeId?: string;
  /** Path to the source anniversary-bg.gif asset (kept for caller compatibility) */
  gifSourcePath: string;
  /** Optional profile photo buffer extracted from DB */
  photoBuffer?: Buffer;
  /** Optional custom path to company logo */
  logoPath?: string;
  /** Kept for caller compatibility (no cache — always rebuilds like birthday) */
  force?: boolean;
}

/**
 * Result of banner GIF generation.
 */
export interface AnniversaryGifResult {
  buffer: Buffer;
  /** Empty when built in-memory (no disk cache; same approach as birthday attachments) */
  filePath: string;
  base64: string;
}

// Ensure module resolution works smoothly across both CommonJS and ESM environments
const getSharp = (sharp as any).default || sharp;
const getGifEncoder = (GifEncoder as any).default || GifEncoder;

/**
 * GIF canvas dimensions matched cleanly to the 760px email container with 5:3 landscape proportions.
 */
const GIF_WIDTH = 760;
const GIF_HEIGHT = 456;
const DEFAULT_DESIGNATION = 'Team Member';

/**
 * Smooth periodic 2D drift helper shared across animated background templates.
 */
const slowFloat = (
  baseX: number,
  baseY: number,
  ampX: number,
  ampY: number,
  tau: number,
  phase: number,
) => ({
  x: Number((baseX + Math.sin(tau + phase) * ampX).toFixed(2)),
  y: Number((baseY + Math.cos(tau + phase) * ampY).toFixed(2)),
});

/**
 * Smooth periodic angular sway helper (degrees) shared across botanical & floral templates.
 */
const swayAngle = (ampDeg: number, tau: number, phase: number): number =>
  Number((Math.sin(tau + phase) * ampDeg).toFixed(2));

/**
 * Shared rectangular confetti shard SVG markup.
 */
const buildConfettiShardMarkup = (
  x: number,
  y: number,
  w: number,
  h: number,
  rotDeg: number,
  fill: string,
  opacity: number | string = 0.9,
  rx: number = 1,
): string =>
  `<rect x="${(-w / 2).toFixed(1)}" y="${(-h / 2).toFixed(1)}" width="${w}" height="${h.toFixed(1)}" rx="${rx}" transform="translate(${x}, ${y}) rotate(${rotDeg.toFixed(1)})" fill="${fill}" opacity="${opacity}"/>`;

/**
 * Escapes XML/SVG special characters in dynamic strings.
 */
const escapeXml = (value?: string | null): string => {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Prepares an oval/circular-cropped PNG buffer of the employee's photo
 * with smooth anti-aliased edges. Passing equal width and height produces
 * a clean circular portrait.
 */
export const prepareOvalAvatar = async (
  photoBuffer: Buffer,
  width: number = 154,
  height: number = 154,
): Promise<Buffer> => {
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="white" /></svg>`,
  );

  return await getSharp(photoBuffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
};

/**
 * Prepares the InvenTech company logo buffer (trimmed of empty margin and resized)
 * cleanly for top-left placement.
 */
export const prepareCompanyLogo = async (
  customLogoPath?: string,
  targetWidth: number = 136,
): Promise<{ buffer: Buffer; width: number; height: number } | null> => {
  const logoCandidatePaths = [
    customLogoPath,
    INVENTECH_WORDMARK_PATH,
    IN_LOGO_PATH,
  ].filter(Boolean) as string[];

  let resolvedPath = '';
  for (const lp of logoCandidatePaths) {
    if (fs.existsSync(lp)) {
      resolvedPath = lp;
      break;
    }
  }

  if (!resolvedPath) {
    return null;
  }

  try {
    const buffer = await getSharp(resolvedPath)
      .trim()
      .resize({
        width: targetWidth,
        height: Math.round(targetWidth * 1.15),
        fit: 'inside',
      })
      .png()
      .toBuffer();
    const meta = await getSharp(buffer).metadata();
    return {
      buffer,
      width: meta.width || targetWidth,
      height: meta.height || Math.round(targetWidth * 1.1),
    };
  } catch {
    return null;
  }
};

/**
 * Backward compatibility alias for prepareCompanyLogo
 */
export const prepareWorksphereLogo = prepareCompanyLogo;

/**
 * Builds the static luxury champagne-gold & corporate navy backdrop SVG:
 *  - Warm ivory-champagne radial glow
 *  - Soft golden bokeh lights in corners
 *  - Flowing 3D navy & liquid-gold silk ribbons sweeping along the bottom corners
 *  - Subtle metallic gold stardust accents
 */
const buildLuxuryBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bgWarmGlow" cx="50%" cy="46%" r="68%">
        <stop offset="0%" stop-color="#FFFDF8"/>
        <stop offset="68%" stop-color="#FAF3E5"/>
        <stop offset="100%" stop-color="#EFE1C6"/>
      </radialGradient>

      <radialGradient id="cornerGoldGlowLeft" cx="15%" cy="88%" r="36%">
        <stop offset="0%" stop-color="rgba(230,185,82,0.34)"/>
        <stop offset="100%" stop-color="rgba(230,185,82,0)"/>
      </radialGradient>

      <radialGradient id="cornerGoldGlowRight" cx="88%" cy="85%" r="34%">
        <stop offset="0%" stop-color="rgba(230,185,82,0.32)"/>
        <stop offset="100%" stop-color="rgba(230,185,82,0)"/>
      </radialGradient>

      <linearGradient id="navyWaveDark" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E3A6E"/>
        <stop offset="48%" stop-color="#0C1F42"/>
        <stop offset="100%" stop-color="#061228"/>
      </linearGradient>

      <linearGradient id="goldSilkGrad" x1="0%" y1="0%" x2="100%" y2="85%">
        <stop offset="0%" stop-color="#FFF2BD"/>
        <stop offset="30%" stop-color="#E8B94B"/>
        <stop offset="68%" stop-color="#C58B1E"/>
        <stop offset="100%" stop-color="#8C5D08"/>
      </linearGradient>

      <linearGradient id="goldSilkSoft" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#D49A2A" stop-opacity="0.78"/>
        <stop offset="55%" stop-color="#F7DA82" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#FFF7D6" stop-opacity="0"/>
      </linearGradient>

      <radialGradient id="bokehSoft" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stop-color="rgba(255,244,205,0.85)"/>
        <stop offset="65%" stop-color="rgba(229,182,78,0.28)"/>
        <stop offset="100%" stop-color="rgba(229,182,78,0)"/>
      </radialGradient>

      <filter id="bokehBlur" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4"/>
      </filter>
    </defs>

    <!-- Base champagne canvas -->
    <rect width="${width}" height="${height}" fill="url(#bgWarmGlow)"/>
    <rect width="${width}" height="${height}" fill="url(#cornerGoldGlowLeft)"/>
    <rect width="${width}" height="${height}" fill="url(#cornerGoldGlowRight)"/>

    <!-- Ambient warm bokeh atmosphere -->
    <circle cx="295" cy="48" r="24" fill="url(#bokehSoft)" filter="url(#bokehBlur)"/>
    <circle cx="575" cy="36" r="18" fill="url(#bokehSoft)" filter="url(#bokehBlur)"/>
    <circle cx="52" cy="235" r="22" fill="url(#bokehSoft)" filter="url(#bokehBlur)"/>
    <circle cx="725" cy="248" r="20" fill="url(#bokehSoft)" filter="url(#bokehBlur)"/>

    <!-- Bottom-Left Sweeping Gold & Navy Silk Ribbons -->
    <path d="M -10 318 C 52 342, 118 395, 224 462 L -10 462 Z" fill="url(#goldSilkSoft)"/>
    <path d="M -10 342 C 62 365, 132 412, 232 462 L 178 462 C 102 424, 48 396, -10 382 Z" fill="url(#goldSilkGrad)"/>
    <path d="M -10 366 C 55 372, 114 405, 185 462 L 106 462 C 58 430, 22 414, -10 412 Z" fill="url(#navyWaveDark)"/>
    <path d="M -10 404 C 46 408, 92 430, 140 462 L -10 462 Z" fill="url(#goldSilkGrad)" opacity="0.92"/>
    <path d="M -10 416 C 36 420, 74 438, 108 462 L -10 462 Z" fill="url(#navyWaveDark)"/>

    <!-- Bottom-Right Sweeping Gold & Navy Silk Ribbons -->
    <path d="M 770 322 C 708 352, 646 404, 526 462 L 770 462 Z" fill="url(#goldSilkSoft)"/>
    <path d="M 770 346 C 698 378, 634 420, 548 462 L 606 462 C 674 426, 724 402, 770 388 Z" fill="url(#goldSilkGrad)"/>
    <path d="M 770 374 C 712 384, 658 414, 588 462 L 674 462 C 712 436, 742 420, 770 416 Z" fill="url(#navyWaveDark)"/>
    <path d="M 770 408 C 722 416, 682 434, 642 462 L 770 462 Z" fill="url(#goldSilkGrad)" opacity="0.92"/>
    <path d="M 770 420 C 730 426, 698 442, 670 462 L 770 462 Z" fill="url(#navyWaveDark)"/>

    <!-- Stationary subtle gold glitter dust tucked above bottom waves -->
    <g fill="#D89E28" opacity="0.55">
      <circle cx="195" cy="436" r="1.6"/>
      <circle cx="208" cy="444" r="1.2"/>
      <circle cx="222" cy="432" r="1.8"/>
      <circle cx="238" cy="442" r="1.1"/>
      <circle cx="252" cy="448" r="1.5"/>
      <circle cx="536" cy="446" r="1.4"/>
      <circle cx="552" cy="435" r="1.7"/>
      <circle cx="568" cy="443" r="1.2"/>
      <circle cx="584" cy="430" r="1.5"/>
    </g>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the slowly floating animated background elements for normalized frame progress t ∈ [0, 1):
 *  - 3 metallic gold & pearl-white 3D balloons in the top-right gently bobbing & swaying slowly
 *  - Small curled metallic gold confetti ribbons gently drifting & tilting
 *  - Small gold foil shards & bokeh orbs floating slowly
 *  - 4-point twinkling star sparkle bursts pulsing calmly
 */
const buildFloatingElementsSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 3 Top-Right Balloons — slow, calm, staggered floating phases
  const b1 = slowFloat(668, 66, 3.2, 5.2, tau, 0.2); // Upper-left metallic gold balloon
  const b2 = slowFloat(724, 106, 2.8, 5.8, tau, 2.2); // Far-right pearl-cream balloon
  const b3 = slowFloat(676, 158, 3.6, 4.8, tau, 4.3); // Lower metallic gold balloon

  // Small curled metallic confetti strips floating slowly around frame margins
  const confettiCurls: Array<{
    bx: number;
    by: number;
    ax: number;
    ay: number;
    phase: number;
    baseRot: number;
    rotAmp: number;
    scale: number;
  }> = [
    { bx: 245, by: 46, ax: 3.5, ay: 4.5, phase: 0.4, baseRot: -25, rotAmp: 7, scale: 1.05 },
    { bx: 584, by: 28, ax: 3.0, ay: 4.0, phase: 1.5, baseRot: 32, rotAmp: 6, scale: 0.85 },
    { bx: 42, by: 162, ax: 2.8, ay: 4.2, phase: 2.6, baseRot: -45, rotAmp: 8, scale: 0.9 },
    { bx: 98, by: 318, ax: 3.2, ay: 4.0, phase: 3.7, baseRot: 28, rotAmp: 7, scale: 0.95 },
    { bx: 662, by: 332, ax: 3.4, ay: 4.6, phase: 4.8, baseRot: -18, rotAmp: 8, scale: 1.0 },
    { bx: 724, by: 274, ax: 2.6, ay: 3.8, phase: 5.5, baseRot: 48, rotAmp: 6, scale: 0.8 },
  ];

  const curlMarkup = confettiCurls
    .map((c) => {
      const p = slowFloat(c.bx, c.by, c.ax, c.ay, tau, c.phase);
      const rot = (c.baseRot + Math.sin(tau + c.phase) * c.rotAmp).toFixed(1);
      return `<g transform="translate(${p.x}, ${p.y}) rotate(${rot}) scale(${c.scale})">
        <path d="M -10 -4 C -4 -9, 2 -1, 8 -5 C 12 -7, 13 -1, 9 3 C 3 7, -3 0, -9 4 C -12 6, -13 0, -10 -4 Z" fill="url(#confettiGold)" opacity="0.92"/>
      </g>`;
    })
    .join('\n    ');

  // Small floating gold foil shards / confetti flecks positioned clear of text lines
  const foilBits: Array<{
    bx: number;
    by: number;
    ax: number;
    ay: number;
    phase: number;
    rot: number;
    w: number;
    h: number;
  }> = [
    { bx: 292, by: 96, ax: 2.8, ay: 3.6, phase: 0.8, rot: 22, w: 7, h: 4 },
    { bx: 266, by: 196, ax: 2.4, ay: 3.4, phase: 1.9, rot: -35, w: 6, h: 4 },
    { bx: 612, by: 222, ax: 3.0, ay: 4.0, phase: 3.1, rot: 40, w: 7, h: 4 },
    { bx: 696, by: 268, ax: 2.4, ay: 3.4, phase: 4.4, rot: -18, w: 6, h: 3.5 },
    { bx: 84, by: 368, ax: 2.6, ay: 3.4, phase: 5.1, rot: 15, w: 7, h: 4 },
    { bx: 676, by: 376, ax: 2.8, ay: 3.8, phase: 0.2, rot: -28, w: 6, h: 4 },
    { bx: 48, by: 102, ax: 2.2, ay: 3.2, phase: 2.3, rot: 52, w: 5.5, h: 3.5 },
    { bx: 634, by: 74, ax: 2.4, ay: 3.6, phase: 3.9, rot: -42, w: 6, h: 3.5 },
  ];

  const foilMarkup = foilBits
    .map((f) => {
      const p = slowFloat(f.bx, f.by, f.ax, f.ay, tau, f.phase);
      const rot = (f.rot + Math.cos(tau + f.phase) * 9).toFixed(1);
      return `<rect x="${-f.w / 2}" y="${-f.h / 2}" width="${f.w}" height="${f.h}" rx="1" transform="translate(${p.x}, ${p.y}) rotate(${rot})" fill="url(#confettiGold)" opacity="0.88"/>`;
    })
    .join('\n    ');

  // Floating soft gold bokeh / light orb blasts kept clear of body copy
  const orbBlasts: Array<{
    bx: number;
    by: number;
    r: number;
    ax: number;
    ay: number;
    phase: number;
  }> = [
    { bx: 86, by: 312, r: 16, ax: 2.4, ay: 3.0, phase: 0.7 },
    { bx: 706, by: 294, r: 12, ax: 2.4, ay: 3.6, phase: 2.8 },
    { bx: 562, by: 54, r: 10, ax: 2.2, ay: 2.8, phase: 4.1 },
    { bx: 44, by: 256, r: 13, ax: 2.0, ay: 3.0, phase: 5.3 },
  ];

  const orbMarkup = orbBlasts
    .map((o) => {
      const p = slowFloat(o.bx, o.by, o.ax, o.ay, tau, o.phase);
      const op = (0.52 + 0.22 * Math.sin(tau + o.phase)).toFixed(2);
      return `<circle cx="${p.x}" cy="${p.y}" r="${o.r}" fill="url(#floatBokeh)" opacity="${op}"/>`;
    })
    .join('\n    ');

  // Twinkling 4-point sparkle blasts pulsing slowly
  const sparkles: Array<{
    bx: number;
    by: number;
    r: number;
    ax: number;
    ay: number;
    phase: number;
  }> = [
    { bx: 244, by: 104, r: 7.5, ax: 1.8, ay: 2.4, phase: 0.3 },
    { bx: 266, by: 204, r: 6.0, ax: 1.6, ay: 2.0, phase: 1.8 },
    { bx: 616, by: 122, r: 8.5, ax: 2.0, ay: 2.6, phase: 2.9 },
    { bx: 642, by: 226, r: 9.0, ax: 2.0, ay: 2.5, phase: 4.0 },
    { bx: 726, by: 330, r: 7.5, ax: 1.8, ay: 2.4, phase: 5.2 },
    { bx: 152, by: 416, r: 8.5, ax: 1.6, ay: 2.0, phase: 1.1 },
    { bx: 626, by: 418, r: 8.0, ax: 1.6, ay: 2.0, phase: 3.5 },
    { bx: 342, by: 424, r: 5.5, ax: 1.4, ay: 1.8, phase: 2.1 },
    { bx: 446, by: 422, r: 5.5, ax: 1.4, ay: 1.8, phase: 4.8 },
  ];

  const sparkleMarkup = sparkles
    .map((s) => {
      const p = slowFloat(s.bx, s.by, s.ax, s.ay, tau, s.phase);
      const pulse = 0.72 + 0.32 * Math.sin(tau + s.phase);
      const op = (0.58 + 0.36 * Math.sin(tau + s.phase)).toFixed(2);
      const d = (s.r * pulse).toFixed(2);
      const inner = (s.r * pulse * 0.22).toFixed(2);
      return `<path d="M ${p.x} ${p.y - Number(d)} Q ${p.x} ${p.y} ${p.x + Number(d)} ${p.y} Q ${p.x} ${p.y} ${p.x} ${p.y + Number(d)} Q ${p.x} ${p.y} ${p.x - Number(d)} ${p.y} Q ${p.x} ${p.y} ${p.x} ${p.y - Number(d)} Z" fill="#FFF7D6" stroke="rgba(218,165,48,0.55)" stroke-width="0.6" opacity="${op}"/>
      <circle cx="${p.x}" cy="${p.y}" r="${inner}" fill="#FFFFFF" opacity="${op}"/>`;
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- 3D Metallic Gold Balloon Shading -->
      <radialGradient id="goldBalloonGrad" cx="35%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#FFFBE0"/>
        <stop offset="22%" stop-color="#F6D574"/>
        <stop offset="62%" stop-color="#CF9625"/>
        <stop offset="92%" stop-color="#8A5B0B"/>
        <stop offset="100%" stop-color="#6B4406"/>
      </radialGradient>

      <!-- 3D Pearl-Cream White Balloon Shading -->
      <radialGradient id="pearlBalloonGrad" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="32%" stop-color="#FAF6EF"/>
        <stop offset="72%" stop-color="#DFD7CA"/>
        <stop offset="94%" stop-color="#BEB3A2"/>
        <stop offset="100%" stop-color="#A89C8B"/>
      </radialGradient>

      <linearGradient id="confettiGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF2AE"/>
        <stop offset="48%" stop-color="#E4B13E"/>
        <stop offset="100%" stop-color="#9A6810"/>
      </linearGradient>

      <radialGradient id="floatBokeh" cx="42%" cy="38%" r="58%">
        <stop offset="0%" stop-color="#FFF2C2"/>
        <stop offset="45%" stop-color="#E5AF42" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#D49622" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Floating soft bokeh orbs -->
    ${orbMarkup}

    <!-- Curled gold confetti & foil blasts floating slowly -->
    ${curlMarkup}
    ${foilMarkup}

    <!-- Sparkling burst stars -->
    ${sparkleMarkup}

    <!-- Top-Right 3-Balloon Cluster floating smoothly on curved strings -->
    <!-- Balloon strings curving neatly down -->
    <path d="M ${b1.x - 4} ${b1.y + 42} Q ${b1.x + 8} ${b1.y + 120}, ${b1.x + 2} 295" fill="none" stroke="rgba(166,124,42,0.55)" stroke-width="1.2"/>
    <path d="M ${b2.x - 3} ${b2.y + 39} Q ${b2.x - 16} ${b2.y + 110}, ${b2.x - 18} 290" fill="none" stroke="rgba(155,140,115,0.55)" stroke-width="1.2"/>
    <path d="M ${b3.x - 2} ${b3.y + 37} Q ${b3.x + 10} ${b3.y + 85}, ${b3.x + 4} 312" fill="none" stroke="rgba(166,124,42,0.62)" stroke-width="1.2"/>

    <!-- Balloon 2 (Pearl White - slightly behind right) -->
    <g transform="translate(${b2.x}, ${b2.y}) rotate(7)">
      <path d="M -2 34 L 2 34 L 4 39 L -4 39 Z" fill="#C7BCB0"/>
      <ellipse cx="0" cy="0" rx="28" ry="35" fill="url(#pearlBalloonGrad)"/>
      <ellipse cx="-9" cy="-12" rx="7" ry="12" transform="rotate(-18 -9 -12)" fill="rgba(255,255,255,0.72)"/>
    </g>

    <!-- Balloon 1 (Upper Metallic Gold) -->
    <g transform="translate(${b1.x}, ${b1.y}) rotate(-7)">
      <path d="M -2 37 L 2 37 L 4 42 L -4 42 Z" fill="#A67113"/>
      <ellipse cx="0" cy="0" rx="30" ry="38" fill="url(#goldBalloonGrad)"/>
      <ellipse cx="-10" cy="-13" rx="7.5" ry="13.5" transform="rotate(-16 -10 -13)" fill="rgba(255,255,245,0.58)"/>
    </g>

    <!-- Balloon 3 (Lower Metallic Gold) -->
    <g transform="translate(${b3.x}, ${b3.y}) rotate(-4)">
      <path d="M -2 32 L 2 32 L 4 37 L -4 37 Z" fill="#9D6810"/>
      <ellipse cx="0" cy="0" rx="26" ry="33" fill="url(#goldBalloonGrad)"/>
      <ellipse cx="-8" cy="-11" rx="6.5" ry="11.5" transform="rotate(-16 -8 -11)" fill="rgba(255,255,245,0.55)"/>
    </g>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the crisp static foreground overlay SVG containing:
 *  - Clean top-left Worksphere logo aura
 *  - Left circular 3D gold-ringed portrait frame wrapped with sweeping silk gold swirl ribbon (when photo exists)
 *  - Dynamic milestone hero lockup: HAPPY + 3D gold year number & ordinal + WORK ANNIVERSARY!
 *  - Congratulations, in italic corporate navy serif
 *  - Metallic gold folded ribbon banner displaying the dynamic employee name
 *  - Tracked uppercase designation flanked by champagne-gold rules
 *  - Full-width milestone appreciation lines + framed gold pill quote box
 */
export const buildCenteredAnniversarySvg = (
  name: string,
  ordinal: string,
  years: number,
  designation: string,
  hasPhoto: boolean,
  hasLogo: boolean,
  logoWidth: number = 136,
  logoHeight: number = 42,
  logoY: number = 14,
  ovalW: number = 166,
  ovalH: number = 166,
  ovalY: number = 88,
  centerX: number = 154,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  isDarkBackdrop: boolean = false,
): Buffer => {
  const safeName = escapeXml(name);
  const safeDesignation = escapeXml(designation);
  const safeYearsText = escapeXml(String(Math.max(1, years || 1)));
  const safeSuffix = escapeXml(getOrdinalSuffix(Math.max(1, years || 1)));

  // When no photo is present, shift the hero stack cleanly to center across the full canvas
  const heroCx = hasPhoto ? 446 : Math.round(width / 2);
  const msgCx = Math.round(width / 2);

  // Dynamic sizing for 1-digit vs 2-digit anniversary years
  const isDoubleDigit = safeYearsText.length >= 2;
  const yearNumSize = isDoubleDigit ? 58 : 72;
  const suffixSize = isDoubleDigit ? 23 : 27;
  const workSize = isDoubleDigit ? 29 : 33;
  const annivSize = isDoubleDigit ? 21 : 23;

  // Compute balanced lockup anchor inside heroCx with generous gap before WORK
  const numX = heroCx - (isDoubleDigit ? 88 : 92);
  const suffixX = numX + (isDoubleDigit ? 36 : 22);
  const rightWordX = suffixX + (isDoubleDigit ? 36 : 36);

  // Dynamic sizing for employee name inside gold folded ribbon banner
  const trimmedName = name.trim();
  const nameLen = trimmedName.length;
  const nameFontSize =
    nameLen <= 14 ? 22 : nameLen <= 20 ? 19 : nameLen <= 26 ? 16.5 : 14.5;
  const ribbonHalfW = Math.min(
    182,
    Math.max(126, Math.round(trimmedName.length * (nameFontSize * 0.34) + 38)),
  );
  const ribbonCenterY = 207;
  const ribbonHalfH = 19;

  // Dynamic designation flanking rule width so long titles never collide with hairlines
  const desigUpper = safeDesignation.toUpperCase();
  const desigEstHalfW = Math.min(155, Math.max(54, Math.round(desigUpper.length * 4.9 + 14)));
  const desigOuterHalfW = Math.max(ribbonHalfW - 6, desigEstHalfW + 34);

  // Dynamic milestone copy (zero hardcoded "one year" when years > 1)
  const milestoneSummary =
    years === 1
      ? 'Celebrating one wonderful year of dedication, commitment, and achievements.'
      : `Celebrating ${safeYearsText} wonderful years of dedication, commitment, and achievements.`;

  const brandName = escapeXml(INVENTECH_BRAND.name);
  const brandSubtitle = escapeXml(INVENTECH_BRAND.subtitle.toUpperCase());
  const brandBadgeMarkup = hasLogo
    ? ''
    : `<g filter="url(#dropShadowSoft)">
      <text x="92" y="36" class="brand-name-top" text-anchor="middle">${brandName}</text>
      <text x="92" y="49" class="brand-sub-top" text-anchor="middle">${brandSubtitle}</text>
    </g>`;

  // Circular frame + tapered wrapping 3D gold silk swirl ribbon around left portrait
  const photoCx = centerX;
  const photoCy = ovalY + Math.round(ovalH / 2);
  const photoR = Math.round(ovalW / 2);
  const photoFrameMarkup = hasPhoto
    ? `<!-- Golden Portrait Aura, Brushed 3D Gold Rings & Tapered Sweeping Silk Swirl Ribbon -->
    <circle cx="${photoCx}" cy="${photoCy}" r="${photoR + 10}" fill="rgba(255,244,210,0.45)" filter="url(#softGlow)"/>
    <circle cx="${photoCx}" cy="${photoCy}" r="${photoR + 5}" fill="none" stroke="url(#goldRingGrad)" stroke-width="6.5" filter="url(#dropShadowSoft)"/>
    <circle cx="${photoCx}" cy="${photoCy}" r="${photoR + 1.5}" fill="none" stroke="#FFF6D2" stroke-width="1.6"/>
    <!-- Tapered gold silk ribbon sweeping around lower-left & bottom of the portrait circle -->
    <path d="M ${photoCx - photoR - 2} ${photoCy - 20} C ${photoCx - photoR - 30} ${photoCy + 28}, ${photoCx - 34} ${photoCy + photoR + 30}, ${photoCx + photoR + 56} ${photoCy + photoR + 8} C ${photoCx - 24} ${photoCy + photoR + 22}, ${photoCx - photoR - 18} ${photoCy + 24}, ${photoCx - photoR - 2} ${photoCy - 20} Z" fill="url(#goldRibbonSwirl)" filter="url(#dropShadowSoft)"/>
    <path d="M ${photoCx - photoR - 3} ${photoCy - 18} C ${photoCx - photoR - 26} ${photoCy + 24}, ${photoCx - 30} ${photoCy + photoR + 26}, ${photoCx + photoR + 48} ${photoCy + photoR + 8}" fill="none" stroke="#FFF5C8" stroke-width="1.4" stroke-linecap="round" opacity="0.82"/>`
    : '';

  const eyebrowColor = isDarkBackdrop ? '#F8E3A8' : '#0B1F3F';
  const primaryTextColor = isDarkBackdrop ? '#FFFFFF' : '#0B1F3F';
  const congratsTextColor = isDarkBackdrop ? '#FFF8E8' : '#0E2347';
  const desigTextColor = isDarkBackdrop ? '#F7DF9E' : '#0B1F3F';
  const leadCopyColor = isDarkBackdrop ? '#FFFFFF' : '#0E2347';
  const bodyCopyColor = isDarkBackdrop ? '#EFE8FA' : '#152B4E';
  const quoteCopyColor = isDarkBackdrop ? '#FFF7DF' : '#0B1F3F';
  const brandTopColor = isDarkBackdrop ? '#FFFFFF' : '#0B1F3F';
  const brandSubColor = isDarkBackdrop ? '#F7DF9E' : '#8A5B08';

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .eyebrow-happy { font-family: 'Segoe UI', 'Arial', sans-serif; font-size: 16px; font-weight: 800; fill: ${eyebrowColor}; letter-spacing: 5.5px; }
      .hero-year-num { font-family: 'Georgia', 'Times New Roman', serif; font-size: ${yearNumSize}px; font-weight: 900; fill: url(#gold3dNum); }
      .hero-year-num-shadow { font-family: 'Georgia', 'Times New Roman', serif; font-size: ${yearNumSize}px; font-weight: 900; fill: rgba(125,78,8,0.28); }
      .hero-suffix { font-family: 'Georgia', 'Times New Roman', serif; font-size: ${suffixSize}px; font-weight: 800; fill: url(#gold3dNum); }
      .hero-work { font-family: 'Segoe UI', 'Arial Black', sans-serif; font-size: ${workSize}px; font-weight: 900; fill: ${primaryTextColor}; letter-spacing: 1px; }
      .hero-anniv { font-family: 'Segoe UI', 'Arial', sans-serif; font-size: ${annivSize}px; font-weight: 900; fill: ${primaryTextColor}; letter-spacing: 0.6px; }
      .congrats-script { font-family: 'Georgia', 'Times New Roman', serif; font-size: 24px; font-style: italic; font-weight: 600; fill: ${congratsTextColor}; }
      .ribbon-name { font-family: 'Georgia', 'Times New Roman', serif; font-size: ${nameFontSize}px; font-weight: 900; fill: #030917; letter-spacing: 0.4px; }
      .designation-txt { font-family: 'Segoe UI', 'Arial', sans-serif; font-size: 12px; font-weight: 800; fill: ${desigTextColor}; letter-spacing: 3.4px; }
      .body-copy-lead { font-family: 'Georgia', 'Times New Roman', serif; font-size: 12.2px; font-style: italic; font-weight: 700; fill: ${leadCopyColor}; letter-spacing: 0px; }
      .body-copy { font-family: 'Georgia', 'Times New Roman', serif; font-size: 13.4px; font-style: italic; font-weight: 500; fill: ${bodyCopyColor}; letter-spacing: 0.1px; }
      .quote-copy { font-family: 'Georgia', 'Times New Roman', serif; font-size: 16.5px; font-style: italic; font-weight: 700; fill: ${quoteCopyColor}; letter-spacing: 0.25px; }
      .brand-name-top { font-family: 'Segoe UI', 'Arial', sans-serif; font-size: 16px; font-weight: 900; fill: ${brandTopColor}; letter-spacing: 1.4px; }
      .brand-sub-top { font-family: 'Segoe UI', 'Arial', sans-serif; font-size: 8.5px; font-weight: 700; fill: ${brandSubColor}; letter-spacing: 1.5px; }
      .footer-copy-baked { font-family: 'Segoe UI', 'Arial', sans-serif; font-size: 10px; font-weight: 600; fill: ${isDarkBackdrop ? 'rgba(255, 255, 255, 0.65)' : 'rgba(30, 41, 59, 0.6)'}; letter-spacing: 0.3px; }
    </style>

    <defs>
      <linearGradient id="goldRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF5C4"/>
        <stop offset="28%" stop-color="#E5B649"/>
        <stop offset="55%" stop-color="#FFF0AC"/>
        <stop offset="80%" stop-color="#C2861B"/>
        <stop offset="100%" stop-color="#8A5908"/>
      </linearGradient>

      <linearGradient id="goldRibbonSwirl" x1="0%" y1="0%" x2="100%" y2="40%">
        <stop offset="0%" stop-color="#FFF0AD"/>
        <stop offset="45%" stop-color="#DFAA39"/>
        <stop offset="100%" stop-color="#9A6810"/>
      </linearGradient>

      <linearGradient id="gold3dNum" x1="0%" y1="0%" x2="15%" y2="100%">
        <stop offset="0%" stop-color="#FFF9D6"/>
        <stop offset="28%" stop-color="#F7CF62"/>
        <stop offset="65%" stop-color="#CE921D"/>
        <stop offset="100%" stop-color="#8E5B08"/>
      </linearGradient>

      <linearGradient id="bannerRibbonFace" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#CC9325"/>
        <stop offset="16%" stop-color="#FBE192"/>
        <stop offset="50%" stop-color="#FFF7D6"/>
        <stop offset="84%" stop-color="#FCE08E"/>
        <stop offset="100%" stop-color="#C99023"/>
      </linearGradient>

      <linearGradient id="bannerRibbonTail" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#B07A16"/>
        <stop offset="50%" stop-color="#D7A134"/>
        <stop offset="100%" stop-color="#96640E"/>
      </linearGradient>

      <linearGradient id="goldLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgba(198,146,44,0.1)"/>
        <stop offset="50%" stop-color="#C6922C"/>
        <stop offset="100%" stop-color="rgba(198,146,44,0.1)"/>
      </linearGradient>

      <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6"/>
      </filter>

      <filter id="dropShadowSoft" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(90,62,12,0.22)"/>
      </filter>
    </defs>

    ${brandBadgeMarkup}
    ${photoFrameMarkup}

    <!-- 1. Eyebrow Header: ———— H A P P Y ———— -->
    <line x1="${heroCx - 134}" y1="36" x2="${heroCx - 58}" y2="36" stroke="#C9962E" stroke-width="1.4"/>
    <text x="${heroCx + 2}" y="42" class="eyebrow-happy" text-anchor="middle">HAPPY</text>
    <line x1="${heroCx + 58}" y1="36" x2="${heroCx + 134}" y2="36" stroke="#C9962E" stroke-width="1.4"/>

    <!-- 2. Dimensional 3D Gold Milestone Year + Navy WORK ANNIVERSARY Lockup -->
    <text x="${numX + 2}" y="121" class="hero-year-num-shadow" text-anchor="middle">${safeYearsText}</text>
    <text x="${numX}" y="119" class="hero-year-num" text-anchor="middle" stroke="#9B670B" stroke-width="1.2">${safeYearsText}</text>
    <text x="${suffixX + 1}" y="81" class="hero-suffix" text-anchor="start" style="fill: rgba(125,78,8,0.25);">${safeSuffix}</text>
    <text x="${suffixX}" y="80" class="hero-suffix" text-anchor="start" stroke="#9B670B" stroke-width="0.6">${safeSuffix}</text>

    <text x="${rightWordX}" y="94" class="hero-work" text-anchor="start">WORK</text>
    <text x="${rightWordX}" y="121" class="hero-anniv" text-anchor="start">ANNIVERSARY</text>

    <!-- 3. Tapered champagne gold curved accent under milestone lockup -->
    <path d="M ${heroCx - 148} 134 Q ${heroCx - 12} 145, ${heroCx + 150} 127 Q ${heroCx + 6} 141, ${heroCx - 148} 134 Z" fill="url(#goldLineGrad)"/>

    <!-- 4. Congratulations -->
    <text x="${heroCx}" y="170" class="congrats-script" text-anchor="middle">Congratulations</text>

    <!-- 5. 3D Folded Metallic Gold Ribbon Banner with Dynamic Employee Name -->
    <g filter="url(#dropShadowSoft)">
      <!-- Left & Right Folded Swallowtail Ends -->
      <polygon points="${heroCx - ribbonHalfW - 22},${ribbonCenterY - 12} ${heroCx - ribbonHalfW + 8},${ribbonCenterY - 12} ${heroCx - ribbonHalfW + 8},${ribbonCenterY + 23} ${heroCx - ribbonHalfW - 22},${ribbonCenterY + 23} ${heroCx - ribbonHalfW - 11},${ribbonCenterY + 5.5}" fill="url(#bannerRibbonTail)"/>
      <polygon points="${heroCx + ribbonHalfW + 22},${ribbonCenterY - 12} ${heroCx + ribbonHalfW - 8},${ribbonCenterY - 12} ${heroCx + ribbonHalfW - 8},${ribbonCenterY + 23} ${heroCx + ribbonHalfW + 22},${ribbonCenterY + 23} ${heroCx + ribbonHalfW + 11},${ribbonCenterY + 5.5}" fill="url(#bannerRibbonTail)"/>
      <!-- Dark Fold Crease Triangles -->
      <polygon points="${heroCx - ribbonHalfW},${ribbonCenterY + ribbonHalfH} ${heroCx - ribbonHalfW + 8},${ribbonCenterY + ribbonHalfH} ${heroCx - ribbonHalfW + 8},${ribbonCenterY + 23}" fill="#6E4606"/>
      <polygon points="${heroCx + ribbonHalfW},${ribbonCenterY + ribbonHalfH} ${heroCx + ribbonHalfW - 8},${ribbonCenterY + ribbonHalfH} ${heroCx + ribbonHalfW - 8},${ribbonCenterY + 23}" fill="#6E4606"/>
      <!-- Main Gold Front Ribbon -->
      <rect x="${heroCx - ribbonHalfW}" y="${ribbonCenterY - ribbonHalfH}" width="${ribbonHalfW * 2}" height="${ribbonHalfH * 2}" rx="3" fill="url(#bannerRibbonFace)" stroke="#B8821B" stroke-width="0.8"/>
      <!-- Subtle top/bottom silk sheen edge -->
      <line x1="${heroCx - ribbonHalfW + 6}" y1="${ribbonCenterY - ribbonHalfH + 3}" x2="${heroCx + ribbonHalfW - 6}" y2="${ribbonCenterY - ribbonHalfH + 3}" stroke="rgba(255,255,255,0.65)" stroke-width="1"/>
      <line x1="${heroCx - ribbonHalfW + 6}" y1="${ribbonCenterY + ribbonHalfH - 3}" x2="${heroCx + ribbonHalfW - 6}" y2="${ribbonCenterY + ribbonHalfH - 3}" stroke="rgba(160,110,18,0.45)" stroke-width="1"/>
    </g>
    <text x="${heroCx}" y="${ribbonCenterY + Math.round(nameFontSize * 0.34)}" class="ribbon-name" text-anchor="middle" style="fill: rgba(255,249,224,0.65); stroke: rgba(255,249,224,0.65); stroke-width: 2.2px; stroke-linejoin: round;">${safeName}</text>
    <text x="${heroCx}" y="${ribbonCenterY + Math.round(nameFontSize * 0.34)}" class="ribbon-name" text-anchor="middle">${safeName}</text>

    <!-- 6. Designation flanked cleanly by gold hairlines -->
    <line x1="${heroCx - desigOuterHalfW}" y1="246" x2="${heroCx - desigEstHalfW}" y2="246" stroke="#C9962E" stroke-width="1.3"/>
    <text x="${heroCx + 2}" y="250" class="designation-txt" text-anchor="middle">${desigUpper}</text>
    <line x1="${heroCx + desigEstHalfW}" y1="246" x2="${heroCx + desigOuterHalfW}" y2="246" stroke="#C9962E" stroke-width="1.3"/>

    <!-- 7. Stylish Full-Width Appreciation Messages (dynamic milestone years, no trailing !) -->
    <text x="${msgCx}" y="288" class="body-copy-lead" text-anchor="middle">${milestoneSummary}</text>
    <text x="${msgCx}" y="316" class="body-copy" text-anchor="middle">Thank you for being a valuable part of our team. We truly appreciate</text>
    <text x="${msgCx}" y="337" class="body-copy" text-anchor="middle">your contributions and look forward to many more milestones together.</text>

    <!-- 8. Closing Wishes Sentence (plain text without card box or !) -->
    <text x="${msgCx}" y="378" class="quote-copy" text-anchor="middle">Here's to many more successful years ahead.</text>

    <!-- 9. Corporate Copyright & Domain Footer baked directly inside the design template -->
    <text x="${msgCx}" y="424" class="footer-copy-baked" text-anchor="middle">&#169; ${new Date().getFullYear()} InvenTech Info Solutions Pvt. Ltd. &#8226; inventechinfo.com</text>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Renders a multi-frame GIF from a pre-rasterized stationary backdrop and per-frame SVG builder.
 */
const renderAnimatedTemplateGif = async (
  backdropSvg: Buffer,
  floatingSvgForProgress: (t: number) => Buffer,
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 32,
  frameDelay: number = 100,
): Promise<Buffer> => {
  const backdropBuffer = await getSharp(backdropSvg).png().toBuffer();

  const encoder = new getGifEncoder(width, height, 'octree', false);
  encoder.setRepeat(0);
  encoder.setDelay(frameDelay);
  encoder.start();

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const frameRaw = await getSharp(backdropBuffer)
      .composite([{ input: floatingSvgForProgress(t), top: 0, left: 0 }])
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    encoder.addFrame(frameRaw.data);
  }

  encoder.finish();
  const buffer: Buffer = (encoder as any).out.getData();

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
  }

  return buffer;
};

/**
 * Generates deterministic radiating golden firework burst rays and sparkle dots.
 */
const buildFireworkBurstMarkup = (
  cx: number,
  cy: number,
  maxRadius: number,
  rayCount: number,
  t: number,
  phase: number,
): string => {
  const tau = 2 * Math.PI * t;
  const breath = 1 + 0.03 * Math.sin(tau + phase);
  const baseOpacity = (0.78 + 0.2 * Math.sin(tau + phase)).toFixed(2);
  const parts: string[] = [];

  // Bright core burst glow
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${(14 * breath).toFixed(1)}" fill="url(#fwCoreGlow)" opacity="${baseOpacity}"/>`,
  );

  for (let i = 0; i < rayCount; i++) {
    const angle = ((i / rayCount) * 2 * Math.PI) + phase * 0.25;
    const lenRatio = 0.56 + 0.44 * ((Math.sin(i * 7.3) + 1) / 2);
    const rOuter = maxRadius * lenRatio * breath;
    const rInner = 8 + (i % 3) * 6;
    const x1 = (cx + Math.cos(angle) * rInner).toFixed(1);
    const y1 = (cy + Math.sin(angle) * rInner).toFixed(1);
    const x2 = (cx + Math.cos(angle) * rOuter).toFixed(1);
    const y2 = (cy + Math.sin(angle) * rOuter).toFixed(1);
    const sw = (0.85 + (i % 3) * 0.35).toFixed(2);
    const color = i % 2 === 0 ? '#D49824' : '#E7BC52';
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" opacity="${baseOpacity}"/>`,
    );

    // Shimmering gold spark tip beads
    const beadR = (1.1 + (i % 2) * 0.65).toFixed(2);
    parts.push(
      `<circle cx="${x2}" cy="${y2}" r="${beadR}" fill="#F6D56E" opacity="${baseOpacity}"/>`,
    );
    if (i % 2 === 0) {
      const mx = (cx + Math.cos(angle + 0.04) * (rOuter * 0.68)).toFixed(1);
      const my = (cy + Math.sin(angle + 0.04) * (rOuter * 0.68)).toFixed(1);
      parts.push(`<circle cx="${mx}" cy="${my}" r="1.2" fill="#E3AB34" opacity="${baseOpacity}"/>`);
    }
  }

  return `<g>${parts.join('')}</g>`;
};

/**
 * Generates vector silhouette figures of a cheering crowd along the bottom curve.
 * Figures sit tall on the left/right edges and dip cleanly at center so copy remains clear.
 */
const buildCheeringPersonSvg = (
  x: number,
  yHead: number,
  scale: number,
  fill: string,
  armMode: 'both' | 'left' | 'right',
  baseHeight: number = 140,
  leftArmDeg: number = 0,
  rightArmDeg: number = 0,
  withFist: boolean = false,
): string => {
  const r = 13 * scale;
  const shoulderW = 22 * scale;
  const torsoTop = yHead + r * 1.15;
  const torsoBottom = yHead + baseHeight;
  const armW = (7.2 * scale).toFixed(1);

  const buildRaisedArm = (isRight: boolean, deg: number): string => {
    const dir = isRight ? 1 : -1;
    const sx = x + dir * shoulderW * 0.72;
    const sy = torsoTop + 8 * scale;
    const ex = x + dir * shoulderW * 1.35;
    const ey = yHead + 2 * scale;
    const hx = x + dir * shoulderW * 1.55;
    const hy = yHead - 22 * scale;
    const armPath = `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${ex.toFixed(1)} ${ey.toFixed(1)}, ${hx.toFixed(1)} ${hy.toFixed(1)}" fill="none" stroke="${fill}" stroke-width="${armW}" stroke-linecap="round"/>`;
    const fist = withFist
      ? `<circle cx="${hx.toFixed(1)}" cy="${(hy - 2.5 * scale).toFixed(1)}" r="${(5.4 * scale).toFixed(1)}" fill="${fill}"/>`
      : '';
    if (deg === 0) return `${armPath}${fist}`;
    return `<g transform="rotate(${deg.toFixed(2)}, ${sx.toFixed(1)}, ${sy.toFixed(1)})">${armPath}${fist}</g>`;
  };

  const leftArm = armMode === 'both' || armMode === 'left' ? buildRaisedArm(false, leftArmDeg) : '';
  const rightArm = armMode === 'both' || armMode === 'right' ? buildRaisedArm(true, rightArmDeg) : '';

  return `${leftArm}${rightArm}
    <circle cx="${x.toFixed(1)}" cy="${yHead.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}"/>
    <path d="M ${(x - shoulderW).toFixed(1)} ${torsoBottom.toFixed(1)} L ${(x - shoulderW * 0.92).toFixed(1)} ${(torsoTop + 14 * scale).toFixed(1)} Q ${x.toFixed(1)} ${torsoTop.toFixed(1)}, ${(x + shoulderW * 0.92).toFixed(1)} ${(torsoTop + 14 * scale).toFixed(1)} L ${(x + shoulderW).toFixed(1)} ${torsoBottom.toFixed(1)} Z" fill="${fill}"/>`;
};

/**
 * Builds the static warm cream backdrop + faded golden ghost silhouettes for Template 2 (`anniversary-bg2.gif`).
 */
const buildCrowdFireworksBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const ghostGold = 'rgba(218, 174, 78, 0.25)';
  const ghostPeople = [
    buildCheeringPersonSvg(56, 336, 1.08, ghostGold, 'both', 140),
    buildCheeringPersonSvg(134, 366, 0.96, ghostGold, 'right', 120),
    buildCheeringPersonSvg(626, 366, 0.96, ghostGold, 'left', 120),
    buildCheeringPersonSvg(704, 336, 1.08, ghostGold, 'both', 140),
  ].join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="fwBgGlow" cx="50%" cy="44%" r="68%">
        <stop offset="0%" stop-color="#FFFDF8"/>
        <stop offset="65%" stop-color="#FAF0DB"/>
        <stop offset="100%" stop-color="#F1DCB6"/>
      </radialGradient>
      <radialGradient id="fwEdgeWarmLeft" cx="10%" cy="85%" r="36%">
        <stop offset="0%" stop-color="rgba(229,180,74,0.28)"/>
        <stop offset="100%" stop-color="rgba(229,180,74,0)"/>
      </radialGradient>
      <radialGradient id="fwEdgeWarmRight" cx="90%" cy="85%" r="36%">
        <stop offset="0%" stop-color="rgba(229,180,74,0.28)"/>
        <stop offset="100%" stop-color="rgba(229,180,74,0)"/>
      </radialGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#fwBgGlow)"/>
    <rect width="${width}" height="${height}" fill="url(#fwEdgeWarmLeft)"/>
    <rect width="${width}" height="${height}" fill="url(#fwEdgeWarmRight)"/>

    <!-- Background soft gold cheering silhouettes -->
    ${ghostPeople}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the slowly floating fireworks starbursts, confetti blasts, and cheering navy
 * crowd silhouettes for Template 2 (`anniversary-bg2.gif`) across normalized time t ∈ [0, 1).
 */
const buildCrowdFireworksFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;
  const dyGroupA = (Math.sin(tau) * 1.9).toFixed(2);
  const dxGroupA = (Math.cos(tau) * 1.1).toFixed(2);
  const dyGroupB = (Math.sin(tau + 2.1) * 1.8).toFixed(2);
  const dxGroupB = (Math.cos(tau + 2.1) * 1.0).toFixed(2);
  const dyGroupC = (Math.sin(tau + 4.2) * 1.5).toFixed(2);

  // Cheering crowd split cleanly into 3 subtly moving layers along U-shaped bottom arc
  const navyMain = '#0A224B';
  const navyBack = '#143368';

  const crowdBackLayer = `<g transform="translate(${dxGroupB}, ${dyGroupB})">
    ${buildCheeringPersonSvg(92, 378, 0.94, navyBack, 'both', 110)}
    ${buildCheeringPersonSvg(168, 404, 0.82, navyBack, 'right', 90)}
    ${buildCheeringPersonSvg(592, 404, 0.82, navyBack, 'left', 90)}
    ${buildCheeringPersonSvg(668, 378, 0.94, navyBack, 'both', 110)}
  </g>`;

  const crowdFrontSides = `<g transform="translate(${dxGroupA}, ${dyGroupA})">
    ${buildCheeringPersonSvg(24, 362, 1.08, navyMain, 'both', 120)}
    ${buildCheeringPersonSvg(114, 392, 0.94, navyMain, 'right', 95)}
    ${buildCheeringPersonSvg(646, 392, 0.94, navyMain, 'left', 95)}
    ${buildCheeringPersonSvg(736, 362, 1.08, navyMain, 'both', 120)}
  </g>`;

  const crowdCenterLow = `<g transform="translate(0, ${dyGroupC})">
    ${buildCheeringPersonSvg(216, 424, 0.72, navyMain, 'left', 65)}
    ${buildCheeringPersonSvg(272, 434, 0.66, navyBack, 'right', 55)}
    ${buildCheeringPersonSvg(332, 438, 0.62, navyMain, 'both', 50)}
    ${buildCheeringPersonSvg(386, 440, 0.60, navyBack, 'right', 48)}
    ${buildCheeringPersonSvg(440, 437, 0.62, navyMain, 'left', 50)}
    ${buildCheeringPersonSvg(498, 433, 0.68, navyBack, 'both', 55)}
    ${buildCheeringPersonSvg(548, 423, 0.72, navyMain, 'right', 65)}
  </g>
  <rect x="-10" y="${height - 16}" width="${width + 20}" height="24" fill="${navyMain}"/>`;

  // Subtle slow drifting confetti flecks & 4-point sparkles kept cleanly away from center text
  const floatSpecs: Array<{
    bx: number;
    by: number;
    ax: number;
    ay: number;
    phase: number;
    kind: 'shard' | 'spark';
    size: number;
    rot: number;
  }> = [
    { bx: 125, by: 196, ax: 2.8, ay: 3.6, phase: 0.4, kind: 'shard', size: 6.5, rot: -25 },
    { bx: 94, by: 266, ax: 2.5, ay: 3.2, phase: 1.5, kind: 'spark', size: 6.5, rot: 0 },
    { bx: 158, by: 298, ax: 2.2, ay: 3.0, phase: 2.8, kind: 'shard', size: 6.0, rot: 35 },
    { bx: 638, by: 204, ax: 2.8, ay: 3.6, phase: 1.1, kind: 'shard', size: 6.5, rot: 28 },
    { bx: 668, by: 274, ax: 2.5, ay: 3.2, phase: 3.7, kind: 'spark', size: 7.0, rot: 0 },
    { bx: 604, by: 302, ax: 2.2, ay: 3.0, phase: 4.9, kind: 'shard', size: 6.0, rot: -32 },
    { bx: 202, by: 112, ax: 2.0, ay: 2.8, phase: 2.0, kind: 'spark', size: 5.5, rot: 0 },
    { bx: 558, by: 114, ax: 2.0, ay: 2.8, phase: 4.4, kind: 'spark', size: 5.5, rot: 0 },
  ];

  const floatMarkup = floatSpecs
    .map((f) => {
      const x = Number((f.bx + Math.sin(tau + f.phase) * f.ax).toFixed(2));
      const y = Number((f.by + Math.cos(tau + f.phase) * f.ay).toFixed(2));
      if (f.kind === 'shard') {
        const rot = (f.rot + Math.sin(tau + f.phase) * 9).toFixed(1);
        return `<rect x="${(-f.size / 2).toFixed(1)}" y="${(-f.size * 0.3).toFixed(1)}" width="${f.size}" height="${(f.size * 0.6).toFixed(1)}" rx="1" transform="translate(${x}, ${y}) rotate(${rot})" fill="url(#fwGoldShard)" opacity="0.86"/>`;
      }
      const pulse = 0.72 + 0.32 * Math.sin(tau + f.phase);
      const d = (f.size * pulse).toFixed(2);
      const op = (0.58 + 0.35 * Math.sin(tau + f.phase)).toFixed(2);
      return `<path d="M ${x} ${y - Number(d)} Q ${x} ${y} ${x + Number(d)} ${y} Q ${x} ${y} ${x} ${y + Number(d)} Q ${x} ${y} ${x - Number(d)} ${y} Q ${x} ${y} ${x} ${y - Number(d)} Z" fill="#FFF7D6" stroke="rgba(218,165,48,0.6)" stroke-width="0.6" opacity="${op}"/>`;
    })
    .join('\n    ');

  const leftFw = buildFireworkBurstMarkup(54, 48, 138, 42, t, 0.2);
  const rightFw = buildFireworkBurstMarkup(706, 48, 138, 42, t, 2.4);

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="fwCoreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(255,248,214,0.95)"/>
        <stop offset="55%" stop-color="rgba(232,184,72,0.45)"/>
        <stop offset="100%" stop-color="rgba(232,184,72,0)"/>
      </radialGradient>
      <linearGradient id="fwGoldShard" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF2AE"/>
        <stop offset="50%" stop-color="#E4B13E"/>
        <stop offset="100%" stop-color="#9A6810"/>
      </linearGradient>
    </defs>

    <!-- Corner golden firework bursts slowly shimmering -->
    ${leftFw}
    ${rightFw}

    <!-- Slowly floating small gold confetti & sparkle blasts -->
    ${floatMarkup}

    <!-- Slowly cheering bottom crowd silhouettes -->
    ${crowdBackLayer}
    ${crowdFrontSides}
    ${crowdCenterLow}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Renders a two-tone metallic gold botanical leaf rotated cleanly around its base stem point.
 */
const buildGoldLeafSvg = (
  baseX: number,
  baseY: number,
  angleDeg: number,
  length: number,
  width: number,
): string => {
  const halfW = (width / 2).toFixed(1);
  const tipX = length.toFixed(1);
  const c1 = (length * 0.34).toFixed(1);
  const c2 = (length * 0.72).toFixed(1);
  return `<g transform="translate(${baseX.toFixed(1)}, ${baseY.toFixed(1)}) rotate(${angleDeg.toFixed(1)})">
    <path d="M 0 0 C ${c1} -${halfW}, ${c2} -${(width * 0.42).toFixed(1)}, ${tipX} 0 L 0 0 Z" fill="url(#leafGoldLight)"/>
    <path d="M 0 0 C ${c1} ${halfW}, ${c2} ${(width * 0.42).toFixed(1)}, ${tipX} 0 L 0 0 Z" fill="url(#leafGoldDark)"/>
    <path d="M 0 0 Q ${(length * 0.5).toFixed(1)} -0.6 ${tipX} 0" fill="none" stroke="#9B670B" stroke-width="0.9" opacity="0.72"/>
  </g>`;
};

/**
 * Builds the static warm parchment & diagonal royal purple + metallic gold brushstroke backdrop
 * for Template 3 (`anniversary-bg3.gif`).
 */
const buildPurpleGoldBotanicalBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="pgBgGlow" cx="50%" cy="48%" r="68%">
        <stop offset="0%" stop-color="#FFFDF8"/>
        <stop offset="68%" stop-color="#FAF2E2"/>
        <stop offset="100%" stop-color="#F2E2C7"/>
      </radialGradient>
      <linearGradient id="purpleStrokeDeep" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#290449"/>
        <stop offset="55%" stop-color="#4B0E7B"/>
        <stop offset="100%" stop-color="#7622AC"/>
      </linearGradient>
      <linearGradient id="purpleWashSoft" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(116, 36, 166, 0.72)"/>
        <stop offset="60%" stop-color="rgba(164, 92, 206, 0.45)"/>
        <stop offset="100%" stop-color="rgba(198, 144, 228, 0.14)"/>
      </linearGradient>
      <linearGradient id="foilBrushGold" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#A86F10"/>
        <stop offset="32%" stop-color="#E7B33D"/>
        <stop offset="55%" stop-color="#FFF4BE"/>
        <stop offset="82%" stop-color="#D79E28"/>
        <stop offset="100%" stop-color="#9A640D"/>
      </linearGradient>
      <radialGradient id="purpleGlowTopLeft" cx="12%" cy="10%" r="28%">
        <stop offset="0%" stop-color="rgba(130, 56, 178, 0.18)"/>
        <stop offset="100%" stop-color="rgba(130, 56, 178, 0)"/>
      </radialGradient>
      <radialGradient id="purpleGlowBotRight" cx="88%" cy="88%" r="30%">
        <stop offset="0%" stop-color="rgba(130, 56, 178, 0.2)"/>
        <stop offset="100%" stop-color="rgba(130, 56, 178, 0)"/>
      </radialGradient>
      <filter id="pgBrushSoft" x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur stdDeviation="2.2"/>
      </filter>
    </defs>

    <!-- Warm parchment canvas -->
    <rect width="${width}" height="${height}" fill="url(#pgBgGlow)"/>
    <rect width="${width}" height="${height}" fill="url(#purpleGlowTopLeft)"/>
    <rect width="${width}" height="${height}" fill="url(#purpleGlowBotRight)"/>

    <!-- TOP-LEFT: Organic Painterly Purple Watercolor & Brushed Gold Corner -->
    <g>
      <path d="M -12 -10 L 204 -10 C 186 10, 168 18, 152 34 C 138 48, 126 52, 108 68 C 90 84, 72 96, 50 118 C 32 136, 12 146, -12 166 Z" fill="url(#purpleWashSoft)" filter="url(#pgBrushSoft)"/>
      <path d="M -10 -10 L 172 -10 C 154 6, 134 16, 122 30 C 106 44, 86 58, 70 72 C 50 90, 26 110, -10 138 Z" fill="url(#purpleStrokeDeep)" opacity="0.86"/>
      <path d="M -10 -10 L 130 -10 C 110 8, 86 24, 66 42 C 44 62, 18 82, -10 104 Z" fill="#2A0548" opacity="0.88"/>
      <!-- Jagged organic watercolor gold & violet brush bristles -->
      <path d="M -8 128 C 28 100, 68 72, 108 40 C 138 16, 166 -2, 188 -10 L 198 -4 C 174 10, 142 32, 108 58 C 68 88, 30 116, -4 140 Z" fill="url(#foilBrushGold)" opacity="0.92"/>
      <path d="M -6 108 C 26 84, 62 56, 98 28 C 122 10, 144 -2, 162 -10 L 168 -6 C 148 6, 124 22, 98 42 C 62 70, 28 96, -2 118 Z" fill="#FFF1B6" opacity="0.72"/>
      <path d="M 6 146 C 48 116, 94 82, 142 44 C 166 26, 188 10, 208 -2 L 213 4 C 190 18, 166 36, 140 56 C 94 92, 50 124, 12 152 Z" fill="url(#foilBrushGold)" opacity="0.68"/>
      <circle cx="154" cy="48" r="2.2" fill="#7320A6" opacity="0.55"/>
      <circle cx="122" cy="78" r="1.8" fill="#B97D16" opacity="0.65"/>
      <circle cx="196" cy="18" r="1.6" fill="#7320A6" opacity="0.5"/>
    </g>

    <!-- BOTTOM-RIGHT: Matching Organic Painterly Purple Watercolor & Brushed Gold Corner -->
    <g>
      <path d="M 772 466 L 528 466 C 554 446, 582 432, 608 408 C 632 386, 654 364, 682 340 C 708 318, 740 288, 772 254 Z" fill="url(#purpleWashSoft)" filter="url(#pgBrushSoft)"/>
      <path d="M 772 466 L 568 466 C 596 446, 626 424, 652 398 C 680 370, 712 344, 742 314 C 756 300, 764 290, 772 280 Z" fill="url(#purpleStrokeDeep)" opacity="0.9"/>
      <path d="M 772 466 L 626 466 C 658 442, 694 410, 728 378 C 748 358, 762 344, 772 330 Z" fill="#2A0548" opacity="0.9"/>
      <!-- Diagonal painterly metallic gold foil streaks -->
      <path d="M 532 464 C 584 432, 636 394, 688 348 C 722 318, 750 292, 770 268 L 776 276 C 754 302, 726 328, 692 358 C 640 404, 590 440, 544 466 Z" fill="url(#foilBrushGold)" opacity="0.92"/>
      <path d="M 568 466 C 618 434, 668 396, 718 352 C 742 330, 760 314, 774 298 L 778 306 C 762 322, 744 338, 720 360 C 672 404, 624 440, 580 466 Z" fill="#FFF0AE" opacity="0.78"/>
      <path d="M 608 466 C 656 436, 704 398, 748 358 C 760 348, 768 340, 774 332 L 777 338 C 770 346, 762 354, 750 364 C 708 402, 662 438, 620 466 Z" fill="url(#foilBrushGold)" opacity="0.76"/>
      <circle cx="598" cy="402" r="2.2" fill="#7320A6" opacity="0.5"/>
      <circle cx="644" cy="368" r="1.8" fill="#B97D16" opacity="0.65"/>
      <circle cx="718" cy="296" r="1.6" fill="#7320A6" opacity="0.48"/>
    </g>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the slowly swaying golden leaf branches and gentle floating gold foil blasts
 * for Template 3 (`anniversary-bg3.gif`) across normalized time t ∈ [0, 1).
 */
const buildPurpleGoldBotanicalFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;
  // Gentle, slow leaf sway anchored at corners
  const topLeafRot = (Math.sin(tau) * 1.15).toFixed(2);
  const topLeafDx = (Math.cos(tau) * 0.9).toFixed(2);
  const topLeafDy = (Math.sin(tau) * 1.2).toFixed(2);

  const botLeafRot = (Math.sin(tau + 2.4) * 1.15).toFixed(2);
  const botLeafDx = (Math.cos(tau + 2.4) * 0.9).toFixed(2);
  const botLeafDy = (Math.sin(tau + 2.4) * 1.1).toFixed(2);

  // Top-right golden botanical sprig anchored cleanly inside the top-right corner
  const topRightSprig = `<g transform="translate(${topLeafDx}, ${topLeafDy}) rotate(${topLeafRot}, 758, 4)">
    <path d="M 764 -4 C 734 38, 694 82, 650 118" fill="none" stroke="#B68018" stroke-width="2.1" stroke-linecap="round"/>
    <path d="M 728 36 C 708 32, 688 22, 674 12" fill="none" stroke="#C58E22" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 702 68 C 708 92, 704 114, 694 134" fill="none" stroke="#C58E22" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 744 20 C 750 48, 746 72, 738 94" fill="none" stroke="#C58E22" stroke-width="1.5" stroke-linecap="round"/>
    ${buildGoldLeafSvg(676, 13, -158, 50, 20)}
    ${buildGoldLeafSvg(696, 26, -138, 44, 18)}
    ${buildGoldLeafSvg(712, 52, 162, 54, 21)}
    ${buildGoldLeafSvg(668, 102, 146, 56, 22)}
    ${buildGoldLeafSvg(702, 82, 106, 48, 19)}
    ${buildGoldLeafSvg(695, 118, 116, 46, 18)}
    ${buildGoldLeafSvg(742, 40, 88, 52, 20)}
    ${buildGoldLeafSvg(739, 78, 98, 44, 17)}
    ${buildGoldLeafSvg(756, 14, 128, 40, 16)}
  </g>`;

  // Bottom-left golden botanical sprig clear of both portrait circle and bottom quote pill
  const botLeftSprig = `<g transform="translate(${botLeafDx}, ${botLeafDy}) rotate(${botLeafRot}, 4, 452)">
    <path d="M -4 460 C 32 424, 72 388, 122 352" fill="none" stroke="#B68018" stroke-width="2.1" stroke-linecap="round"/>
    <path d="M 38 418 C 32 392, 34 370, 42 346" fill="none" stroke="#C58E22" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 64 396 C 88 398, 108 408, 126 420" fill="none" stroke="#C58E22" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 16 442 C 42 444, 68 446, 94 446" fill="none" stroke="#C58E22" stroke-width="1.5" stroke-linecap="round"/>
    ${buildGoldLeafSvg(42, 350, -78, 52, 20)}
    ${buildGoldLeafSvg(64, 372, -52, 48, 19)}
    ${buildGoldLeafSvg(114, 356, -34, 54, 21)}
    ${buildGoldLeafSvg(84, 396, -18, 48, 19)}
    ${buildGoldLeafSvg(110, 412, 16, 52, 20)}
    ${buildGoldLeafSvg(78, 444, 4, 54, 21)}
    ${buildGoldLeafSvg(22, 388, -104, 46, 18)}
    ${buildGoldLeafSvg(18, 424, -124, 42, 17)}
  </g>`;

  // Slowly floating golden confetti shards, gold foil dots, and tiny sparkle blasts around safe outer margins
  const blastSpecs: Array<{
    bx: number;
    by: number;
    ax: number;
    ay: number;
    phase: number;
    kind: 'shard' | 'dot' | 'spark';
    size: number;
    rot: number;
  }> = [
    { bx: 242, by: 48, ax: 2.2, ay: 3.0, phase: 0.3, kind: 'dot', size: 3.4, rot: 0 },
    { bx: 604, by: 24, ax: 2.4, ay: 3.0, phase: 1.4, kind: 'shard', size: 7.0, rot: -28 },
    { bx: 616, by: 158, ax: 2.2, ay: 3.0, phase: 2.5, kind: 'dot', size: 3.6, rot: 0 },
    { bx: 722, by: 204, ax: 2.5, ay: 3.3, phase: 3.6, kind: 'shard', size: 7.5, rot: 36 },
    { bx: 696, by: 266, ax: 2.2, ay: 2.9, phase: 4.8, kind: 'spark', size: 6.5, rot: 0 },
    { bx: 48, by: 214, ax: 2.0, ay: 2.8, phase: 0.9, kind: 'shard', size: 7.0, rot: -42 },
    { bx: 38, by: 294, ax: 2.2, ay: 2.8, phase: 2.1, kind: 'dot', size: 3.2, rot: 0 },
    { bx: 156, by: 318, ax: 2.0, ay: 2.6, phase: 3.3, kind: 'spark', size: 5.8, rot: 0 },
    { bx: 612, by: 344, ax: 2.4, ay: 3.1, phase: 4.2, kind: 'dot', size: 3.8, rot: 0 },
    { bx: 668, by: 312, ax: 2.2, ay: 3.0, phase: 5.4, kind: 'shard', size: 6.5, rot: 22 },
    { bx: 188, by: 62, ax: 2.0, ay: 2.8, phase: 1.9, kind: 'shard', size: 6.0, rot: -18 },
    { bx: 544, by: 186, ax: 2.0, ay: 2.6, phase: 5.8, kind: 'dot', size: 2.8, rot: 0 },
  ];

  const blastMarkup = blastSpecs
    .map((b) => {
      const x = Number((b.bx + Math.sin(tau + b.phase) * b.ax).toFixed(2));
      const y = Number((b.by + Math.cos(tau + b.phase) * b.ay).toFixed(2));
      if (b.kind === 'shard') {
        const rot = (b.rot + Math.sin(tau + b.phase) * 8).toFixed(1);
        return `<rect x="${(-b.size / 2).toFixed(1)}" y="${(-b.size * 0.3).toFixed(1)}" width="${b.size}" height="${(b.size * 0.6).toFixed(1)}" rx="1.1" transform="translate(${x}, ${y}) rotate(${rot})" fill="url(#pgGoldBlast)" opacity="0.9"/>`;
      }
      if (b.kind === 'dot') {
        const op = (0.72 + 0.24 * Math.sin(tau + b.phase)).toFixed(2);
        return `<circle cx="${x}" cy="${y}" r="${b.size}" fill="url(#pgGoldBlast)" opacity="${op}"/>`;
      }
      const pulse = 0.72 + 0.3 * Math.sin(tau + b.phase);
      const d = (b.size * pulse).toFixed(2);
      const op = (0.62 + 0.32 * Math.sin(tau + b.phase)).toFixed(2);
      return `<path d="M ${x} ${y - Number(d)} Q ${x} ${y} ${x + Number(d)} ${y} Q ${x} ${y} ${x} ${y + Number(d)} Q ${x} ${y} ${x - Number(d)} ${y} Q ${x} ${y} ${x} ${y - Number(d)} Z" fill="#FFF7D6" stroke="rgba(218,165,48,0.65)" stroke-width="0.6" opacity="${op}"/>`;
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="leafGoldLight" x1="0%" y1="0%" x2="100%" y2="20%">
        <stop offset="0%" stop-color="#FFEFA8"/>
        <stop offset="55%" stop-color="#F2C655"/>
        <stop offset="100%" stop-color="#C88D1D"/>
      </linearGradient>
      <linearGradient id="leafGoldDark" x1="0%" y1="0%" x2="100%" y2="80%">
        <stop offset="0%" stop-color="#DFAA35"/>
        <stop offset="65%" stop-color="#B97D16"/>
        <stop offset="100%" stop-color="#875408"/>
      </linearGradient>
      <linearGradient id="pgGoldBlast" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF3B2"/>
        <stop offset="50%" stop-color="#E4B03C"/>
        <stop offset="100%" stop-color="#9A660F"/>
      </linearGradient>
    </defs>

    ${topRightSprig}
    ${botLeftSprig}
    ${blastMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Computes (x, y) vertices for a classic 5-point star centered at (cx, cy).
 */
const getFivePointStarVertices = (
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  rotDeg: number = 0,
): Array<{ x: number; y: number }> => {
  const pts: Array<{ x: number; y: number }> = [];
  const startRad = ((-90 + rotDeg) * Math.PI) / 180;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = startRad + (i * Math.PI) / 5;
    pts.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }
  return pts;
};

/**
 * Renders the dimensional 3D beveled metallic gold star frame for Template 4 (`anniversary-bg4.gif`).
 */
const buildBeveledGoldStarSvg = (
  cx: number,
  cy: number,
  outerR: number,
  rotDeg: number,
  opacity: string,
): string => {
  const innerR = outerR * 0.42;
  const ringR = outerR * 0.68;
  const ringInnerR = innerR * 0.68;
  const outerPts = getFivePointStarVertices(0, 0, outerR, innerR, rotDeg);
  const innerPts = getFivePointStarVertices(0, 0, ringR, ringInnerR, rotDeg);

  const facets: string[] = [];
  for (let i = 0; i < 10; i++) {
    const next = (i + 1) % 10;
    const o1 = outerPts[i];
    const o2 = outerPts[next];
    const i2 = innerPts[next];
    const i1 = innerPts[i];
    const fill = i % 2 === 0 ? 'url(#starBevelLight)' : 'url(#starBevelDark)';
    facets.push(
      `<polygon points="${o1.x.toFixed(1)},${o1.y.toFixed(1)} ${o2.x.toFixed(1)},${o2.y.toFixed(1)} ${i2.x.toFixed(1)},${i2.y.toFixed(1)} ${i1.x.toFixed(1)},${i1.y.toFixed(1)}" fill="${fill}"/>`,
    );
  }

  return `<g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)})" opacity="${opacity}" filter="url(#starSoftShadow)">
    ${facets.join('\n    ')}
  </g>`;
};

/**
 * Builds the static warm parchment & royal burgundy + brushed gold curved corner backdrop
 * for Template 4 (`anniversary-bg4.gif`).
 */
const buildCrimsonStarBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="csBgGlow" cx="50%" cy="46%" r="68%">
        <stop offset="0%" stop-color="#FFFDF8"/>
        <stop offset="68%" stop-color="#FAF1E0"/>
        <stop offset="100%" stop-color="#F2E0C3"/>
      </radialGradient>
      <linearGradient id="crimsonSilkDeep" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4A0309"/>
        <stop offset="48%" stop-color="#7D0915"/>
        <stop offset="100%" stop-color="#A61425"/>
      </linearGradient>
      <linearGradient id="crimsonGoldBand" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#9B660E"/>
        <stop offset="28%" stop-color="#E7B33D"/>
        <stop offset="52%" stop-color="#FFF4C0"/>
        <stop offset="78%" stop-color="#D59A25"/>
        <stop offset="100%" stop-color="#8C5909"/>
      </linearGradient>
      <radialGradient id="csWarmCornerLeft" cx="8%" cy="8%" r="28%">
        <stop offset="0%" stop-color="rgba(218, 162, 56, 0.16)"/>
        <stop offset="100%" stop-color="rgba(218, 162, 56, 0)"/>
      </radialGradient>
      <radialGradient id="csWarmCornerBot" cx="50%" cy="100%" r="55%">
        <stop offset="0%" stop-color="rgba(145, 16, 32, 0.12)"/>
        <stop offset="100%" stop-color="rgba(145, 16, 32, 0)"/>
      </radialGradient>
    </defs>

    <!-- Warm cream canvas -->
    <rect width="${width}" height="${height}" fill="url(#csBgGlow)"/>
    <rect width="${width}" height="${height}" fill="url(#csWarmCornerLeft)"/>
    <rect width="${width}" height="${height}" fill="url(#csWarmCornerBot)"/>

    <!-- Subtle soft architectural light arcs -->
    <path d="M 420 -10 C 560 90, 680 180, 770 260 L 770 -10 Z" fill="rgba(255, 245, 222, 0.42)"/>
    <path d="M -10 260 C 120 330, 260 390, 420 466 L -10 466 Z" fill="rgba(247, 224, 182, 0.25)"/>

    <!-- TOP-LEFT: Royal Crimson & Brushed Metallic Gold Sweeping Arc -->
    <g>
      <path d="M -10 -10 L 210 -10 C 148 22, 74 72, -10 142 Z" fill="url(#crimsonGoldBand)"/>
      <path d="M -10 -10 L 186 -10 C 128 20, 62 66, -10 128 Z" fill="url(#crimsonSilkDeep)"/>
      <path d="M -10 -10 L 146 -10 C 98 18, 46 54, -10 100 Z" fill="#5B050D" opacity="0.9"/>
      <path d="M -10 126 C 60 66, 128 20, 188 -10 L 194 -10 C 134 22, 66 70, -10 132 Z" fill="#FFF2BA" opacity="0.72"/>
    </g>

    <!-- BOTTOM: Full Sweeping Royal Crimson & Brushed Gold Celebration Arc (kept cleanly below quote pill) -->
    <g>
      <path d="M -10 382 C 165 446, 595 446, 770 378 L 770 466 L -10 466 Z" fill="url(#crimsonGoldBand)"/>
      <path d="M -10 396 C 175 452, 585 452, 770 392 L 770 466 L -10 466 Z" fill="url(#crimsonSilkDeep)"/>
      <path d="M -10 418 C 195 458, 565 458, 770 416 L 770 466 L -10 466 Z" fill="#52040A" opacity="0.92"/>
      <path d="M -10 385 C 165 448, 595 448, 770 381 L 770 386 C 595 453, 165 453, -10 390 Z" fill="#FFF3BD" opacity="0.76"/>
    </g>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the slowly floating big 3D gold star, small gold 5-point stars, and small gold confetti blasts
 * for Template 4 (`anniversary-bg4.gif`) across normalized time t ∈ [0, 1).
 */
const buildCrimsonStarFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Hero Big Beveled Gold Star in upper-right corner (slow calm bob & subtle tilt)
  const bigCx = 682 + Math.sin(tau + 0.4) * 2.0;
  const bigCy = 92 + Math.cos(tau + 0.4) * 3.0;
  const bigRot = 8 + Math.sin(tau + 0.4) * 1.4;
  const bigStarMarkup = buildBeveledGoldStarSvg(bigCx, bigCy, 64, bigRot, '0.88');

  // 2. Small metallic gold 5-point stars scattered safely around margins & corners
  const smallStars: Array<{
    bx: number;
    by: number;
    r: number;
    ax: number;
    ay: number;
    phase: number;
    rot: number;
  }> = [
    { bx: 248, by: 46, r: 7.5, ax: 2.0, ay: 2.8, phase: 0.2, rot: 12 },
    { bx: 594, by: 28, r: 8.5, ax: 2.2, ay: 2.8, phase: 1.5, rot: -14 },
    { bx: 726, by: 214, r: 7.8, ax: 2.0, ay: 3.0, phase: 2.8, rot: 18 },
    { bx: 682, by: 274, r: 6.2, ax: 2.0, ay: 2.6, phase: 4.1, rot: -8 },
    { bx: 48, by: 204, r: 7.2, ax: 1.8, ay: 2.8, phase: 3.3, rot: 10 },
    { bx: 84, by: 368, r: 8.0, ax: 2.2, ay: 2.8, phase: 5.0, rot: -16 },
    { bx: 656, by: 344, r: 8.0, ax: 2.2, ay: 2.8, phase: 0.9, rot: 14 },
    { bx: 706, by: 422, r: 7.4, ax: 1.8, ay: 2.2, phase: 2.2, rot: -10 },
    { bx: 52, by: 424, r: 7.0, ax: 1.8, ay: 2.2, phase: 4.6, rot: 15 },
  ];

  const smallStarMarkup = smallStars
    .map((s) => {
      const x = s.bx + Math.sin(tau + s.phase) * s.ax;
      const y = s.by + Math.cos(tau + s.phase) * s.ay;
      const rot = s.rot + Math.sin(tau + s.phase) * 3.5;
      const pts = getFivePointStarVertices(x, y, s.r, s.r * 0.44, rot)
        .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        .join(' ');
      const op = (0.78 + 0.18 * Math.sin(tau + s.phase)).toFixed(2);
      return `<polygon points="${pts}" fill="url(#csGoldFill)" stroke="#9A660F" stroke-width="0.45" opacity="${op}"/>`;
    })
    .join('\n    ');

  // 3. Slowly floating gold foil confetti diamond shards & tiny sparkle blasts
  const blastSpecs: Array<{
    bx: number;
    by: number;
    ax: number;
    ay: number;
    phase: number;
    kind: 'shard' | 'spark';
    size: number;
    rot: number;
  }> = [
    { bx: 208, by: 62, ax: 2.0, ay: 2.6, phase: 0.6, kind: 'shard', size: 6.5, rot: 35 },
    { bx: 554, by: 192, ax: 1.8, ay: 2.4, phase: 2.0, kind: 'spark', size: 5.5, rot: 0 },
    { bx: 718, by: 146, ax: 2.0, ay: 2.8, phase: 3.5, kind: 'shard', size: 6.0, rot: -32 },
    { bx: 734, by: 304, ax: 2.0, ay: 2.8, phase: 4.9, kind: 'spark', size: 6.2, rot: 0 },
    { bx: 38, by: 294, ax: 1.8, ay: 2.6, phase: 1.3, kind: 'spark', size: 5.8, rot: 0 },
    { bx: 146, by: 318, ax: 1.8, ay: 2.4, phase: 2.7, kind: 'shard', size: 6.2, rot: 28 },
    { bx: 698, by: 266, ax: 2.0, ay: 2.6, phase: 5.6, kind: 'shard', size: 6.0, rot: -24 },
    { bx: 626, by: 382, ax: 1.8, ay: 2.2, phase: 3.9, kind: 'spark', size: 5.5, rot: 0 },
  ];

  const blastMarkup = blastSpecs
    .map((b) => {
      const x = Number((b.bx + Math.sin(tau + b.phase) * b.ax).toFixed(2));
      const y = Number((b.by + Math.cos(tau + b.phase) * b.ay).toFixed(2));
      if (b.kind === 'shard') {
        const rot = (b.rot + Math.sin(tau + b.phase) * 7).toFixed(1);
        return `<rect x="${(-b.size / 2).toFixed(1)}" y="${(-b.size * 0.34).toFixed(1)}" width="${b.size}" height="${(b.size * 0.68).toFixed(1)}" rx="1" transform="translate(${x}, ${y}) rotate(${rot})" fill="url(#csGoldFill)" opacity="0.88"/>`;
      }
      const pulse = 0.72 + 0.28 * Math.sin(tau + b.phase);
      const d = (b.size * pulse).toFixed(2);
      const op = (0.64 + 0.3 * Math.sin(tau + b.phase)).toFixed(2);
      return `<path d="M ${x} ${y - Number(d)} Q ${x} ${y} ${x + Number(d)} ${y} Q ${x} ${y} ${x} ${y + Number(d)} Q ${x} ${y} ${x - Number(d)} ${y} Q ${x} ${y} ${x} ${y - Number(d)} Z" fill="#FFF7D6" stroke="rgba(218,165,48,0.68)" stroke-width="0.6" opacity="${op}"/>`;
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="starBevelLight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF6C4"/>
        <stop offset="55%" stop-color="#F2C654"/>
        <stop offset="100%" stop-color="#C98E1D"/>
      </linearGradient>
      <linearGradient id="starBevelDark" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#DAA22E"/>
        <stop offset="60%" stop-color="#B07713"/>
        <stop offset="100%" stop-color="#7D4F06"/>
      </linearGradient>
      <linearGradient id="csGoldFill" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF2AE"/>
        <stop offset="50%" stop-color="#E5B23E"/>
        <stop offset="100%" stop-color="#9A660F"/>
      </linearGradient>
      <filter id="starSoftShadow" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="1" dy="3" stdDeviation="3" flood-color="rgba(110,72,10,0.22)"/>
      </filter>
    </defs>

    ${bigStarMarkup}
    ${smallStarMarkup}
    ${blastMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the static misty sky, faint distant city skyline, golden sunrise halo,
 * and right rocky cliff crag backdrop for Template 5 (`anniversary-bg5.gif`).
 */
const buildSunriseCliffBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="skyBaseGrad" x1="0%" y1="0%" x2="88%" y2="82%">
        <stop offset="0%" stop-color="#A6C8F2"/>
        <stop offset="32%" stop-color="#D9E8FB"/>
        <stop offset="68%" stop-color="#F6F9FE"/>
        <stop offset="100%" stop-color="#FDEED6"/>
      </linearGradient>
      <radialGradient id="sunriseGlowMain" cx="84%" cy="42%" r="42%">
        <stop offset="0%" stop-color="#FFF9DF"/>
        <stop offset="45%" stop-color="#FCE7BE" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#FDEED6" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="skylineHazeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(122, 152, 192, 0.22)"/>
        <stop offset="65%" stop-color="rgba(156, 182, 214, 0.12)"/>
        <stop offset="100%" stop-color="rgba(236, 244, 254, 0)"/>
      </linearGradient>
      <linearGradient id="cliffDarkFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#533D36"/>
        <stop offset="35%" stop-color="#312426"/>
        <stop offset="100%" stop-color="#141824"/>
      </linearGradient>
      <linearGradient id="cliffSunRim" x1="0%" y1="0%" x2="100%" y2="80%">
        <stop offset="0%" stop-color="#E7AC58"/>
        <stop offset="48%" stop-color="#96613A"/>
        <stop offset="100%" stop-color="#3D2B28"/>
      </linearGradient>
      <linearGradient id="bottomMistFade" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#F3F7FD" stop-opacity="0.92"/>
        <stop offset="60%" stop-color="#F6F9FE" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#F6F9FE" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <!-- Soft morning blue sky fading into bright center haze and warm sunrise glow -->
    <rect width="${width}" height="${height}" fill="url(#skyBaseGrad)"/>
    <rect width="${width}" height="${height}" fill="url(#sunriseGlowMain)"/>

    <!-- Faint misty city skyline along horizon (kept subtle behind text) -->
    <path d="M 0 340 L 0 246 L 26 246 L 26 214 L 54 214 L 54 252 L 74 252 L 74 198 L 88 184 L 102 198 L 102 248 L 128 248 L 128 228 L 154 228 L 154 256 L 210 256 L 210 218 L 242 218 L 242 250 L 284 250 L 284 224 L 318 224 L 318 258 L 368 258 L 368 206 L 392 206 L 392 246 L 440 246 L 440 222 L 478 222 L 478 254 L 516 254 L 516 196 L 544 196 L 544 242 L 580 242 L 580 212 L 604 192 L 628 212 L 628 252 L 760 252 L 760 340 Z" fill="url(#skylineHazeGrad)"/>

    <!-- Soft misty lower horizon fade keeping bottom copy super readable (rendered behind cliff) -->
    <rect x="0" y="252" width="${width}" height="${height - 252}" fill="url(#bottomMistFade)"/>

    <!-- Soft warm glowing sun behind cliff summit -->
    <circle cx="642" cy="194" r="54" fill="#FFF2CC" opacity="0.55"/>
    <circle cx="642" cy="194" r="32" fill="#FFF9E2" opacity="0.82"/>
    <circle cx="642" cy="194" r="18" fill="#FFFDF4" opacity="0.96"/>

    <!-- Dramatic Rocky Cliff Crag on far right -->
    <g>
      <path d="M 624 462 L 642 356 L 634 294 L 648 248 L 644 230 L 664 224 L 732 224 L 770 236 L 770 462 Z" fill="url(#cliffDarkFace)"/>
      <!-- Golden sunrise-lit rock edge facets on left face -->
      <path d="M 644 230 L 664 224 L 672 248 L 658 296 L 674 348 L 656 414 L 664 462 L 624 462 L 642 356 L 634 294 L 648 248 Z" fill="url(#cliffSunRim)" opacity="0.88"/>
      <polygon points="668,254 714,274 696,342 664,318" fill="#211C24" opacity="0.72"/>
      <polygon points="704,282 752,312 738,392 692,358" fill="#171925" opacity="0.82"/>
      <polygon points="658,348 708,388 686,462 638,462" fill="#1E202C" opacity="0.86"/>
      <path d="M 644 230 L 664 224 L 698 225 L 678 232 L 656 238 Z" fill="#F2BE68" opacity="0.65"/>
    </g>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the slowly floating clouds, soft sunrise motes, and gently celebrating cliff figure
 * for Template 5 (`anniversary-bg5.gif`) across normalized time t ∈ [0, 1).
 */
const buildSunriseCliffFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Soft slow-drifting sky clouds (smooth periodic motion)
  const cloudDrift = (baseX: number, baseY: number, ax: number, ay: number, phase: number) => ({
    x: Number((baseX + Math.sin(tau + phase) * ax).toFixed(2)),
    y: Number((baseY + Math.cos(tau + phase) * ay).toFixed(2)),
  });

  const c1 = cloudDrift(176, 60, 4.2, 1.3, 0.2);
  const c2 = cloudDrift(482, 46, 3.8, 1.2, 2.0);
  const c3 = cloudDrift(704, 78, 3.2, 1.3, 3.8);
  const c4 = cloudDrift(64, 152, 2.8, 1.1, 5.1);

  const cloudMarkup = `
    <g transform="translate(${c1.x}, ${c1.y})" opacity="0.46">
      <path d="M -54 10 Q -60 0 -42 -4 Q -32 -16 -12 -14 Q 6 -22 24 -11 Q 44 -10 50 2 Q 62 6 52 12 L -50 12 Z" fill="#FFFFFF"/>
    </g>
    <g transform="translate(${c2.x}, ${c2.y})" opacity="0.44">
      <path d="M -58 9 Q -62 0 -40 -5 Q -26 -17 -4 -13 Q 16 -20 34 -8 Q 56 -6 58 6 Q 60 11 46 11 L -52 11 Z" fill="#FFFFFF"/>
    </g>
    <g transform="translate(${c3.x}, ${c3.y})" opacity="0.48">
      <path d="M -46 8 Q -52 -1 -32 -6 Q -18 -16 2 -11 Q 22 -18 36 -5 Q 52 -2 48 9 L -42 9 Z" fill="#FFF8EC"/>
    </g>
    <g transform="translate(${c4.x}, ${c4.y})" opacity="0.34">
      <path d="M -38 7 Q -42 -1 -24 -5 Q -8 -13 12 -7 Q 34 -6 36 7 Z" fill="#FFFFFF"/>
    </g>`;

  // 2. Soft luminous sky motes drifting gently in the morning sun
  const skyMotes: Array<{ bx: number; by: number; r: number; ax: number; ay: number; phase: number }> = [
    { bx: 598, by: 148, r: 2.2, ax: 1.8, ay: 2.4, phase: 0.4 },
    { bx: 648, by: 112, r: 2.6, ax: 2.0, ay: 2.6, phase: 1.8 },
    { bx: 734, by: 136, r: 2.4, ax: 1.8, ay: 2.4, phase: 3.1 },
    { bx: 584, by: 234, r: 2.0, ax: 1.6, ay: 2.2, phase: 4.4 },
    { bx: 248, by: 64, r: 2.0, ax: 1.8, ay: 2.2, phase: 2.5 },
    { bx: 48, by: 368, r: 2.2, ax: 1.8, ay: 2.2, phase: 5.3 },
  ];
  const moteMarkup = skyMotes
    .map((m) => {
      const p = cloudDrift(m.bx, m.by, m.ax, m.ay, m.phase);
      const op = (0.55 + 0.3 * Math.sin(tau + m.phase)).toFixed(2);
      return `<circle cx="${p.x}" cy="${p.y}" r="${m.r}" fill="#FFF6D2" opacity="${op}"/>`;
    })
    .join('\n    ');

  // 3. Natural human celebratory silhouette standing on cliff summit (x=695, feet anchored at y=224)
  const armSway = Math.sin(tau) * 1.4;
  const breathY = Number((Math.sin(tau) * 0.65).toFixed(2));
  const lHandX = (669 + armSway).toFixed(1);
  const lHandY = (146 - armSway * 0.7).toFixed(1);
  const lElbowX = (678 + armSway * 0.4).toFixed(1);
  const lElbowY = (161 - armSway * 0.3).toFixed(1);
  const rHandX = (722 - armSway).toFixed(1);
  const rHandY = (144 + armSway * 0.7).toFixed(1);
  const rElbowX = (713 - armSway * 0.4).toFixed(1);
  const rElbowY = (160 + armSway * 0.3).toFixed(1);

  const cliffGuyMarkup = `<g transform="translate(0, ${breathY})">
    <!-- Left & Right Victory Arms (suit sleeves tapering to hands) -->
    <path d="M 687 172 L ${lElbowX} ${lElbowY} L ${lHandX} ${lHandY}" fill="none" stroke="#18233C" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lHandX}" cy="${lHandY}" r="2.2" fill="#18233C"/>
    <path d="M 703 172 L ${rElbowX} ${rElbowY} L ${rHandX} ${rHandY}" fill="none" stroke="#18233C" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${rHandX}" cy="${rHandY}" r="2.2" fill="#18233C"/>
    <!-- Trousers / Legs tapering naturally down to cliff edge (y=224) -->
    <path d="M 689 194 L 685 224 L 689 224 L 694 200 L 697 200 L 703 224 L 707 224 L 702 194 Z" fill="#151F35"/>
    <!-- Tailored Suit Jacket Torso & Shoulders + Connected Neck/Head -->
    <path d="M 686 171 Q 695 167 704 171 L 702 196 Q 695 198 688 196 Z" fill="#18233C"/>
    <rect x="693" y="164" width="4.4" height="7" rx="1.5" fill="#18233C"/>
    <ellipse cx="695.2" cy="160.5" rx="4.4" ry="5.1" fill="#18233C"/>
    <!-- Warm sunrise rim light along left side facing the sun -->
    <path d="M 686.5 172 L ${lElbowX} ${lElbowY} L ${lHandX} ${lHandY}" fill="none" stroke="rgba(255,222,148,0.55)" stroke-width="1.0" stroke-linecap="round"/>
    <path d="M 688.5 196 L 685 223" fill="none" stroke="rgba(255,222,148,0.45)" stroke-width="1.0" stroke-linecap="round"/>
  </g>`;

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${cloudMarkup}
    ${moteMarkup}
    ${cliffGuyMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Generates a single watercolor botanical sage/forest leaf vector shape with central midrib vein.
 */
const buildBotanicalSageLeafMarkup = (
  x: number,
  y: number,
  rotDeg: number,
  scaleX: number,
  scaleY: number,
  gradId: string = 'sageLeafDeep',
  veinColor: string = '#E3F0D6',
  opacity: number = 0.92,
): string => {
  return `<g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${rotDeg.toFixed(1)}) scale(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})" opacity="${opacity.toFixed(2)}">
    <path d="M 0 0 C 8 -14, 24 -16, 38 -2 C 24 14, 8 14, 0 0 Z" fill="url(#${gradId})"/>
    <path d="M 1 0 Q 17 -3, 35 -2" fill="none" stroke="${veinColor}" stroke-width="0.9" stroke-linecap="round" opacity="0.72"/>
  </g>`;
};

/**
 * Builds the static soft sage-green & mint-ivory watercolor botanical backdrop with corner stems
 * and delicate inner frame hairline for Template 6 (`anniversary-bg6.gif`).
 */
const buildBotanicalGreenBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sagePaperGlow" cx="50%" cy="48%" r="65%">
        <stop offset="0%" stop-color="#FCFDF9"/>
        <stop offset="56%" stop-color="#F2F8EC"/>
        <stop offset="100%" stop-color="#DFECD4"/>
      </radialGradient>
      <radialGradient id="sageWashCorner" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(164, 198, 140, 0.34)"/>
        <stop offset="65%" stop-color="rgba(188, 218, 166, 0.16)"/>
        <stop offset="100%" stop-color="rgba(188, 218, 166, 0)"/>
      </radialGradient>
      <linearGradient id="sageLeafDeep" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#76A364"/>
        <stop offset="55%" stop-color="#4A7A42"/>
        <stop offset="100%" stop-color="#2E5629"/>
      </linearGradient>
      <linearGradient id="sageLeafSoft" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#CBE2B4"/>
        <stop offset="58%" stop-color="#8EB878"/>
        <stop offset="100%" stop-color="#618E52"/>
      </linearGradient>
      <linearGradient id="sageLeafPale" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E2F0D3"/>
        <stop offset="65%" stop-color="#AED097"/>
        <stop offset="100%" stop-color="#7EA96B"/>
      </linearGradient>
    </defs>

    <!-- Soft botanical cream & pale sage watercolor background -->
    <rect width="${width}" height="${height}" fill="url(#sagePaperGlow)"/>

    <!-- Translucent corner watercolor sage washes (clear of central hero/body zone) -->
    <ellipse cx="42" cy="70" rx="145" ry="125" fill="url(#sageWashCorner)"/>
    <ellipse cx="705" cy="56" rx="155" ry="120" fill="url(#sageWashCorner)"/>
    <ellipse cx="64" cy="404" rx="150" ry="118" fill="url(#sageWashCorner)"/>
    <ellipse cx="702" cy="408" rx="158" ry="120" fill="url(#sageWashCorner)"/>

    <!-- Delicate inner sage border frame matching reference layout -->
    <rect x="12" y="10" width="${width - 24}" height="${height - 20}" rx="4" fill="none" stroke="rgba(138, 174, 118, 0.35)" stroke-width="1.2"/>

    <!-- Subtle background blurred corner leaves for watercolor depth -->
    ${buildBotanicalSageLeafMarkup(24, 94, 48, 1.35, 1.15, 'sageLeafPale', '#EFF7E6', 0.45)}
    ${buildBotanicalSageLeafMarkup(46, 152, 18, 1.2, 1.05, 'sageLeafPale', '#EFF7E6', 0.4)}
    ${buildBotanicalSageLeafMarkup(674, 34, 145, 1.3, 1.1, 'sageLeafPale', '#EFF7E6', 0.48)}
    ${buildBotanicalSageLeafMarkup(730, 82, 115, 1.25, 1.1, 'sageLeafPale', '#EFF7E6', 0.42)}
    ${buildBotanicalSageLeafMarkup(42, 346, -42, 1.35, 1.15, 'sageLeafPale', '#EFF7E6', 0.46)}
    ${buildBotanicalSageLeafMarkup(94, 428, -16, 1.25, 1.05, 'sageLeafPale', '#EFF7E6', 0.42)}
    ${buildBotanicalSageLeafMarkup(684, 396, -138, 1.35, 1.15, 'sageLeafPale', '#EFF7E6', 0.45)}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the gently swaying botanical corner leaf branches and slowly drifting floating leaves
 * for Template 6 (`anniversary-bg6.gif`) across normalized time t ∈ [0, 1).
 */
const buildBotanicalGreenFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Gently swaying corner leafy branches (anchored at corners, kept strictly clear of badge, portrait & center text)
  const tlAngle = swayAngle(1.6, tau, 0.2);
  const topLeftBranch = `<g transform="translate(0, 74) rotate(${tlAngle})">
    <path d="M 0 0 Q 26 52, 14 136" fill="none" stroke="#4D7744" stroke-width="2.0" stroke-linecap="round"/>
    ${buildBotanicalSageLeafMarkup(4, 12, 24, 1.18, 1.05, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(18, 42, -16, 1.05, 0.96, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(16, 78, 36, 1.15, 1.0, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(20, 108, 62, 0.95, 0.88, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(14, 134, 88, 0.88, 0.82, 'sageLeafPale')}
  </g>`;

  const trAngle = swayAngle(1.8, tau, 1.7);
  const topRightBranch = `<g transform="translate(${width}, 0) rotate(${trAngle})">
    <path d="M 0 0 Q -48 42, -122 128" fill="none" stroke="#4D7744" stroke-width="2.1" stroke-linecap="round"/>
    <path d="M -38 30 Q -26 68, -44 108" fill="none" stroke="#5E8B52" stroke-width="1.5" stroke-linecap="round"/>
    ${buildBotanicalSageLeafMarkup(-24, 14, 148, 1.15, 1.05, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(-56, 36, 172, 1.05, 0.95, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(-76, 62, 124, 1.2, 1.05, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(-98, 92, 165, 1.0, 0.9, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(-118, 122, 140, 0.88, 0.82, 'sageLeafPale')}
    ${buildBotanicalSageLeafMarkup(-36, 66, 98, 1.05, 0.92, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(-42, 98, 126, 0.92, 0.84, 'sageLeafDeep')}
  </g>`;

  const blAngle = swayAngle(1.7, tau, 3.1);
  const bottomLeftBranch = `<g transform="translate(0, ${height}) rotate(${blAngle})">
    <path d="M 0 0 Q 34 -68, 72 -154" fill="none" stroke="#4D7744" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M 28 -44 Q 68 -36, 108 -54" fill="none" stroke="#5E8B52" stroke-width="1.5" stroke-linecap="round"/>
    ${buildBotanicalSageLeafMarkup(12, -26, -54, 1.25, 1.08, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(28, -68, -82, 1.12, 0.98, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(46, -104, -44, 1.18, 1.02, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(66, -142, -72, 0.95, 0.86, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(46, -42, -16, 1.08, 0.95, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(80, -48, -32, 0.98, 0.88, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(104, -52, -12, 0.85, 0.78, 'sageLeafPale')}
  </g>`;

  const brAngle = swayAngle(1.6, tau, 4.6);
  const bottomRightBranch = `<g transform="translate(${width}, ${height}) rotate(${brAngle})">
    <path d="M 0 0 Q -40 -58, -68 -144" fill="none" stroke="#4D7744" stroke-width="2.1" stroke-linecap="round"/>
    <path d="M -32 -38 Q -74 -26, -118 -38" fill="none" stroke="#5E8B52" stroke-width="1.5" stroke-linecap="round"/>
    ${buildBotanicalSageLeafMarkup(-16, -24, -126, 1.25, 1.08, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(-34, -64, -102, 1.1, 0.98, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(-52, -102, -138, 1.15, 1.0, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(-66, -136, -116, 0.92, 0.84, 'sageLeafPale')}
    ${buildBotanicalSageLeafMarkup(-54, -34, -162, 1.05, 0.94, 'sageLeafSoft')}
    ${buildBotanicalSageLeafMarkup(-86, -34, -144, 0.96, 0.86, 'sageLeafDeep')}
    ${buildBotanicalSageLeafMarkup(-114, -36, -172, 0.84, 0.78, 'sageLeafPale')}
  </g>`;

  // 2. Small detached botanical leaves floating slowly in outer open margins
  const floatingLeaves: Array<{
    bx: number;
    by: number;
    ax: number;
    ay: number;
    phase: number;
    baseRot: number;
    rotAmp: number;
    scale: number;
    grad: string;
  }> = [
    { bx: 52, by: 234, ax: 2.8, ay: 4.0, phase: 0.4, baseRot: -28, rotAmp: 8, scale: 0.68, grad: 'sageLeafSoft' },
    { bx: 244, by: 54, ax: 3.0, ay: 3.6, phase: 1.5, baseRot: 22, rotAmp: 7, scale: 0.62, grad: 'sageLeafDeep' },
    { bx: 598, by: 48, ax: 2.8, ay: 3.8, phase: 2.6, baseRot: 146, rotAmp: 8, scale: 0.64, grad: 'sageLeafSoft' },
    { bx: 694, by: 196, ax: 2.6, ay: 4.2, phase: 3.7, baseRot: 118, rotAmp: 7, scale: 0.7, grad: 'sageLeafDeep' },
    { bx: 714, by: 256, ax: 2.4, ay: 3.6, phase: 4.9, baseRot: 158, rotAmp: 6, scale: 0.56, grad: 'sageLeafPale' },
    { bx: 108, by: 312, ax: 2.8, ay: 3.8, phase: 5.5, baseRot: -48, rotAmp: 7, scale: 0.58, grad: 'sageLeafSoft' },
    { bx: 152, by: 416, ax: 2.6, ay: 3.4, phase: 1.1, baseRot: -18, rotAmp: 6, scale: 0.62, grad: 'sageLeafDeep' },
    { bx: 602, by: 418, ax: 2.6, ay: 3.4, phase: 3.2, baseRot: -152, rotAmp: 7, scale: 0.6, grad: 'sageLeafSoft' },
  ];

  const floatingLeavesMarkup = floatingLeaves
    .map((l) => {
      const p = slowFloat(l.bx, l.by, l.ax, l.ay, tau, l.phase);
      const rot = l.baseRot + Math.sin(tau + l.phase) * l.rotAmp;
      return buildBotanicalSageLeafMarkup(p.x, p.y, rot, l.scale, l.scale * 0.92, l.grad, '#EDF6E4', 0.88);
    })
    .join('\n  ');

  // 3. Soft mint-cream dewdrop bokeh motes pulsing calmly
  const dewDrops = [
    { bx: 268, by: 92, r: 2.4, phase: 0.6 },
    { bx: 616, by: 128, r: 2.8, phase: 2.0 },
    { bx: 668, by: 274, r: 2.4, phase: 3.5 },
    { bx: 78, by: 278, r: 2.5, phase: 4.8 },
    { bx: 312, by: 424, r: 2.2, phase: 1.4 },
    { bx: 458, by: 422, r: 2.2, phase: 3.9 },
  ];
  const dewMarkup = dewDrops
    .map((d) => {
      const p = slowFloat(d.bx, d.by, 1.8, 2.4, tau, d.phase);
      const op = (0.45 + 0.35 * Math.sin(tau + d.phase)).toFixed(2);
      return `<circle cx="${p.x}" cy="${p.y}" r="${d.r}" fill="#8EB878" opacity="${op}"/>`;
    })
    .join('\n  ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sageLeafDeep" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#76A364"/>
        <stop offset="55%" stop-color="#4A7A42"/>
        <stop offset="100%" stop-color="#2E5629"/>
      </linearGradient>
      <linearGradient id="sageLeafSoft" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#CBE2B4"/>
        <stop offset="58%" stop-color="#8EB878"/>
        <stop offset="100%" stop-color="#618E52"/>
      </linearGradient>
      <linearGradient id="sageLeafPale" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E2F0D3"/>
        <stop offset="65%" stop-color="#AED097"/>
        <stop offset="100%" stop-color="#7EA96B"/>
      </linearGradient>
    </defs>

    ${topLeftBranch}
    ${topRightBranch}
    ${bottomLeftBranch}
    ${bottomRightBranch}
    ${floatingLeavesMarkup}
    ${dewMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Renders a curled serpentine party streamer ribbon centered at (cx, cy)
 * with dimensional bevel/highlight shading so it reads like a festive foil/crepe curl.
 */
const buildCurledStreamerMarkup = (
  cx: number,
  cy: number,
  rotDeg: number,
  scale: number,
  strokeColor: string,
  highlightColor: string,
  variant: 'sCurl' | 'loopCurl' = 'sCurl',
): string => {
  const pathData =
    variant === 'loopCurl'
      ? 'M -24 -18 C -4 -26, 6 -4, -10 2 C -22 6, -18 -14, 0 -8 C 20 -2, 16 20, -4 26'
      : 'M -18 -24 C 8 -20, 14 -2, -6 4 C -20 8, -14 24, 14 22';
  return `<g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${rotDeg.toFixed(1)}) scale(${scale.toFixed(2)})">
    <path d="${pathData}" fill="none" stroke="rgba(25,35,55,0.12)" stroke-width="7.2" stroke-linecap="round" transform="translate(1.2, 1.8)"/>
    <path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="6.4" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="${highlightColor}" stroke-width="2.1" stroke-linecap="round" opacity="0.72"/>
  </g>`;
};

/**
 * Renders a flat or outlined festive 5-point star centered at (cx, cy) reusing `getFivePointStarVertices`.
 */
const buildPartyStarMarkup = (
  cx: number,
  cy: number,
  outerR: number,
  rotDeg: number,
  fill: string,
  stroke: string = 'none',
  strokeWidth: number = 0,
  opacity: number = 0.94,
): string => {
  const pts = getFivePointStarVertices(cx, cy, outerR, outerR * 0.44, rotDeg);
  const pointsAttr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return `<polygon points="${pointsAttr}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" opacity="${opacity.toFixed(2)}"/>`;
};

/**
 * Builds the static crisp celebratory party-blast paper backdrop for Template 7 (`anniversary-bg7.gif`):
 * bright pearl-white center with soft atmospheric aqua/warm-cream corner washes.
 */
const buildPartyBlastBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="partyPaperBase" cx="50%" cy="48%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="72%" stop-color="#FCFDFE"/>
        <stop offset="100%" stop-color="#F6F8FA"/>
      </radialGradient>
    </defs>

    <!-- Crisp bright celebratory backdrop matching reference with zero GIF banding -->
    <rect width="${width}" height="${height}" fill="url(#partyPaperBase)"/>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the slowly floating curled party streamers, golden/coral stars, and colorful confetti bursts
 * for Template 7 (`anniversary-bg7.gif`) across normalized time t ∈ [0, 1).
 */
const buildPartyBlastFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Slowly floating curled serpentine party streamers (kept clear of top-left pill, circular portrait, and central copy)
  const streamers: Array<{
    bx: number;
    by: number;
    ax: number;
    ay: number;
    rot: number;
    rotAmp: number;
    scale: number;
    color: string;
    hi: string;
    variant: 'sCurl' | 'loopCurl';
    phase: number;
  }> = [
    { bx: 214, by: 40, ax: 2.8, ay: 3.8, rot: 14, rotAmp: 5, scale: 0.92, color: '#1F9E9A', hi: '#7FE0DC', variant: 'loopCurl', phase: 0.3 },
    { bx: 656, by: 54, ax: 3.4, ay: 4.5, rot: -18, rotAmp: 5.5, scale: 1.08, color: '#F05036', hi: '#FFA696', variant: 'loopCurl', phase: 1.4 },
    { bx: 696, by: 204, ax: 3.2, ay: 4.8, rot: 22, rotAmp: 5, scale: 1.02, color: '#1F9E9A', hi: '#82E3DF', variant: 'loopCurl', phase: 2.6 },
    { bx: 36, by: 288, ax: 2.6, ay: 4.2, rot: -12, rotAmp: 4.5, scale: 0.96, color: '#F5B623', hi: '#FFE58F', variant: 'sCurl', phase: 3.8 },
    { bx: 58, by: 368, ax: 3.0, ay: 4.4, rot: 24, rotAmp: 5, scale: 1.02, color: '#F05036', hi: '#FFA696', variant: 'sCurl', phase: 4.9 },
    { bx: 706, by: 314, ax: 2.8, ay: 4.0, rot: -26, rotAmp: 4.5, scale: 0.88, color: '#F5B623', hi: '#FFE58F', variant: 'sCurl', phase: 5.7 },
  ];

  const streamerMarkup = streamers
    .map((s) => {
      const p = slowFloat(s.bx, s.by, s.ax, s.ay, tau, s.phase);
      const rot = s.rot + Math.sin(tau + s.phase) * s.rotAmp;
      return buildCurledStreamerMarkup(p.x, p.y, rot, s.scale, s.color, s.hi, s.variant);
    })
    .join('\n    ');

  // 2. Festive golden & coral-orange stars gently bobbing & rocking slowly
  const stars: Array<{
    bx: number;
    by: number;
    r: number;
    rot: number;
    fill: string;
    stroke?: string;
    strokeW?: number;
    phase: number;
  }> = [
    { bx: 282, by: 36, r: 9.5, rot: 12, fill: '#F6BE2E', phase: 0.5 },
    { bx: 616, by: 132, r: 12.5, rot: 8, fill: '#F6BE2E', phase: 1.7 },
    { bx: 716, by: 256, r: 8.5, rot: -14, fill: '#F6BE2E', phase: 2.9 },
    { bx: 660, by: 374, r: 11.5, rot: 15, fill: 'none', stroke: '#F5B623', strokeW: 2.6, phase: 4.1 },
    { bx: 696, by: 414, r: 13.0, rot: -8, fill: '#EF4E34', phase: 5.0 },
    { bx: 44, by: 112, r: 7.5, rot: 18, fill: '#F6BE2E', phase: 2.2 },
    { bx: 54, by: 418, r: 10.5, rot: -12, fill: '#F6BE2E', phase: 3.4 },
    { bx: 142, by: 422, r: 7.5, rot: 10, fill: '#F6BE2E', phase: 1.0 },
  ];

  const starMarkup = stars
    .map((st) => {
      const p = slowFloat(st.bx, st.by, 2.2, 3.4, tau, st.phase);
      const rot = st.rot + Math.sin(tau + st.phase) * 5;
      const op = 0.84 + 0.14 * Math.sin(tau + st.phase);
      return buildPartyStarMarkup(
        p.x,
        p.y,
        st.r,
        rot,
        st.fill,
        st.stroke || 'none',
        st.strokeW || 0,
        op,
      );
    })
    .join('\n    ');

  // 3. Colorful confetti pops & micro sparkle diamonds drifting calmly around edges
  const confettiSpecs: Array<{
    bx: number;
    by: number;
    r: number;
    color: string;
    shape: 'dot' | 'diamond';
    phase: number;
  }> = [
    { bx: 248, by: 22, r: 3.6, color: '#F05036', shape: 'dot', phase: 0.4 },
    { bx: 318, by: 64, r: 3.2, color: '#2F8F5B', shape: 'dot', phase: 1.2 },
    { bx: 562, by: 26, r: 4.0, color: '#F05036', shape: 'diamond', phase: 2.1 },
    { bx: 598, by: 54, r: 3.2, color: '#F5B623', shape: 'dot', phase: 3.0 },
    { bx: 618, by: 82, r: 3.5, color: '#2F8F5B', shape: 'dot', phase: 3.9 },
    { bx: 722, by: 74, r: 3.4, color: '#1F9E9A', shape: 'dot', phase: 4.7 },
    { bx: 726, by: 148, r: 3.6, color: '#F5B623', shape: 'diamond', phase: 5.5 },
    { bx: 632, by: 214, r: 3.0, color: '#F5B623', shape: 'dot', phase: 0.9 },
    { bx: 726, by: 306, r: 3.2, color: '#2F8F5B', shape: 'dot', phase: 1.8 },
    { bx: 622, by: 422, r: 3.6, color: '#F05036', shape: 'dot', phase: 2.7 },
    { bx: 548, by: 426, r: 3.2, color: '#1F9E9A', shape: 'diamond', phase: 3.5 },
    { bx: 374, by: 432, r: 3.4, color: '#2F8F5B', shape: 'dot', phase: 4.4 },
    { bx: 218, by: 428, r: 3.2, color: '#F5B623', shape: 'dot', phase: 5.2 },
    { bx: 94, by: 432, r: 3.5, color: '#1F9E9A', shape: 'dot', phase: 0.7 },
    { bx: 24, by: 212, r: 3.4, color: '#2F8F5B', shape: 'dot', phase: 1.6 },
    { bx: 28, by: 332, r: 3.6, color: '#F5B623', shape: 'diamond', phase: 2.5 },
  ];

  const confettiMarkup = confettiSpecs
    .map((c) => {
      const p = slowFloat(c.bx, c.by, 2.0, 2.8, tau, c.phase);
      const op = (0.76 + 0.2 * Math.sin(tau + c.phase)).toFixed(2);
      if (c.shape === 'diamond') {
        const rot = (Math.sin(tau + c.phase) * 14).toFixed(1);
        const s = (c.r * 1.45).toFixed(1);
        return `<rect x="${(-Number(s) / 2).toFixed(1)}" y="${(-Number(s) / 2).toFixed(1)}" width="${s}" height="${s}" rx="0.8" transform="translate(${p.x}, ${p.y}) rotate(${Number(45) + Number(rot)})" fill="${c.color}" opacity="${op}"/>`;
      }
      return `<circle cx="${p.x}" cy="${p.y}" r="${c.r}" fill="${c.color}" opacity="${op}"/>`;
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${streamerMarkup}
    ${starMarkup}
    ${confettiMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Renders a luxury metallic gold wrapped gift box with deep satin ribbon and sculpted top bow
 * for Template 8 (`anniversary-bg8.gif`) lower corners.
 */
const buildGoldGiftBoxMarkup = (
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  ribbonColor: string = '#4A1878',
): string => {
  const lidH = Math.max(10, Math.round(boxH * 0.22));
  const lidOverhang = 4;
  const cx = x + boxW / 2;
  const ribbonW = Math.max(8, Math.round(boxW * 0.18));
  return `<g>
    <!-- Soft ambient ground shadow -->
    <ellipse cx="${cx}" cy="${y + boxH + 2}" rx="${(boxW * 0.56).toFixed(1)}" ry="5" fill="rgba(10,2,25,0.45)"/>
    <!-- Box body -->
    <rect x="${x}" y="${y + lidH}" width="${boxW}" height="${boxH - lidH}" rx="2.5" fill="url(#giftGoldBody)" stroke="#B67C16" stroke-width="0.9"/>
    <!-- Right side subtle darker gold shading facet -->
    <rect x="${(x + boxW * 0.62).toFixed(1)}" y="${y + lidH}" width="${(boxW * 0.38).toFixed(1)}" height="${boxH - lidH}" rx="2" fill="rgba(120,76,8,0.24)"/>
    <!-- Vertical satin ribbon on body -->
    <rect x="${(cx - ribbonW / 2).toFixed(1)}" y="${y + lidH}" width="${ribbonW}" height="${boxH - lidH}" fill="${ribbonColor}"/>
    <!-- Lid -->
    <rect x="${x - lidOverhang}" y="${y}" width="${boxW + lidOverhang * 2}" height="${lidH}" rx="2.5" fill="url(#giftGoldLid)" stroke="#C6891B" stroke-width="0.9"/>
    <!-- Vertical ribbon across lid -->
    <rect x="${(cx - ribbonW / 2).toFixed(1)}" y="${y}" width="${ribbonW}" height="${lidH}" fill="${ribbonColor}"/>
    <!-- Sculpted metallic gold & satin bow loops above lid -->
    <path d="M ${cx} ${y + 1} C ${cx - 18} ${y - 16}, ${cx - 26} ${y - 2}, ${cx - 4} ${y + 1} Z" fill="url(#giftGoldLid)" stroke="#A86E10" stroke-width="0.8"/>
    <path d="M ${cx} ${y + 1} C ${cx + 18} ${y - 16}, ${cx + 26} ${y - 2}, ${cx + 4} ${y + 1} Z" fill="url(#giftGoldLid)" stroke="#A86E10" stroke-width="0.8"/>
    <circle cx="${cx}" cy="${y}" r="4.2" fill="#FFF0A8" stroke="#A86E10" stroke-width="0.8"/>
  </g>`;
};

/**
 * Renders a 3D glossy floating party balloon with tied neck, curved string, and optional golden confetti flecks.
 */
const buildFestiveBalloonMarkup = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotDeg: number,
  gradId: string,
  knotColor: string,
  stringEndDx: number,
  stringLen: number,
  hasConfettiFlecks: boolean = false,
  stringColor: string = 'rgba(246, 224, 168, 0.58)',
  rimStroke?: string,
): string => {
  const stringPath = `M 0 ${ry + 4} Q ${stringEndDx} ${ry + Math.round(stringLen * 0.45)}, ${Math.round(stringEndDx * -0.6)} ${ry + Math.round(stringLen * 0.78)} T ${Math.round(stringEndDx * 0.4)} ${ry + stringLen}`;
  const flecks = hasConfettiFlecks
    ? `<circle cx="${(-rx * 0.35).toFixed(1)}" cy="${(-ry * 0.1).toFixed(1)}" r="2.2" fill="#FFD96B" opacity="0.88"/>
      <circle cx="${(rx * 0.38).toFixed(1)}" cy="${(ry * 0.18).toFixed(1)}" r="2.6" fill="#F8C84A" opacity="0.85"/>
      <rect x="${(rx * 0.1).toFixed(1)}" y="${(-ry * 0.42).toFixed(1)}" width="3.8" height="3.8" transform="rotate(28)" fill="#FFE793" opacity="0.84"/>
      <circle cx="${(-rx * 0.12).toFixed(1)}" cy="${(ry * 0.42).toFixed(1)}" r="2.0" fill="#FFD96B" opacity="0.82"/>`
    : '';
  const rimAttr = rimStroke ? ` stroke="${rimStroke}" stroke-width="0.9"` : '';
  return `<g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${rotDeg.toFixed(1)})">
    <path d="${stringPath}" fill="none" stroke="${stringColor}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M -2.5 ${ry - 1} L 2.5 ${ry - 1} L 4.5 ${ry + 4.5} L -4.5 ${ry + 4.5} Z" fill="${knotColor}"/>
    <ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="url(#${gradId})"${rimAttr}/>
    ${flecks}
    <ellipse cx="${(-rx * 0.32).toFixed(1)}" cy="${(-ry * 0.34).toFixed(1)}" rx="${(rx * 0.25).toFixed(1)}" ry="${(ry * 0.36).toFixed(1)}" transform="rotate(-18 ${(-rx * 0.32).toFixed(1)} ${(-ry * 0.34).toFixed(1)})" fill="rgba(255,255,255,0.48)"/>
  </g>`;
};

/**
 * Builds the static deep royal purple starry sky & metallic gold gift-box corners backdrop
 * for Template 8 (`anniversary-bg8.gif`).
 */
const buildRoyalPurpleBalloonsBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const staticBokehSpecs = [
    { x: 186, y: 82, r: 14, op: 0.18 },
    { x: 562, y: 64, r: 16, op: 0.2 },
    { x: 650, y: 152, r: 18, op: 0.16 },
    { x: 702, y: 312, r: 15, op: 0.18 },
    { x: 84, y: 316, r: 16, op: 0.16 },
    { x: 604, y: 322, r: 14, op: 0.15 },
    { x: 244, y: 406, r: 12, op: 0.14 },
    { x: 512, y: 404, r: 14, op: 0.14 },
  ];
  const staticBokehMarkup = staticBokehSpecs
    .map(
      (b) =>
        `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#F6C85A" opacity="${b.op}" filter="url(#purpleStarBlur)"/>`,
    )
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="royalPurpleSky" cx="50%" cy="46%" r="72%">
        <stop offset="0%" stop-color="#321163"/>
        <stop offset="55%" stop-color="#250A4C"/>
        <stop offset="100%" stop-color="#170435"/>
      </radialGradient>
      <radialGradient id="giftCornerWarmGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(248, 200, 88, 0.16)"/>
        <stop offset="100%" stop-color="rgba(248, 200, 88, 0)"/>
      </radialGradient>
      <linearGradient id="giftGoldBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FCE188"/>
        <stop offset="48%" stop-color="#DDA230"/>
        <stop offset="100%" stop-color="#9A640E"/>
      </linearGradient>
      <linearGradient id="giftGoldLid" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FFF0AC"/>
        <stop offset="50%" stop-color="#ECC052"/>
        <stop offset="100%" stop-color="#B87E18"/>
      </linearGradient>
      <filter id="purpleStarBlur" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="5"/>
      </filter>
    </defs>

    <!-- Rich velvety royal indigo-purple night sky backdrop -->
    <rect width="${width}" height="${height}" fill="url(#royalPurpleSky)"/>

    <!-- Subtle warm celestial glow behind bottom corner gifts -->
    <ellipse cx="66" cy="422" rx="135" ry="78" fill="url(#giftCornerWarmGlow)"/>
    <ellipse cx="684" cy="420" rx="140" ry="82" fill="url(#giftCornerWarmGlow)"/>

    ${staticBokehMarkup}

    <!-- Luxury Gold Gift Boxes in bottom-left & bottom-right corners -->
    ${buildGoldGiftBoxMarkup(12, 366, 62, 84, '#4B167A')}
    ${buildGoldGiftBoxMarkup(78, 398, 44, 52, '#5F1F92')}
    ${buildGoldGiftBoxMarkup(622, 398, 44, 52, '#5F1F92')}
    ${buildGoldGiftBoxMarkup(672, 362, 66, 88, '#4B167A')}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds slowly floating gold & confetti-spotted royal-purple balloons and softly twinkling gold stars
 * for Template 8 (`anniversary-bg8.gif`) across normalized time t ∈ [0, 1).
 */
const buildRoyalPurpleBalloonsFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Slowly floating balloons placed cleanly around portrait, logo & text
  const lb = slowFloat(40, 294, 2.4, 4.4, tau, 0.5); // Bottom-left metallic gold balloon
  const ulb = slowFloat(266, 52, 2.2, 3.8, tau, 1.9); // Upper center-left confetti-spotted purple balloon
  const rb1 = slowFloat(694, 88, 2.8, 4.8, tau, 3.1); // Top-right confetti-spotted lavender-purple balloon
  const rb2 = slowFloat(714, 214, 2.6, 4.6, tau, 4.7); // Mid-right metallic gold balloon

  const balloonsMarkup = [
    buildFestiveBalloonMarkup(lb.x, lb.y, 23, 29, -5 + Math.sin(tau + 0.5) * 2.5, 't8GoldBalloon', '#A36D12', -8, 62, false),
    buildFestiveBalloonMarkup(ulb.x, ulb.y, 21, 27, 6 + Math.sin(tau + 1.9) * 2.2, 't8PurpleBalloon', '#5B4594', 7, 52, true),
    buildFestiveBalloonMarkup(rb1.x, rb1.y, 27, 34, 6 + Math.sin(tau + 3.1) * 2.5, 't8PurpleBalloon', '#5B4594', -10, 74, true),
    buildFestiveBalloonMarkup(rb2.x, rb2.y, 28, 35, -4 + Math.sin(tau + 4.7) * 2.5, 't8GoldBalloon', '#A36D12', 9, 82, false),
  ].join('\n    ');

  // 2. Glowing golden 5-point stars floating & rocking slowly (reusing getFivePointStarVertices)
  const stars = [
    { bx: 204, by: 46, r: 8.5, rot: 12, phase: 0.4 },
    { bx: 616, by: 36, r: 10.5, rot: -8, phase: 1.5 },
    { bx: 618, by: 146, r: 8.0, rot: 18, phase: 2.6 },
    { bx: 726, by: 312, r: 7.5, rot: -14, phase: 3.7 },
    { bx: 36, by: 162, r: 8.0, rot: 10, phase: 4.8 },
    { bx: 158, by: 416, r: 9.0, rot: -12, phase: 2.1 },
    { bx: 586, by: 418, r: 9.0, rot: 14, phase: 5.3 },
  ];

  const starMarkup = stars
    .map((st) => {
      const p = slowFloat(st.bx, st.by, 1.8, 2.8, tau, st.phase);
      const rot = st.rot + Math.sin(tau + st.phase) * 5;
      const pts = getFivePointStarVertices(p.x, p.y, st.r, st.r * 0.42, rot)
        .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
        .join(' ');
      const op = (0.76 + 0.22 * Math.sin(tau + st.phase)).toFixed(2);
      return `<polygon points="${pts}" fill="url(#t8StarGold)" opacity="${op}"/>`;
    })
    .join('\n    ');

  // 3. Softly twinkling 4-point starlight sparkles & tiny gold dust motes
  const dustSpecs = [
    { bx: 316, by: 26, r: 5.5, phase: 0.7 },
    { bx: 588, by: 78, r: 6.2, phase: 1.9 },
    { bx: 652, by: 182, r: 5.8, phase: 3.1 },
    { bx: 642, by: 284, r: 6.4, phase: 4.2 },
    { bx: 24, by: 224, r: 5.5, phase: 2.4 },
    { bx: 108, by: 342, r: 5.2, phase: 5.0 },
    { bx: 304, by: 424, r: 5.0, phase: 1.2 },
    { bx: 472, by: 422, r: 5.0, phase: 3.8 },
  ];

  const dustMarkup = dustSpecs
    .map((d) => {
      const p = slowFloat(d.bx, d.by, 1.5, 2.2, tau, d.phase);
      const pulse = 0.72 + 0.28 * Math.sin(tau + d.phase);
      const s = Number((d.r * pulse).toFixed(2));
      const op = (0.58 + 0.36 * Math.sin(tau + d.phase)).toFixed(2);
      return `<path d="M ${p.x} ${p.y - s} Q ${p.x} ${p.y} ${p.x + s} ${p.y} Q ${p.x} ${p.y} ${p.x} ${p.y + s} Q ${p.x} ${p.y} ${p.x - s} ${p.y} Q ${p.x} ${p.y} ${p.x} ${p.y - s} Z" fill="#FFF4C2" opacity="${op}"/>`;
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="t8GoldBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#FFFBE4"/>
        <stop offset="24%" stop-color="#F7D572"/>
        <stop offset="65%" stop-color="#CF9424"/>
        <stop offset="94%" stop-color="#875709"/>
        <stop offset="100%" stop-color="#684104"/>
      </radialGradient>
      <radialGradient id="t8PurpleBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#EAE4FF"/>
        <stop offset="26%" stop-color="#9A8CE2"/>
        <stop offset="68%" stop-color="#5D4BA8"/>
        <stop offset="94%" stop-color="#372675"/>
        <stop offset="100%" stop-color="#271859"/>
      </radialGradient>
      <linearGradient id="t8StarGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF7CE"/>
        <stop offset="50%" stop-color="#F6C851"/>
        <stop offset="100%" stop-color="#C98D1C"/>
      </linearGradient>
    </defs>

    ${dustMarkup}
    ${starMarkup}
    ${balloonsMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Renders a layered 6-petal watercolor lavender blossom centered at (cx, cy)
 * with warm amber-gold stamen center.
 */
const buildWatercolorFlowerMarkup = (
  cx: number,
  cy: number,
  radius: number,
  rotDeg: number,
  petalGradId: string = 'floralPetalLilac',
  innerGradId: string = 'floralPetalSoft',
  opacity: number = 0.96,
): string => {
  const outerPetals: string[] = [];
  const innerPetals: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = rotDeg + i * 60;
    const pLen = radius;
    const pWid = radius * 0.44;
    outerPetals.push(
      `<path d="M 0 0 C ${(-pWid).toFixed(1)} ${(-pLen * 0.45).toFixed(1)}, ${(-pWid * 0.85).toFixed(1)} ${(-pLen).toFixed(1)}, 0 ${(-pLen).toFixed(1)} C ${(pWid * 0.85).toFixed(1)} ${(-pLen).toFixed(1)}, ${pWid.toFixed(1)} ${(-pLen * 0.45).toFixed(1)}, 0 0 Z" transform="rotate(${angle})" fill="url(#${petalGradId})" stroke="rgba(122,74,178,0.22)" stroke-width="0.7"/>`,
    );
    const sLen = radius * 0.66;
    const sWid = radius * 0.3;
    innerPetals.push(
      `<path d="M 0 0 C ${(-sWid).toFixed(1)} ${(-sLen * 0.45).toFixed(1)}, ${(-sWid * 0.75).toFixed(1)} ${(-sLen).toFixed(1)}, 0 ${(-sLen).toFixed(1)} C ${(sWid * 0.75).toFixed(1)} ${(-sLen).toFixed(1)}, ${sWid.toFixed(1)} ${(-sLen * 0.45).toFixed(1)}, 0 0 Z" transform="rotate(${angle + 30})" fill="url(#${innerGradId})" opacity="0.82"/>`,
    );
  }
  const coreR = Math.max(3.2, radius * 0.21);
  return `<g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)})" opacity="${opacity.toFixed(2)}">
    ${outerPetals.join('\n    ')}
    ${innerPetals.join('\n    ')}
    <circle cx="0" cy="0" r="${(coreR * 1.25).toFixed(1)}" fill="rgba(130, 82, 180, 0.32)"/>
    <circle cx="0" cy="0" r="${coreR.toFixed(1)}" fill="#F6C64A" stroke="#C88E1A" stroke-width="0.7"/>
    <circle cx="${(-coreR * 0.25).toFixed(1)}" cy="${(-coreR * 0.25).toFixed(1)}" r="${(coreR * 0.35).toFixed(1)}" fill="#FFF4B8"/>
  </g>`;
};

/**
 * Renders a small single drifting watercolor lavender petal centered at (cx, cy).
 */
const buildFloatingPetalMarkup = (
  cx: number,
  cy: number,
  rotDeg: number,
  scale: number,
  opacity: number = 0.85,
): string => {
  return `<g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${rotDeg.toFixed(1)}) scale(${scale.toFixed(2)})" opacity="${opacity.toFixed(2)}">
    <path d="M 0 -10 C 6 -7, 8 2, 0 10 C -8 2, -6 -7, 0 -10 Z" fill="url(#floralPetalLilac)" stroke="rgba(135,90,188,0.22)" stroke-width="0.6"/>
  </g>`;
};

/**
 * Builds the static soft blush-lavender watercolor backdrop with subtle corner washes
 * and delicate rose-gold geometric frame accents for Template 9 (`anniversary-bg9.gif`).
 */
const buildWatercolorFloralBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="lilacPaperGlow" cx="50%" cy="48%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="68%" stop-color="#FAF4FF"/>
        <stop offset="100%" stop-color="#EFE2FA"/>
      </radialGradient>
      <linearGradient id="floralLeafSlate" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#87AED8"/>
        <stop offset="55%" stop-color="#5882B6"/>
        <stop offset="100%" stop-color="#3C5E8C"/>
      </linearGradient>
      <linearGradient id="floralLeafTeal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#AED5C7"/>
        <stop offset="58%" stop-color="#76A897"/>
        <stop offset="100%" stop-color="#4D7E6E"/>
      </linearGradient>
      <radialGradient id="floralPetalSoft" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#FAF2FF"/>
        <stop offset="58%" stop-color="#DEC4FA"/>
        <stop offset="100%" stop-color="#B88EE8"/>
      </radialGradient>
      <radialGradient id="floralPetalLilac" cx="38%" cy="32%" r="72%">
        <stop offset="0%" stop-color="#F5E8FF"/>
        <stop offset="52%" stop-color="#C9A2F2"/>
        <stop offset="100%" stop-color="#9A68D4"/>
      </radialGradient>
    </defs>

    <!-- Luminous soft blush-lavender pastel watercolor surface -->
    <rect width="${width}" height="${height}" fill="url(#lilacPaperGlow)"/>

    <!-- Delicate rose-gold geometric corner hairlines matching floral reference -->
    <rect x="14" y="12" width="${width - 28}" height="${height - 24}" rx="4" fill="none" stroke="rgba(182, 134, 96, 0.55)" stroke-width="1.3"/>

    <!-- Soft faded watercolor leaves tucked under main clusters for painted depth -->
    ${buildBotanicalSageLeafMarkup(604, 24, 154, 1.32, 1.12, 'floralLeafSlate', '#EBF3FC', 0.36)}
    ${buildBotanicalSageLeafMarkup(656, 112, 128, 1.28, 1.08, 'floralLeafTeal', '#EDF7F3', 0.34)}
    ${buildBotanicalSageLeafMarkup(34, 344, -46, 1.32, 1.12, 'floralLeafSlate', '#EBF3FC', 0.36)}
    ${buildBotanicalSageLeafMarkup(104, 418, -16, 1.24, 1.05, 'floralLeafTeal', '#EDF7F3', 0.34)}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds gently swaying lavender floral corner bouquets and slowly floating detached blossoms & petals
 * for Template 9 (`anniversary-bg9.gif`) across normalized time t ∈ [0, 1).
 */
const buildWatercolorFloralFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Gently swaying corner & side floral clusters (strictly clear of top-left InvenTech logo, portrait, & copy)
  const trSway = swayAngle(1.8, tau, 0.4);
  const topRightBouquet = `<g transform="translate(${width}, 0) rotate(${trSway})">
    ${buildBotanicalSageLeafMarkup(-82, 14, 168, 1.18, 1.02, 'floralLeafSlate', '#E6EFFA', 0.9)}
    ${buildBotanicalSageLeafMarkup(-106, 46, 152, 1.12, 0.96, 'floralLeafSlate', '#E6EFFA', 0.88)}
    ${buildBotanicalSageLeafMarkup(-76, 86, 128, 1.22, 1.05, 'floralLeafTeal', '#E9F6F1', 0.92)}
    ${buildBotanicalSageLeafMarkup(-48, 128, 108, 1.12, 0.95, 'floralLeafTeal', '#E9F6F1', 0.9)}
    ${buildBotanicalSageLeafMarkup(-18, 178, 92, 0.95, 0.84, 'floralLeafSlate', '#E6EFFA', 0.86)}
    ${buildWatercolorFlowerMarkup(-58, 38, 32, 14, 'floralPetalLilac', 'floralPetalSoft')}
    ${buildWatercolorFlowerMarkup(-24, 96, 28, 38, 'floralPetalLilac', 'floralPetalSoft')}
    ${buildWatercolorFlowerMarkup(-32, 162, 17, -12, 'floralPetalSoft', 'floralPetalLilac')}
  </g>`;

  const blSway = swayAngle(1.7, tau, 2.2);
  const bottomLeftBouquet = `<g transform="translate(0, ${height}) rotate(${blSway})">
    ${buildBotanicalSageLeafMarkup(20, -108, -74, 1.16, 1.0, 'floralLeafSlate', '#E6EFFA', 0.9)}
    ${buildBotanicalSageLeafMarkup(54, -92, -48, 1.18, 1.02, 'floralLeafTeal', '#E9F6F1', 0.92)}
    ${buildBotanicalSageLeafMarkup(88, -62, -26, 1.14, 0.98, 'floralLeafSlate', '#E6EFFA', 0.88)}
    ${buildBotanicalSageLeafMarkup(122, -28, -10, 1.06, 0.92, 'floralLeafTeal', '#E9F6F1', 0.88)}
    ${buildWatercolorFlowerMarkup(48, -46, 31, 20, 'floralPetalLilac', 'floralPetalSoft')}
    ${buildWatercolorFlowerMarkup(22, -98, 18, -18, 'floralPetalSoft', 'floralPetalLilac')}
    ${buildWatercolorFlowerMarkup(106, -24, 17, 42, 'floralPetalLilac', 'floralPetalSoft')}
  </g>`;

  const leftSideSway = swayAngle(1.6, tau, 4.1);
  const leftEdgeSprig = `<g transform="translate(0, 268) rotate(${leftSideSway})">
    ${buildBotanicalSageLeafMarkup(10, -28, -44, 1.02, 0.9, 'floralLeafSlate', '#E6EFFA', 0.88)}
    ${buildBotanicalSageLeafMarkup(18, 22, 34, 0.98, 0.86, 'floralLeafTeal', '#E9F6F1', 0.88)}
    ${buildWatercolorFlowerMarkup(24, -2, 19, 10, 'floralPetalLilac', 'floralPetalSoft')}
  </g>`;

  // 2. Slowly floating lavender flowers & drifting petals across outer open margins
  const floatingFlowers = [
    { bx: 248, by: 46, r: 12, ax: 2.2, ay: 3.4, rot: 12, phase: 0.5 },
    { bx: 608, by: 58, r: 11, ax: 2.4, ay: 3.2, rot: -16, phase: 1.7 },
    { bx: 716, by: 254, r: 13, ax: 2.2, ay: 3.8, rot: 22, phase: 2.9 },
    { bx: 694, by: 376, r: 15, ax: 2.4, ay: 3.6, rot: -14, phase: 4.1 },
    { bx: 632, by: 418, r: 10.5, ax: 2.0, ay: 3.0, rot: 28, phase: 5.2 },
    { bx: 186, by: 418, r: 10.5, ax: 2.0, ay: 3.0, rot: -20, phase: 1.1 },
  ];

  const floatingFlowerMarkup = floatingFlowers
    .map((f) => {
      const p = slowFloat(f.bx, f.by, f.ax, f.ay, tau, f.phase);
      const rot = f.rot + Math.sin(tau + f.phase) * 7;
      return buildWatercolorFlowerMarkup(p.x, p.y, f.r, rot, 'floralPetalLilac', 'floralPetalSoft', 0.9);
    })
    .join('\n    ');

  const floatingPetals = [
    { bx: 204, by: 24, ax: 2.2, ay: 3.2, rot: -32, scale: 0.72, phase: 0.8 },
    { bx: 626, by: 168, ax: 2.0, ay: 3.0, rot: 46, scale: 0.68, phase: 2.0 },
    { bx: 692, by: 308, ax: 2.2, ay: 3.4, rot: -24, scale: 0.74, phase: 3.3 },
    { bx: 344, by: 426, ax: 1.8, ay: 2.8, rot: 54, scale: 0.66, phase: 4.5 },
    { bx: 474, by: 424, ax: 1.8, ay: 2.8, rot: -42, scale: 0.66, phase: 5.6 },
    { bx: 36, by: 132, ax: 1.8, ay: 2.8, rot: 28, scale: 0.64, phase: 1.4 },
  ];

  const floatingPetalMarkup = floatingPetals
    .map((pt) => {
      const p = slowFloat(pt.bx, pt.by, pt.ax, pt.ay, tau, pt.phase);
      const rot = pt.rot + Math.sin(tau + pt.phase) * 9;
      return buildFloatingPetalMarkup(p.x, p.y, rot, pt.scale, 0.84);
    })
    .join('\n    ');

  // 3. Tiny lavender & champagne-gold pollen motes drifting calmly
  const pollenDrops = [
    { bx: 292, by: 62, r: 2.4, color: '#9D6FD4', phase: 0.3 },
    { bx: 604, by: 118, r: 2.6, color: '#D4A238', phase: 1.6 },
    { bx: 668, by: 236, r: 2.4, color: '#9D6FD4', phase: 2.8 },
    { bx: 112, by: 326, r: 2.2, color: '#D4A238', phase: 3.9 },
    { bx: 554, by: 422, r: 2.4, color: '#9D6FD4', phase: 5.1 },
  ];

  const pollenMarkup = pollenDrops
    .map((m) => {
      const p = slowFloat(m.bx, m.by, 1.6, 2.2, tau, m.phase);
      const op = (0.48 + 0.32 * Math.sin(tau + m.phase)).toFixed(2);
      return `<circle cx="${p.x}" cy="${p.y}" r="${m.r}" fill="${m.color}" opacity="${op}"/>`;
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="floralLeafSlate" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#87AED8"/>
        <stop offset="55%" stop-color="#5882B6"/>
        <stop offset="100%" stop-color="#3C5E8C"/>
      </linearGradient>
      <linearGradient id="floralLeafTeal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#AED5C7"/>
        <stop offset="58%" stop-color="#76A897"/>
        <stop offset="100%" stop-color="#4D7E6E"/>
      </linearGradient>
      <radialGradient id="floralPetalSoft" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#FAF2FF"/>
        <stop offset="58%" stop-color="#DEC4FA"/>
        <stop offset="100%" stop-color="#B88EE8"/>
      </radialGradient>
      <radialGradient id="floralPetalLilac" cx="38%" cy="32%" r="72%">
        <stop offset="0%" stop-color="#F5E8FF"/>
        <stop offset="52%" stop-color="#C9A2F2"/>
        <stop offset="100%" stop-color="#9A68D4"/>
      </radialGradient>
    </defs>

    ${topRightBouquet}
    ${bottomLeftBouquet}
    ${leftEdgeSprig}
    ${floatingFlowerMarkup}
    ${floatingPetalMarkup}
    ${pollenMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Renders one symmetrical side of the royal-blue velvet theater stage curtain with gold fringe trim
 * and fluted vertical folds, scaled horizontally around the outer stage edge so curtains glide open cleanly.
 */
const buildStageCurtainSideMarkup = (
  isRight: boolean,
  scaleX: number,
  swayPx: number,
  width: number,
  height: number,
): string => {
  const anchorX = isRight ? width : 0;
  const dirScaleX = isRight ? -scaleX : scaleX;
  const drapeEndX = Number((54 + swayPx).toFixed(1));
  const tieX = Number((58 + swayPx * 0.6).toFixed(1));
  return `<g transform="translate(${anchorX}, 0) scale(${dirScaleX.toFixed(3)}, 1)">
    <!-- Deep velvet backing shadow along stage wall -->
    <path d="M 0 0 L 182 0 Q 128 84, ${tieX} 138 Q 36 270, ${drapeEndX} ${height} L 0 ${height} Z" fill="rgba(2, 8, 28, 0.52)"/>
    <!-- Lower gathered velvet column below tieback -->
    <path d="M 0 132 L ${tieX} 136 Q 42 266, ${drapeEndX} ${height} L 0 ${height} Z" fill="url(#curtainBlueDeep)"/>
    <path d="M 10 136 Q 8 272, 18 ${height} L 34 ${height} Q 26 270, 30 136 Z" fill="url(#curtainFoldHighlight)" opacity="0.78"/>
    <path d="M 34 136 Q 28 272, 42 ${height} L ${drapeEndX} ${height} Q 42 266, ${tieX} 136 Z" fill="url(#curtainFoldShadow)" opacity="0.65"/>
    <!-- Sweeping upper theater drape with gold fringe -->
    <path d="M 0 0 L 178 0 C 148 56, 108 106, ${tieX} 138 L 0 144 Z" fill="url(#curtainBlueRich)"/>
    <!-- Vertical fluted velvet highlight & shadow pleats across upper drape -->
    <path d="M 18 0 C 16 48, 12 96, 10 142 L 26 140 C 30 96, 36 48, 42 0 Z" fill="url(#curtainFoldHighlight)" opacity="0.72"/>
    <path d="M 56 0 C 50 48, 42 96, 32 138 L 48 138 C 60 96, 72 48, 84 0 Z" fill="url(#curtainFoldHighlight)" opacity="0.68"/>
    <path d="M 98 0 C 86 46, 68 92, 50 136 L 62 136 C 84 92, 108 46, 126 0 Z" fill="url(#curtainFoldHighlight)" opacity="0.62"/>
    <path d="M 142 0 C 122 44, 96 90, 58 136 L 64 137 C 108 92, 140 48, 166 0 Z" fill="url(#curtainFoldShadow)" opacity="0.7"/>
    <!-- Metallic gold fringe trim arcing gracefully along curtain edge -->
    <path d="M 178 0 C 148 56, 108 106, ${tieX} 138 Q 28 143, 0 144" fill="none" stroke="#C88E1A" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M 176 0 C 146 55, 106 105, ${tieX} 137 Q 28 142, 0 143" fill="none" stroke="url(#stageGoldBright)" stroke-width="3.2" stroke-linecap="round"/>
    <!-- Gold tieback tassel cinch -->
    <ellipse cx="${tieX}" cy="138" rx="6" ry="3.8" fill="url(#stageGoldBright)" stroke="#9C690C" stroke-width="0.8"/>
  </g>`;
};

/**
 * Renders a hanging metallic 5-point gold star suspended from a delicate gold chain (reusing `getFivePointStarVertices`).
 */
const buildHangingStageStarMarkup = (
  anchorX: number,
  chainLen: number,
  starR: number,
  swayDeg: number,
  opacity: number = 0.96,
): string => {
  const starPts = getFivePointStarVertices(0, chainLen, starR, starR * 0.42, 0)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  return `<g transform="translate(${anchorX.toFixed(1)}, 0) rotate(${swayDeg.toFixed(2)})" opacity="${opacity.toFixed(2)}">
    <line x1="0" y1="0" x2="0" y2="${(chainLen - starR * 0.35).toFixed(1)}" stroke="rgba(255, 224, 134, 0.78)" stroke-width="1.2" stroke-dasharray="2.5,2"/>
    <polygon points="${starPts}" fill="url(#stageGoldBright)" stroke="#9C680B" stroke-width="0.7" stroke-linejoin="round"/>
  </g>`;
};

/**
 * Builds the static midnight-blue theater stage backdrop with overhead spotlights
 * and illuminated circular double-tier gold & sapphire stage podium for Template 10 (`anniversary-bg10.gif`).
 */
const buildStageCurtainSpotlightBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const cx = Math.round(width / 2);
  // Marquee lights along bottom front tier of podium
  const marqueeBulbs: string[] = [];
  for (let i = -5; i <= 5; i++) {
    const bx = cx + i * 32;
    const by = 434 + Math.round((i * i) * 0.12);
    marqueeBulbs.push(
      `<circle cx="${bx}" cy="${by}" r="3.4" fill="#FFF8CE"/>`,
      `<circle cx="${bx}" cy="${by}" r="6.5" fill="rgba(255, 232, 148, 0.32)"/>`,
    );
  }

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="stageMidnightSky" cx="50%" cy="42%" r="72%">
        <stop offset="0%" stop-color="#0C2A6E"/>
        <stop offset="56%" stop-color="#061640"/>
        <stop offset="100%" stop-color="#02071A"/>
      </radialGradient>
      <linearGradient id="spotlightBeamGrad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stop-color="rgba(122, 198, 255, 0.56)"/>
        <stop offset="45%" stop-color="rgba(42, 132, 248, 0.24)"/>
        <stop offset="100%" stop-color="rgba(22, 86, 210, 0)"/>
      </linearGradient>
      <radialGradient id="podiumBlueTop" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#84D4FF"/>
        <stop offset="42%" stop-color="#2286EE"/>
        <stop offset="100%" stop-color="#0B2E78"/>
      </radialGradient>
      <linearGradient id="stageGoldRim" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#9A660C"/>
        <stop offset="28%" stop-color="#F8D26A"/>
        <stop offset="50%" stop-color="#FFF5C4"/>
        <stop offset="72%" stop-color="#F5C95A"/>
        <stop offset="100%" stop-color="#945F08"/>
      </linearGradient>
    </defs>

    <!-- Deep midnight navy theater stage background -->
    <rect width="${width}" height="${height}" fill="url(#stageMidnightSky)"/>

    <!-- 3 Soft Volumetric Blue Overhead Stage Spotlight Cones -->
    <polygon points="244,12 128,412 356,412" fill="url(#spotlightBeamGrad)" opacity="0.58"/>
    <polygon points="${cx},10 ${cx - 128},412 ${cx + 128},412" fill="url(#spotlightBeamGrad)" opacity="0.65"/>
    <polygon points="506,12 396,412 624,412" fill="url(#spotlightBeamGrad)" opacity="0.58"/>

    <!-- Overhead Spotlight Lamp Fixtures & Glowing Bulbs -->
    <g>
      <ellipse cx="244" cy="11" rx="14" ry="8" fill="#0B1428" stroke="#3B5488" stroke-width="1"/>
      <ellipse cx="244" cy="14" rx="8" ry="4" fill="#E6F6FF"/>
      <ellipse cx="${cx}" cy="9" rx="15" ry="8" fill="#0B1428" stroke="#3B5488" stroke-width="1"/>
      <ellipse cx="${cx}" cy="12" rx="9" ry="4" fill="#FFF9E6"/>
      <ellipse cx="506" cy="11" rx="14" ry="8" fill="#0B1428" stroke="#3B5488" stroke-width="1"/>
      <ellipse cx="506" cy="14" rx="8" ry="4" fill="#E6F6FF"/>
    </g>

    <!-- Illuminated Metallic Gold & Glowing Blue Multi-Tier Stage Podium (cleanly below y=398) -->
    <ellipse cx="${cx}" cy="442" rx="262" ry="18" fill="rgba(250, 200, 74, 0.30)"/>
    <ellipse cx="${cx}" cy="436" rx="236" ry="18" fill="#0A1020" stroke="url(#stageGoldRim)" stroke-width="2.6"/>
    <path d="M ${cx - 216} 422 L ${cx - 216} 436 A 216 14 0 0 0 ${cx + 216} 436 L ${cx + 216} 422 Z" fill="#0D162C" stroke="url(#stageGoldRim)" stroke-width="1.4"/>
    <ellipse cx="${cx}" cy="422" rx="216" ry="13" fill="#0F1B38" stroke="url(#stageGoldRim)" stroke-width="2.4"/>
    <path d="M ${cx - 178} 409 L ${cx - 178} 421 A 178 11 0 0 0 ${cx + 178} 421 L ${cx + 178} 409 Z" fill="#0D1730" stroke="url(#stageGoldRim)" stroke-width="1.2"/>
    <ellipse cx="${cx}" cy="409" rx="178" ry="11" fill="url(#podiumBlueTop)" stroke="url(#stageGoldRim)" stroke-width="2.6"/>
    ${marqueeBulbs.join('\n    ')}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the smoothly opening royal-blue velvet stage curtains ("screen will be open"),
 * calmly swaying hanging gold stars, and slowly floating golden confetti party blasts & bokeh
 * for Template 10 (`anniversary-bg10.gif`) across normalized time t ∈ [0, 1).
 */
const buildStageCurtainSpotlightFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Curtain opening reveal: smoothly parts from drawn curtains -> wide open stage & holds open seamlessly
  const easeInOut = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u)));
  const openRatio =
    t < 0.38
      ? easeInOut(t / 0.38)
      : t < 0.86
      ? 1.0
      : 1.0 - easeInOut((t - 0.86) / 0.14);
  const curtainScaleX = 1.44 - 0.58 * openRatio; // 1.44 (drawn) -> 0.86 (wide open stage wings)
  const leftCurtain = buildStageCurtainSideMarkup(
    false,
    curtainScaleX,
    Math.sin(tau + 0.3) * 2.4,
    width,
    height,
  );
  const rightCurtain = buildStageCurtainSideMarkup(
    true,
    curtainScaleX,
    Math.sin(tau + 1.9) * 2.4,
    width,
    height,
  );

  // 2. Hanging 5-point gold stars on chains swaying gently at upper stage gaps
  const hangingStars = [
    { x: 204, len: 56, r: 10.5, amp: 2.2, phase: 0.4 },
    { x: 288, len: 34, r: 7.5, amp: 1.8, phase: 1.5 },
    { x: 566, len: 38, r: 8.5, amp: 2.0, phase: 2.6 },
    { x: 616, len: 74, r: 11.5, amp: 2.4, phase: 3.7 },
    { x: 682, len: 96, r: 12.0, amp: 2.2, phase: 4.9 },
  ];
  const hangingStarMarkup = hangingStars
    .map((st) =>
      buildHangingStageStarMarkup(
        st.x,
        st.len,
        st.r,
        Math.sin(tau + st.phase) * st.amp,
        0.92 + 0.08 * Math.sin(tau + st.phase),
      ),
    )
    .join('\n    ');

  // 3. Slowly floating golden confetti party blasts & ambient floating 5-point stars around open margins
  const foilBlasts = [
    { bx: 244, by: 122, w: 9, h: 4.5, rot: -24, ax: 2.2, ay: 3.2, phase: 0.5 },
    { bx: 604, by: 162, w: 9.5, h: 4.8, rot: 28, ax: 2.4, ay: 3.6, phase: 1.8 },
    { bx: 696, by: 236, w: 10, h: 5.0, rot: -32, ax: 2.2, ay: 3.4, phase: 2.9 },
    { bx: 704, by: 332, w: 9.0, h: 4.5, rot: 22, ax: 2.4, ay: 3.2, phase: 4.1 },
    { bx: 48, by: 224, w: 9.0, h: 4.5, rot: -18, ax: 2.0, ay: 3.0, phase: 1.2 },
    { bx: 76, by: 336, w: 9.5, h: 4.8, rot: 36, ax: 2.2, ay: 3.2, phase: 3.4 },
    { bx: 158, by: 392, w: 8.5, h: 4.2, rot: -26, ax: 2.0, ay: 2.8, phase: 5.1 },
    { bx: 598, by: 390, w: 8.5, h: 4.2, rot: 24, ax: 2.0, ay: 2.8, phase: 2.3 },
  ];
  const blastMarkup = foilBlasts
    .map((f) => {
      const p = slowFloat(f.bx, f.by, f.ax, f.ay, tau, f.phase);
      const rot = (f.rot + Math.sin(tau + f.phase) * 9).toFixed(1);
      return `<rect x="${(-f.w / 2).toFixed(1)}" y="${(-f.h / 2).toFixed(1)}" width="${f.w}" height="${f.h}" rx="1.0" transform="translate(${p.x}, ${p.y}) rotate(${rot})" fill="url(#stageGoldBright)" opacity="0.92"/>`;
    })
    .join('\n    ');

  // Floating glowing bokeh & starlight embers near lower stage & side wings
  const stageSparks = [
    { bx: 122, by: 368, r: 5.5, ax: 1.8, ay: 2.6, phase: 0.7 },
    { bx: 638, by: 366, r: 6.0, ax: 1.8, ay: 2.6, phase: 2.1 },
    { bx: 88, by: 282, r: 4.5, ax: 1.6, ay: 2.4, phase: 3.5 },
    { bx: 668, by: 284, r: 4.8, ax: 1.6, ay: 2.4, phase: 4.8 },
    { bx: 312, by: 392, r: 4.2, ax: 1.4, ay: 2.0, phase: 1.4 },
    { bx: 444, by: 392, r: 4.2, ax: 1.4, ay: 2.0, phase: 4.0 },
  ];
  const sparkMarkup = stageSparks
    .map((sp) => {
      const p = slowFloat(sp.bx, sp.by, sp.ax, sp.ay, tau, sp.phase);
      const pulse = 0.74 + 0.26 * Math.sin(tau + sp.phase);
      const s = Number((sp.r * pulse).toFixed(2));
      const op = (0.62 + 0.34 * Math.sin(tau + sp.phase)).toFixed(2);
      return `<circle cx="${p.x}" cy="${p.y}" r="${s}" fill="#FFE89E" opacity="${op}"/>`;
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="curtainBlueRich" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#06194E"/>
        <stop offset="48%" stop-color="#113C9E"/>
        <stop offset="100%" stop-color="#092466"/>
      </linearGradient>
      <linearGradient id="curtainBlueDeep" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#041238"/>
        <stop offset="55%" stop-color="#0B2D7A"/>
        <stop offset="100%" stop-color="#051746"/>
      </linearGradient>
      <linearGradient id="curtainFoldHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0E348C" stop-opacity="0"/>
        <stop offset="50%" stop-color="#2E6CE0" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#0E348C" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="curtainFoldShadow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#020820" stop-opacity="0"/>
        <stop offset="50%" stop-color="#020820" stop-opacity="0.82"/>
        <stop offset="100%" stop-color="#020820" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="stageGoldBright" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF7CA"/>
        <stop offset="45%" stop-color="#F7CC58"/>
        <stop offset="100%" stop-color="#B87E14"/>
      </linearGradient>
    </defs>

    ${sparkMarkup}
    ${blastMarkup}
    ${hangingStarMarkup}
    ${leftCurtain}
    ${rightCurtain}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Generates the standalone opening royal-blue stage curtains, spotlights & slow-floating stars Template 10 GIF
 * (`anniversary-bg10.gif`) without any employee name, photo, or text overlay.
 */
export async function generateStageCurtainSpotlightBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 40,
  frameDelay: number = 110,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildStageCurtainSpotlightBackdropSvg(width, height),
    (t) => buildStageCurtainSpotlightFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Builds the static deep royal-purple twilight backdrop with diagonal violet light shafts
 * and glowing horizon mist behind the cheering crowd for Template 11 (`anniversary-bg11.gif`).
 */
const buildPurpleCrowdStarsBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  // Diagonal subtle violet stage light beams radiating down from upper corners
  const lightShafts = [
    `M 0 0 L 145 0 L 290 ${Math.round(height * 0.62)} L 155 ${Math.round(height * 0.62)} Z`,
    `M 110 0 L 240 0 L 340 ${Math.round(height * 0.56)} L 245 ${Math.round(height * 0.56)} Z`,
    `M ${width} 0 L ${width - 145} 0 L ${width - 290} ${Math.round(height * 0.62)} L ${width - 155} ${Math.round(height * 0.62)} Z`,
    `M ${width - 110} 0 L ${width - 240} 0 L ${width - 340} ${Math.round(height * 0.56)} L ${width - 245} ${Math.round(height * 0.56)} Z`,
  ]
    .map(
      (d, idx) =>
        `<path d="${d}" fill="url(#p11RayGrad)" opacity="${idx % 2 === 0 ? '0.42' : '0.28'}"/>`,
    )
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="p11NightSky" cx="50%" cy="38%" r="74%">
        <stop offset="0%" stop-color="#331B78"/>
        <stop offset="48%" stop-color="#221056"/>
        <stop offset="100%" stop-color="#110733"/>
      </radialGradient>
      <linearGradient id="p11RayGrad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stop-color="#9A72FF" stop-opacity="0.30"/>
        <stop offset="65%" stop-color="#6A42D8" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#2A1468" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="p11HorizonMist" cx="50%" cy="94%" r="58%">
        <stop offset="0%" stop-color="#9B6BFF" stop-opacity="0.46"/>
        <stop offset="45%" stop-color="#5B33B8" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#1A0B46" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="p11SideGlowL" cx="12%" cy="86%" r="36%">
        <stop offset="0%" stop-color="#8A5CFF" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="#1A0B46" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="p11SideGlowR" cx="88%" cy="86%" r="36%">
        <stop offset="0%" stop-color="#8A5CFF" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="#1A0B46" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#p11NightSky)"/>
    ${lightShafts}
    <rect width="${width}" height="${height}" fill="url(#p11HorizonMist)"/>
    <rect width="${width}" height="${height}" fill="url(#p11SideGlowL)"/>
    <rect width="${width}" height="${height}" fill="url(#p11SideGlowR)"/>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds slowly floating golden & violet 4-point sparkle stars ("starts")
 * and gently waving cheering crowd silhouettes with raised hands ("people hands")
 * for Template 11 (`anniversary-bg11.gif`) across normalized time t ∈ [0, 1).
 */
const buildPurpleCrowdStarsFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Slowly floating 4-point gold & lilac sparkle stars + stardust specks in safe outer/upper sky margins
  const starSpecs: Array<{
    bx: number;
    by: number;
    r: number;
    tone: 'gold' | 'lilac';
    ax: number;
    ay: number;
    phase: number;
  }> = [
    { bx: 204, by: 42, r: 9.8, tone: 'gold', ax: 1.8, ay: 2.5, phase: 0.3 },
    { bx: 668, by: 76, r: 11.2, tone: 'gold', ax: 2.0, ay: 2.8, phase: 1.4 },
    { bx: 616, by: 36, r: 6.4, tone: 'lilac', ax: 1.5, ay: 2.2, phase: 2.5 },
    { bx: 252, by: 76, r: 5.4, tone: 'lilac', ax: 1.4, ay: 2.0, phase: 3.9 },
    { bx: 36, by: 108, r: 6.2, tone: 'lilac', ax: 1.6, ay: 2.4, phase: 4.8 },
    { bx: 718, by: 152, r: 6.8, tone: 'gold', ax: 1.7, ay: 2.4, phase: 0.9 },
    { bx: 644, by: 204, r: 8.8, tone: 'lilac', ax: 1.8, ay: 2.6, phase: 3.2 },
    { bx: 42, by: 214, r: 7.4, tone: 'gold', ax: 1.6, ay: 2.4, phase: 2.1 },
    { bx: 696, by: 288, r: 9.2, tone: 'gold', ax: 2.0, ay: 2.8, phase: 5.1 },
    { bx: 636, by: 326, r: 5.8, tone: 'lilac', ax: 1.4, ay: 2.1, phase: 1.7 },
    { bx: 78, by: 332, r: 6.6, tone: 'lilac', ax: 1.5, ay: 2.2, phase: 4.1 },
    { bx: 28, by: 304, r: 6.2, tone: 'gold', ax: 1.4, ay: 2.1, phase: 0.6 },
  ];

  const starMarkup = starSpecs
    .map((st) => {
      const p = slowFloat(st.bx, st.by, st.ax, st.ay, tau, st.phase);
      const pulse = 0.78 + 0.24 * Math.sin(tau + st.phase);
      const s = Number((st.r * pulse).toFixed(2));
      const op = (0.74 + 0.24 * Math.sin(tau + st.phase)).toFixed(2);
      const fill = st.tone === 'gold' ? 'url(#p11GoldStar)' : 'url(#p11LilacStar)';
      const haloFill = st.tone === 'gold' ? 'url(#p11GoldHalo)' : 'url(#p11LilacHalo)';
      return `<circle cx="${p.x}" cy="${p.y}" r="${(s * 1.65).toFixed(2)}" fill="${haloFill}" opacity="${op}"/>
    <path d="M ${p.x} ${(p.y - s).toFixed(2)} Q ${p.x} ${p.y} ${(p.x + s).toFixed(2)} ${p.y} Q ${p.x} ${p.y} ${p.x} ${(p.y + s).toFixed(2)} Q ${p.x} ${p.y} ${(p.x - s).toFixed(2)} ${p.y} Q ${p.x} ${p.y} ${p.x} ${(p.y - s).toFixed(2)} Z" fill="${fill}" opacity="${op}"/>`;
    })
    .join('\n    ');

  // Subtle slow-floating stardust motes around night sky margins (clear of logo & copy)
  const dustSpecs = [
    { bx: 184, by: 68, r: 1.5, phase: 0.4 },
    { bx: 238, by: 28, r: 1.4, phase: 2.2 },
    { bx: 598, by: 68, r: 1.5, phase: 3.7 },
    { bx: 728, by: 56, r: 1.8, phase: 1.1 },
    { bx: 702, by: 244, r: 1.6, phase: 4.5 },
    { bx: 642, by: 258, r: 1.4, phase: 2.8 },
    { bx: 24, by: 256, r: 1.6, phase: 5.4 },
    { bx: 94, by: 294, r: 1.5, phase: 1.9 },
  ];
  const dustMarkup = dustSpecs
    .map((d) => {
      const p = slowFloat(d.bx, d.by, 1.3, 2.0, tau, d.phase);
      const op = (0.42 + 0.44 * Math.sin(tau + d.phase)).toFixed(2);
      return `<circle cx="${p.x}" cy="${p.y}" r="${d.r}" fill="#FFE99A" opacity="${op}"/>`;
    })
    .join('\n    ');

  // 2. Cheering crowd silhouettes with slowly waving raised hands along the bottom edge
  const backCrowdPeople = [
    { x: 64, y: 382, scale: 0.88, arm: 'both' as const, bh: 115, phase: 0.5 },
    { x: 126, y: 396, scale: 0.78, arm: 'right' as const, bh: 95, phase: 1.6 },
    { x: 196, y: 416, scale: 0.68, arm: 'left' as const, bh: 75, phase: 2.8 },
    { x: 268, y: 426, scale: 0.60, arm: 'both' as const, bh: 65, phase: 3.9 },
    { x: 342, y: 430, scale: 0.58, arm: 'right' as const, bh: 60, phase: 0.9 },
    { x: 418, y: 430, scale: 0.58, arm: 'left' as const, bh: 60, phase: 2.1 },
    { x: 492, y: 425, scale: 0.62, arm: 'both' as const, bh: 65, phase: 4.4 },
    { x: 564, y: 416, scale: 0.68, arm: 'right' as const, bh: 75, phase: 5.3 },
    { x: 634, y: 396, scale: 0.78, arm: 'left' as const, bh: 95, phase: 1.2 },
    { x: 696, y: 382, scale: 0.88, arm: 'both' as const, bh: 115, phase: 3.3 },
  ]
    .map((person) => {
      const dy = Number((Math.sin(tau + person.phase) * 1.4).toFixed(2));
      const lDeg = Math.sin(tau + person.phase) * 5.8;
      const rDeg = -Math.sin(tau + person.phase + 0.6) * 5.8;
      return buildCheeringPersonSvg(
        person.x,
        person.y + dy,
        person.scale,
        '#160B40',
        person.arm,
        person.bh,
        lDeg,
        rDeg,
        true,
      );
    })
    .join('\n    ');

  const frontCrowdPeople = [
    { x: 30, y: 374, scale: 1.02, arm: 'right' as const, bh: 120, phase: 0.2 },
    { x: 96, y: 394, scale: 0.88, arm: 'both' as const, bh: 100, phase: 1.9 },
    { x: 164, y: 416, scale: 0.74, arm: 'left' as const, bh: 75, phase: 3.4 },
    { x: 240, y: 432, scale: 0.64, arm: 'right' as const, bh: 60, phase: 4.8 },
    { x: 310, y: 436, scale: 0.60, arm: 'left' as const, bh: 55, phase: 1.1 },
    { x: 380, y: 438, scale: 0.58, arm: 'both' as const, bh: 52, phase: 2.7 },
    { x: 450, y: 436, scale: 0.60, arm: 'right' as const, bh: 55, phase: 5.2 },
    { x: 520, y: 432, scale: 0.64, arm: 'left' as const, bh: 60, phase: 0.7 },
    { x: 596, y: 416, scale: 0.74, arm: 'right' as const, bh: 75, phase: 2.3 },
    { x: 664, y: 394, scale: 0.88, arm: 'both' as const, bh: 100, phase: 4.1 },
    { x: 730, y: 374, scale: 1.02, arm: 'left' as const, bh: 120, phase: 5.6 },
  ]
    .map((person) => {
      const dy = Number((Math.sin(tau + person.phase) * 1.8).toFixed(2));
      const lDeg = Math.sin(tau + person.phase) * 7.2;
      const rDeg = -Math.sin(tau + person.phase + 0.5) * 7.2;
      return buildCheeringPersonSvg(
        person.x,
        person.y + dy,
        person.scale,
        '#07031A',
        person.arm,
        person.bh,
        lDeg,
        rDeg,
        true,
      );
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="p11GoldHalo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFE680" stop-opacity="0.52"/>
        <stop offset="55%" stop-color="#FFD038" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#FFD038" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="p11LilacHalo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#E8DBFF" stop-opacity="0.46"/>
        <stop offset="55%" stop-color="#B08CFF" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#B08CFF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="p11GoldStar" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFFBE0"/>
        <stop offset="52%" stop-color="#FFD84D"/>
        <stop offset="100%" stop-color="#E5A214"/>
      </radialGradient>
      <radialGradient id="p11LilacStar" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="55%" stop-color="#CFB8FF"/>
        <stop offset="100%" stop-color="#8A64EE"/>
      </radialGradient>
    </defs>

    ${dustMarkup}
    ${starMarkup}
    ${backCrowdPeople}
    ${frontCrowdPeople}
    <rect x="-10" y="${height - 14}" width="${width + 20}" height="22" fill="#07031A"/>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Generates the standalone deep purple night, slowly floating sparkle stars, and cheering crowd hands
 * Template 11 GIF (`anniversary-bg11.gif`) without any employee name, photo, or text overlay.
 */
export async function generatePurpleCrowdStarsBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 40,
  frameDelay: number = 110,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildPurpleCrowdStarsBackdropSvg(width, height),
    (t) => buildPurpleCrowdStarsFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Builds the static bright spring-white & fresh lime-wave backdrop with the rooted olive-green
 * tree trunk and subtle ground swoosh for Template 12 (`anniversary-bg12.gif`).
 */
const buildSpringTreePartyBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const trunkX = 682;
  const trunkBaseY = 406;

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="t12PaperGlow" cx="46%" cy="46%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="68%" stop-color="#FAFCF6"/>
        <stop offset="100%" stop-color="#EEF6E2"/>
      </radialGradient>
      <linearGradient id="t12WaveLight" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#D2F37B" stop-opacity="0.72"/>
        <stop offset="50%" stop-color="#B9EA54" stop-opacity="0.58"/>
        <stop offset="100%" stop-color="#C8F06E" stop-opacity="0.76"/>
      </linearGradient>
      <linearGradient id="t12WaveRich" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#9BE028"/>
        <stop offset="52%" stop-color="#84CE1B"/>
        <stop offset="100%" stop-color="#6BB812"/>
      </linearGradient>
      <linearGradient id="t12TrunkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#84C61E"/>
        <stop offset="55%" stop-color="#5B9B10"/>
        <stop offset="100%" stop-color="#3C7308"/>
      </linearGradient>
      <linearGradient id="t12SwooshGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#BBE952" stop-opacity="0.18"/>
        <stop offset="55%" stop-color="#A6DF36" stop-opacity="0.82"/>
        <stop offset="100%" stop-color="#82C91E" stop-opacity="0.92"/>
      </linearGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#t12PaperGlow)"/>

    <!-- Rolling bottom lime hills matching uploaded card bottom border -->
    <path d="M 0 398 Q 145 436, 378 446 Q 605 454, ${width} 396 L ${width} ${height} L 0 ${height} Z" fill="url(#t12WaveLight)"/>
    <path d="M 0 416 Q 165 446, 392 448 Q 618 450, ${width} 412 L ${width} ${height} L 0 ${height} Z" fill="url(#t12WaveRich)"/>

    <!-- Graceful chartreuse ground swoosh under tree on right wing -->
    <path d="M 552 412 Q 650 392, ${width + 12} 404 L ${width + 12} 416 Q 658 408, 552 412 Z" fill="url(#t12SwooshGrad)"/>

    <!-- Rooted artistic spring tree trunk anchored on right margin -->
    <path d="M ${trunkX - 38} ${trunkBaseY}
      C ${trunkX - 18} ${trunkBaseY - 8}, ${trunkX - 14} 352, ${trunkX - 11} 302
      C ${trunkX - 9} 276, ${trunkX - 7} 262, ${trunkX - 4} 252
      L ${trunkX + 8} 252
      C ${trunkX + 10} 274, ${trunkX + 12} 312, ${trunkX + 18} 356
      C ${trunkX + 24} 388, ${trunkX + 36} ${trunkBaseY - 4}, ${trunkX + 48} ${trunkBaseY + 2}
      Q ${trunkX} ${trunkBaseY + 5}, ${trunkX - 38} ${trunkBaseY} Z"
      fill="url(#t12TrunkGrad)"/>
    <!-- Delicate root bark grain accents -->
    <path d="M ${trunkX - 18} ${trunkBaseY} Q ${trunkX - 6} 374, ${trunkX - 5} 322" fill="none" stroke="#396D07" stroke-width="1.3" opacity="0.55" stroke-linecap="round"/>
    <path d="M ${trunkX + 6} ${trunkBaseY + 1} Q ${trunkX + 4} 368, ${trunkX + 2} 310" fill="none" stroke="#9EE030" stroke-width="1.2" opacity="0.6" stroke-linecap="round"/>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the gently swaying leafy tree canopy ("tree parts"), curling green/gold party streamers,
 * golden foil stars, and confetti shards ("blasts") drifting slowly for Template 12 (`anniversary-bg12.gif`).
 */
const buildSpringTreePartyFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Living tree canopy limbs & leaves pivoting smoothly from trunk fork (682, 260)
  const canopySway = (Math.sin(tau) * 1.85).toFixed(2);
  const branchSpecs = [
    // Upper left spreading boughs & twigs
    'M 680 264 Q 656 218, 622 178',
    'M 642 204 Q 618 190, 598 164',
    'M 656 226 Q 630 226, 610 212',
    'M 684 260 Q 674 198, 668 128',
    'M 672 172 Q 644 140, 622 108',
    'M 670 152 Q 692 118, 706 88',
    'M 688 262 Q 716 216, 738 176',
    'M 708 214 Q 726 198, 742 186',
  ]
    .map((d, i) => `<path d="${d}" fill="none" stroke="#5B9B10" stroke-width="${i % 3 === 0 ? '4.4' : '2.6'}" stroke-linecap="round"/>`)
    .join('\n      ');

  const canopyLeaves: Array<{
    x: number;
    y: number;
    rot: number;
    sx: number;
    sy: number;
    grad: 't12LeafLime' | 't12LeafEmerald' | 't12LeafFresh';
  }> = [
    { x: 620, y: 174, rot: -148, sx: 0.92, sy: 0.84, grad: 't12LeafLime' },
    { x: 604, y: 158, rot: -162, sx: 0.86, sy: 0.78, grad: 't12LeafFresh' },
    { x: 616, y: 138, rot: -112, sx: 0.94, sy: 0.86, grad: 't12LeafEmerald' },
    { x: 624, y: 108, rot: -134, sx: 0.98, sy: 0.90, grad: 't12LeafLime' },
    { x: 642, y: 92, rot: -96, sx: 0.88, sy: 0.80, grad: 't12LeafFresh' },
    { x: 666, y: 122, rot: -84, sx: 1.02, sy: 0.92, grad: 't12LeafEmerald' },
    { x: 672, y: 84, rot: -74, sx: 0.96, sy: 0.88, grad: 't12LeafLime' },
    { x: 696, y: 96, rot: -48, sx: 1.00, sy: 0.90, grad: 't12LeafFresh' },
    { x: 708, y: 74, rot: -62, sx: 0.86, sy: 0.78, grad: 't12LeafEmerald' },
    { x: 722, y: 112, rot: -26, sx: 0.94, sy: 0.84, grad: 't12LeafLime' },
    { x: 702, y: 142, rot: -18, sx: 0.92, sy: 0.84, grad: 't12LeafEmerald' },
    { x: 682, y: 158, rot: -128, sx: 0.84, sy: 0.78, grad: 't12LeafFresh' },
    { x: 648, y: 146, rot: -116, sx: 0.90, sy: 0.82, grad: 't12LeafLime' },
    { x: 612, y: 208, rot: -172, sx: 0.88, sy: 0.80, grad: 't12LeafFresh' },
    { x: 634, y: 222, rot: -146, sx: 0.84, sy: 0.76, grad: 't12LeafEmerald' },
    { x: 734, y: 168, rot: -28, sx: 0.98, sy: 0.88, grad: 't12LeafLime' },
    { x: 740, y: 190, rot: 14, sx: 0.90, sy: 0.82, grad: 't12LeafFresh' },
    { x: 718, y: 196, rot: 22, sx: 0.86, sy: 0.78, grad: 't12LeafEmerald' },
    { x: 694, y: 204, rot: -42, sx: 0.84, sy: 0.78, grad: 't12LeafLime' },
    { x: 660, y: 190, rot: -92, sx: 0.88, sy: 0.80, grad: 't12LeafEmerald' },
  ];

  const treeCanopy = `<g transform="rotate(${canopySway}, 682, 260)">
      ${branchSpecs}
      ${canopyLeaves
        .map((lf) =>
          buildBotanicalSageLeafMarkup(lf.x, lf.y, lf.rot, lf.sx, lf.sy, lf.grad, '#E7FBBE', 0.94),
        )
        .join('\n      ')}
    </g>`;

  // Gently drifting detached tree leaves slowly floating on outer edges
  const floatingLeaves = [
    { bx: 586, by: 266, rot: 36, sx: 0.72, sy: 0.66, grad: 't12LeafLime', phase: 0.6 },
    { bx: 612, by: 318, rot: -24, sx: 0.68, sy: 0.62, grad: 't12LeafFresh', phase: 2.3 },
    { bx: 56, by: 378, rot: -42, sx: 0.74, sy: 0.68, grad: 't12LeafEmerald', phase: 3.9 },
  ]
    .map((dl) => {
      const p = slowFloat(dl.bx, dl.by, 2.2, 3.0, tau, dl.phase);
      const rot = dl.rot + Math.sin(tau + dl.phase) * 9;
      return buildBotanicalSageLeafMarkup(p.x, p.y, rot, dl.sx, dl.sy, dl.grad, '#E7FBBE', 0.88);
    })
    .join('\n    ');

  // 2. Curled 3D green & metallic gold party streamers floating slowly in safe margins
  const streamerSpecs: Array<{
    bx: number;
    by: number;
    rot: number;
    scale: number;
    color: string;
    hi: string;
    variant: 'sCurl' | 'loopCurl';
    ax: number;
    ay: number;
    phase: number;
  }> = [
    { bx: 204, by: 46, rot: -16, scale: 0.78, color: '#D89612', hi: '#FFF0A0', variant: 'loopCurl', ax: 1.8, ay: 2.6, phase: 0.4 },
    { bx: 30, by: 102, rot: 12, scale: 0.68, color: '#47A826', hi: '#C2F784', variant: 'sCurl', ax: 1.6, ay: 2.4, phase: 1.7 },
    { bx: 44, by: 304, rot: -18, scale: 0.84, color: '#D89612', hi: '#FFF0A0', variant: 'loopCurl', ax: 1.8, ay: 2.8, phase: 2.9 },
    { bx: 604, by: 42, rot: 22, scale: 0.82, color: '#3F9E22', hi: '#BDF47C', variant: 'loopCurl', ax: 1.8, ay: 2.8, phase: 1.1 },
    { bx: 726, by: 46, rot: -12, scale: 0.90, color: '#D89612', hi: '#FFF0A0', variant: 'loopCurl', ax: 2.0, ay: 3.0, phase: 3.6 },
    { bx: 724, by: 342, rot: 18, scale: 0.82, color: '#3F9E22', hi: '#BDF47C', variant: 'sCurl', ax: 1.8, ay: 2.6, phase: 4.8 },
  ];
  const streamerMarkup = streamerSpecs
    .map((s) => {
      const p = slowFloat(s.bx, s.by, s.ax, s.ay, tau, s.phase);
      const rot = s.rot + Math.sin(tau + s.phase) * 7.5;
      return buildCurledStreamerMarkup(p.x, p.y, rot, s.scale, s.color, s.hi, s.variant);
    })
    .join('\n    ');

  // 3. Golden 5-point foil stars & emerald/gold confetti diamond shards floating gently
  const blastItems: Array<{
    bx: number;
    by: number;
    kind: 'star' | 'shard';
    size: number;
    rot: number;
    fill: string;
    ax: number;
    ay: number;
    phase: number;
  }> = [
    { bx: 244, by: 54, kind: 'star', size: 8.5, rot: 12, fill: '#F3B41C', ax: 1.5, ay: 2.2, phase: 0.5 },
    { bx: 184, by: 26, kind: 'shard', size: 7.5, rot: 36, fill: '#47A826', ax: 1.4, ay: 2.0, phase: 1.9 },
    { bx: 26, by: 214, kind: 'star', size: 8.0, rot: -18, fill: '#F3B41C', ax: 1.4, ay: 2.2, phase: 3.1 },
    { bx: 112, by: 356, kind: 'star', size: 9.2, rot: 22, fill: '#F3B41C', ax: 1.6, ay: 2.4, phase: 4.4 },
    { bx: 84, by: 332, kind: 'shard', size: 8.0, rot: -28, fill: '#37921B', ax: 1.5, ay: 2.2, phase: 2.5 },
    { bx: 26, by: 368, kind: 'shard', size: 7.5, rot: 42, fill: '#D89612', ax: 1.4, ay: 2.0, phase: 5.2 },
    { bx: 642, by: 62, kind: 'star', size: 9.4, rot: -14, fill: '#F3B41C', ax: 1.6, ay: 2.4, phase: 0.9 },
    { bx: 682, by: 36, kind: 'shard', size: 8.2, rot: 32, fill: '#D89612', ax: 1.5, ay: 2.2, phase: 2.2 },
    { bx: 598, by: 102, kind: 'shard', size: 7.2, rot: -38, fill: '#47A826', ax: 1.4, ay: 2.0, phase: 4.0 },
    { bx: 662, by: 358, kind: 'star', size: 9.0, rot: 18, fill: '#F3B41C', ax: 1.6, ay: 2.4, phase: 1.5 },
    { bx: 624, by: 374, kind: 'shard', size: 7.8, rot: 28, fill: '#47A826', ax: 1.4, ay: 2.1, phase: 3.7 },
    { bx: 702, by: 312, kind: 'shard', size: 7.5, rot: -24, fill: '#D89612', ax: 1.4, ay: 2.1, phase: 5.0 },
  ];

  const blastMarkup = blastItems
    .map((b) => {
      const p = slowFloat(b.bx, b.by, b.ax, b.ay, tau, b.phase);
      const rot = b.rot + Math.sin(tau + b.phase) * 9;
      if (b.kind === 'star') {
        return buildPartyStarMarkup(p.x, p.y, b.size, rot, b.fill, '#C6820A', 0.6, 0.95);
      }
      return buildConfettiShardMarkup(p.x, p.y, b.size, b.size * 0.68, rot, b.fill, 0.9);
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="t12LeafLime" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#D2FA68"/>
        <stop offset="50%" stop-color="#9BE226"/>
        <stop offset="100%" stop-color="#60AD0A"/>
      </linearGradient>
      <linearGradient id="t12LeafFresh" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#BFEF4A"/>
        <stop offset="55%" stop-color="#78C616"/>
        <stop offset="100%" stop-color="#489208"/>
      </linearGradient>
      <linearGradient id="t12LeafEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#8ED82E"/>
        <stop offset="55%" stop-color="#52A40E"/>
        <stop offset="100%" stop-color="#2B6B04"/>
      </linearGradient>
    </defs>

    ${treeCanopy}
    ${floatingLeaves}
    ${blastMarkup}
    ${streamerMarkup}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Generates the standalone spring-green swaying tree canopy, curled ribbons, stars & confetti blasts
 * Template 12 GIF (`anniversary-bg12.gif`) without any employee name, photo, or text overlay.
 */
export async function generateSpringTreePartyBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 40,
  frameDelay: number = 110,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildSpringTreePartyBackdropSvg(width, height),
    (t) => buildSpringTreePartyFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Builds the static sky-blue-to-sunlit-meadow backdrop with soft clouds, rolling lime hills,
 * corner grass tufts, and rooted olive-green tree trunk for Template 13 (`anniversary-bg13.gif`).
 */
const buildSkyMeadowTreeBalloonsBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const trunkX = 684;
  const trunkBaseY = 408;

  // Stylized grass blade tufts along bottom-left and bottom-right corners
  const grassLeft = [
    'M 0 448 Q 8 408, 22 384 Q 14 418, 12 448 Z',
    'M 14 448 Q 24 414, 40 392 Q 28 424, 26 448 Z',
    'M 28 448 Q 42 418, 60 400 Q 44 428, 40 448 Z',
    'M 46 448 Q 62 424, 82 412 Q 64 434, 58 448 Z',
    'M 66 448 Q 84 430, 106 422 Q 86 440, 80 448 Z',
  ]
    .map((d, i) => `<path d="${d}" fill="${i % 2 === 0 ? '#57B810' : '#7EE022'}" opacity="0.92"/>`)
    .join('\n    ');

  const grassRight = [
    `M ${width} 448 Q ${width - 10} 406, ${width - 24} 382 Q ${width - 14} 418, ${width - 12} 448 Z`,
    `M ${width - 14} 448 Q ${width - 26} 414, ${width - 44} 392 Q ${width - 30} 424, ${width - 26} 448 Z`,
    `M ${width - 30} 448 Q ${width - 46} 420, ${width - 66} 404 Q ${width - 46} 430, ${width - 42} 448 Z`,
    `M ${width - 52} 448 Q ${width - 70} 426, ${width - 92} 416 Q ${width - 72} 436, ${width - 66} 448 Z`,
  ]
    .map((d, i) => `<path d="${d}" fill="${i % 2 === 0 ? '#57B810' : '#7EE022'}" opacity="0.92"/>`)
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="t13SkyBase" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#C6E9FD"/>
        <stop offset="28%" stop-color="#EBF7FE"/>
        <stop offset="56%" stop-color="#FFFFFF"/>
        <stop offset="86%" stop-color="#F6FCEA"/>
        <stop offset="100%" stop-color="#E7F7C8"/>
      </linearGradient>
      <radialGradient id="t13CloudSoft" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="t13HillBack" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#C5F062" stop-opacity="0.72"/>
        <stop offset="50%" stop-color="#E1FA9C" stop-opacity="0.44"/>
        <stop offset="100%" stop-color="#BEEA58" stop-opacity="0.76"/>
      </linearGradient>
      <linearGradient id="t13HillFront" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#8FD820"/>
        <stop offset="48%" stop-color="#B7EB4C"/>
        <stop offset="100%" stop-color="#75C614"/>
      </linearGradient>
      <linearGradient id="t13TrunkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#84C61E"/>
        <stop offset="58%" stop-color="#589710"/>
        <stop offset="100%" stop-color="#386E06"/>
      </linearGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#t13SkyBase)"/>

    <!-- Soft fluffy sunlit sky clouds along upper horizon -->
    <ellipse cx="98" cy="46" rx="76" ry="26" fill="url(#t13CloudSoft)"/>
    <ellipse cx="152" cy="36" rx="58" ry="22" fill="url(#t13CloudSoft)"/>
    <ellipse cx="408" cy="34" rx="92" ry="24" fill="url(#t13CloudSoft)"/>
    <ellipse cx="598" cy="44" rx="82" ry="26" fill="url(#t13CloudSoft)"/>

    <!-- Sunlit meadow rolling hills along bottom margin -->
    <path d="M 0 388 Q 168 424, 384 436 Q 600 448, ${width} 386 L ${width} ${height} L 0 ${height} Z" fill="url(#t13HillBack)"/>
    <path d="M 0 412 Q 178 442, 392 446 Q 608 448, ${width} 408 L ${width} ${height} L 0 ${height} Z" fill="url(#t13HillFront)"/>

    <!-- Rooted olive-green tree trunk on right meadow rise -->
    <path d="M ${trunkX - 34} ${trunkBaseY}
      C ${trunkX - 16} ${trunkBaseY - 7}, ${trunkX - 13} 358, ${trunkX - 10} 312
      C ${trunkX - 8} 290, ${trunkX - 6} 276, ${trunkX - 3} 266
      L ${trunkX + 7} 266
      C ${trunkX + 9} 286, ${trunkX + 11} 320, ${trunkX + 17} 360
      C ${trunkX + 22} 390, ${trunkX + 34} ${trunkBaseY - 3}, ${trunkX + 44} ${trunkBaseY + 2}
      Q ${trunkX} ${trunkBaseY + 5}, ${trunkX - 34} ${trunkBaseY} Z"
      fill="url(#t13TrunkGrad)"/>
    <path d="M ${trunkX - 15} ${trunkBaseY} Q ${trunkX - 5} 372, ${trunkX - 4} 326" fill="none" stroke="#366A06" stroke-width="1.2" opacity="0.55" stroke-linecap="round"/>

    ${grassLeft}
    ${grassRight}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the gently swaying leafy tree canopy, slowly floating green/gold/white glossy balloons,
 * drifting tree leaves, and golden/green party confetti blasts for Template 13 (`anniversary-bg13.gif`).
 */
const buildSkyMeadowTreeBalloonsFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Leafy green tree canopy swaying calmly from trunk fork (684, 272) cleanly below upper-right balloons
  const canopySway = (Math.sin(tau) * 1.85).toFixed(2);
  const branchSpecs = [
    'M 682 276 Q 656 238, 620 206',
    'M 642 224 Q 618 212, 600 192',
    'M 684 274 Q 674 222, 668 172',
    'M 672 204 Q 644 178, 624 156',
    'M 672 194 Q 694 170, 710 150',
    'M 688 274 Q 716 234, 738 202',
    'M 708 234 Q 726 220, 742 210',
  ]
    .map((d, i) => `<path d="${d}" fill="none" stroke="#589710" stroke-width="${i % 2 === 0 ? '4.0' : '2.4'}" stroke-linecap="round"/>`)
    .join('\n      ');

  const canopyLeaves: Array<{
    x: number;
    y: number;
    rot: number;
    sx: number;
    sy: number;
    grad: 't13LeafLime' | 't13LeafFresh' | 't13LeafEmerald';
  }> = [
    { x: 618, y: 204, rot: -152, sx: 0.90, sy: 0.82, grad: 't13LeafLime' },
    { x: 602, y: 188, rot: -165, sx: 0.84, sy: 0.76, grad: 't13LeafFresh' },
    { x: 622, y: 162, rot: -136, sx: 0.92, sy: 0.84, grad: 't13LeafLime' },
    { x: 644, y: 152, rot: -102, sx: 0.88, sy: 0.80, grad: 't13LeafEmerald' },
    { x: 668, y: 168, rot: -84, sx: 0.96, sy: 0.86, grad: 't13LeafLime' },
    { x: 690, y: 152, rot: -58, sx: 0.92, sy: 0.84, grad: 't13LeafFresh' },
    { x: 712, y: 150, rot: -42, sx: 0.88, sy: 0.80, grad: 't13LeafEmerald' },
    { x: 724, y: 174, rot: -22, sx: 0.92, sy: 0.84, grad: 't13LeafLime' },
    { x: 698, y: 186, rot: -128, sx: 0.84, sy: 0.76, grad: 't13LeafFresh' },
    { x: 650, y: 184, rot: -116, sx: 0.88, sy: 0.80, grad: 't13LeafLime' },
    { x: 612, y: 234, rot: -172, sx: 0.84, sy: 0.76, grad: 't13LeafFresh' },
    { x: 636, y: 244, rot: -146, sx: 0.82, sy: 0.76, grad: 't13LeafEmerald' },
    { x: 734, y: 198, rot: -26, sx: 0.94, sy: 0.86, grad: 't13LeafLime' },
    { x: 742, y: 214, rot: 14, sx: 0.88, sy: 0.80, grad: 't13LeafFresh' },
    { x: 718, y: 222, rot: 22, sx: 0.84, sy: 0.76, grad: 't13LeafEmerald' },
    { x: 694, y: 226, rot: -46, sx: 0.84, sy: 0.76, grad: 't13LeafLime' },
  ];

  const treeCanopy = `<g transform="rotate(${canopySway}, 684, 272)">
      ${branchSpecs}
      ${canopyLeaves
        .map((lf) =>
          buildBotanicalSageLeafMarkup(lf.x, lf.y, lf.rot, lf.sx, lf.sy, lf.grad, '#E7FBBE', 0.94),
        )
        .join('\n      ')}
    </g>`;

  // Gently drifting detached leaves floating slowly around lower meadow & canopy
  const floatingLeaves = [
    { bx: 590, by: 288, rot: 32, sx: 0.72, sy: 0.66, grad: 't13LeafLime', phase: 0.5 },
    { bx: 626, by: 334, rot: -28, sx: 0.68, sy: 0.62, grad: 't13LeafFresh', phase: 2.2 },
    { bx: 84, by: 314, rot: -38, sx: 0.72, sy: 0.66, grad: 't13LeafEmerald', phase: 3.8 },
  ]
    .map((dl) => {
      const p = slowFloat(dl.bx, dl.by, 2.0, 2.8, tau, dl.phase);
      const rot = dl.rot + Math.sin(tau + dl.phase) * 9;
      return buildBotanicalSageLeafMarkup(p.x, p.y, rot, dl.sx, dl.sy, dl.grad, '#E7FBBE', 0.88);
    })
    .join('\n    ');

  // 2. Glossy green, metallic gold & pearl-white celebration balloons floating slowly
  const balloons = [
    { bx: 618, by: 54, rx: 16, ry: 20, rot: -10, grad: 't13WhiteBalloon', knot: '#D6E6F2', dx: -8, len: 54, flecks: false, ax: 1.8, ay: 3.2, phase: 0.4 },
    { bx: 662, by: 40, rx: 19, ry: 24, rot: -4, grad: 't13GreenBalloon', knot: '#176E1C', dx: 6, len: 64, flecks: false, ax: 2.0, ay: 3.6, phase: 1.5 },
    { bx: 716, by: 68, rx: 19, ry: 24, rot: 8, grad: 't13GoldBalloon', knot: '#B87E12', dx: 9, len: 62, flecks: false, ax: 2.0, ay: 3.5, phase: 2.7 },
    { bx: 670, by: 96, rx: 14, ry: 18, rot: -7, grad: 't13WhiteBalloon', knot: '#D6E6F2', dx: -6, len: 48, flecks: true, ax: 1.7, ay: 3.0, phase: 3.9 },
    { bx: 742, by: 118, rx: 13, ry: 16, rot: 10, grad: 't13GreenBalloon', knot: '#176E1C', dx: 5, len: 44, flecks: false, ax: 1.5, ay: 2.8, phase: 5.0 },
    { bx: 206, by: 46, rx: 14, ry: 17, rot: -8, grad: 't13WhiteBalloon', knot: '#D6E6F2', dx: -6, len: 42, flecks: true, ax: 1.6, ay: 2.8, phase: 2.1 },
    { bx: 38, by: 332, rx: 15, ry: 19, rot: -8, grad: 't13GreenBalloon', knot: '#176E1C', dx: 5, len: 48, flecks: false, ax: 1.6, ay: 3.0, phase: 0.9 },
    { bx: 78, by: 364, rx: 14, ry: 17, rot: 7, grad: 't13GoldBalloon', knot: '#B87E12', dx: -6, len: 44, flecks: false, ax: 1.6, ay: 2.8, phase: 4.3 },
  ]
    .map((b) => {
      const p = slowFloat(b.bx, b.by, b.ax, b.ay, tau, b.phase);
      const rot = b.rot + Math.sin(tau + b.phase) * 2.4;
      const swayDx = b.dx + Math.sin(tau + b.phase) * 4.5;
      const rim = b.grad === 't13WhiteBalloon' ? 'rgba(138, 184, 214, 0.72)' : undefined;
      return buildFestiveBalloonMarkup(
        p.x,
        p.y,
        b.rx,
        b.ry,
        rot,
        b.grad,
        b.knot,
        swayDx,
        b.len,
        b.flecks,
        'rgba(196, 144, 24, 0.62)',
        rim,
      );
    })
    .join('\n    ');

  // 3. Slowly floating golden 5-point party stars & emerald/gold confetti shards
  const blasts: Array<{
    bx: number;
    by: number;
    kind: 'star' | 'shard';
    size: number;
    rot: number;
    fill: string;
    ax: number;
    ay: number;
    phase: number;
  }> = [
    { bx: 248, by: 36, kind: 'star', size: 8.2, rot: 14, fill: '#F3B41C', ax: 1.4, ay: 2.1, phase: 0.6 },
    { bx: 282, by: 62, kind: 'shard', size: 7.2, rot: 36, fill: '#3FA424', ax: 1.4, ay: 2.0, phase: 2.0 },
    { bx: 28, by: 198, kind: 'star', size: 7.8, rot: -16, fill: '#F3B41C', ax: 1.4, ay: 2.1, phase: 3.3 },
    { bx: 118, by: 344, kind: 'star', size: 8.4, rot: 20, fill: '#F3B41C', ax: 1.5, ay: 2.2, phase: 4.7 },
    { bx: 138, by: 374, kind: 'shard', size: 7.4, rot: -28, fill: '#3FA424', ax: 1.4, ay: 2.0, phase: 1.4 },
    { bx: 604, by: 122, kind: 'shard', size: 7.4, rot: 32, fill: '#3FA424', ax: 1.4, ay: 2.1, phase: 2.8 },
    { bx: 616, by: 366, kind: 'star', size: 8.6, rot: -14, fill: '#F3B41C', ax: 1.5, ay: 2.2, phase: 0.9 },
    { bx: 726, by: 332, kind: 'shard', size: 7.8, rot: 26, fill: '#D89612', ax: 1.4, ay: 2.1, phase: 4.1 },
    { bx: 644, by: 382, kind: 'shard', size: 7.4, rot: -32, fill: '#3FA424', ax: 1.4, ay: 2.0, phase: 5.3 },
  ];

  const blastMarkup = blasts
    .map((b) => {
      const p = slowFloat(b.bx, b.by, b.ax, b.ay, tau, b.phase);
      const rot = b.rot + Math.sin(tau + b.phase) * 8;
      if (b.kind === 'star') {
        return buildPartyStarMarkup(p.x, p.y, b.size, rot, b.fill, '#C6820A', 0.6, 0.95);
      }
      return buildConfettiShardMarkup(p.x, p.y, b.size, b.size * 0.68, rot, b.fill, 0.9);
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="t13GreenBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#B8F49C"/>
        <stop offset="28%" stop-color="#36A22E"/>
        <stop offset="72%" stop-color="#1A6E1C"/>
        <stop offset="100%" stop-color="#0E4410"/>
      </radialGradient>
      <radialGradient id="t13GoldBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#FFFCE0"/>
        <stop offset="28%" stop-color="#F7CF58"/>
        <stop offset="72%" stop-color="#CE8C18"/>
        <stop offset="100%" stop-color="#8A5608"/>
      </radialGradient>
      <radialGradient id="t13WhiteBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="52%" stop-color="#ECF6FD"/>
        <stop offset="86%" stop-color="#C6DEEE"/>
        <stop offset="100%" stop-color="#9EBCD0"/>
      </radialGradient>
      <linearGradient id="t13LeafLime" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#D2FA68"/>
        <stop offset="50%" stop-color="#9BE226"/>
        <stop offset="100%" stop-color="#60AD0A"/>
      </linearGradient>
      <linearGradient id="t13LeafFresh" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#BFEF4A"/>
        <stop offset="55%" stop-color="#78C616"/>
        <stop offset="100%" stop-color="#489208"/>
      </linearGradient>
      <linearGradient id="t13LeafEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#8ED82E"/>
        <stop offset="55%" stop-color="#52A40E"/>
        <stop offset="100%" stop-color="#2B6B04"/>
      </linearGradient>
    </defs>

    ${treeCanopy}
    ${floatingLeaves}
    ${blastMarkup}
    ${balloons}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Generates the standalone sky-meadow swaying tree, glossy green/gold/white balloons,
 * drifting leaves & party blasts Template 13 GIF (`anniversary-bg13.gif`) without any employee overlay.
 */
export async function generateSkyMeadowTreeBalloonsBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 40,
  frameDelay: number = 110,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildSkyMeadowTreeBalloonsBackdropSvg(width, height),
    (t) => buildSkyMeadowTreeBalloonsFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Helper to draw a delicate botanical berry sprig with curved stem and glowing round berries.
 */
const buildBotanicalBerrySprigMarkup = (
  stemPath: string,
  berries: Array<{ x: number; y: number; r: number }>,
  stemColor: string,
  berryFill: string,
  berryStroke: string,
): string => {
  const dots = berries
    .map(
      (b) =>
        `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.r.toFixed(1)}" fill="${berryFill}" stroke="${berryStroke}" stroke-width="0.6"/>`,
    )
    .join('');
  return `<g><path d="${stemPath}" fill="none" stroke="${stemColor}" stroke-width="1.3" stroke-linecap="round"/>${dots}</g>`;
};

/**
 * Builds the static luminous white-to-lavender watercolor corner wash backdrop with rounded
 * champagne-gold hairline frame for Template 14 (`anniversary-bg14.gif`).
 */
const buildLavenderCornerFloralFrameBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="t14PaperBase" cx="50%" cy="50%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="68%" stop-color="#FDFBFE"/>
        <stop offset="100%" stop-color="#F6EFFC"/>
      </radialGradient>
      <radialGradient id="t14WashTL" cx="6%" cy="8%" r="54%">
        <stop offset="0%" stop-color="#E7D0FA" stop-opacity="0.44"/>
        <stop offset="55%" stop-color="#F5ECFE" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="t14WashTR" cx="94%" cy="8%" r="54%">
        <stop offset="0%" stop-color="#E4CAFA" stop-opacity="0.46"/>
        <stop offset="55%" stop-color="#F5ECFE" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="t14WashBL" cx="8%" cy="92%" r="54%">
        <stop offset="0%" stop-color="#E4CAFA" stop-opacity="0.46"/>
        <stop offset="55%" stop-color="#F5ECFE" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="t14WashBR" cx="94%" cy="92%" r="54%">
        <stop offset="0%" stop-color="#E9D4FB" stop-opacity="0.42"/>
        <stop offset="55%" stop-color="#F6EEFE" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="t14GoldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#D9AE68"/>
        <stop offset="50%" stop-color="#B98744"/>
        <stop offset="100%" stop-color="#D6A964"/>
      </linearGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#t14PaperBase)"/>
    <rect width="${width}" height="${height}" fill="url(#t14WashTL)"/>
    <rect width="${width}" height="${height}" fill="url(#t14WashTR)"/>
    <rect width="${width}" height="${height}" fill="url(#t14WashBL)"/>
    <rect width="${width}" height="${height}" fill="url(#t14WashBR)"/>

    <!-- Delicate rounded gold & lilac inner framing lines -->
    <rect x="14" y="12" width="${width - 28}" height="${height - 24}" rx="14" fill="none" stroke="url(#t14GoldBorder)" stroke-width="1.4" opacity="0.86"/>
    <rect x="18" y="16" width="${width - 36}" height="${height - 32}" rx="11" fill="none" stroke="#D5B6E8" stroke-width="0.85" opacity="0.72"/>
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the gently swaying lavender/violet corner floral bouquets, berry sprigs, and slowly
 * floating petals & leaves for Template 14 (`anniversary-bg14.gif`).
 */
const buildLavenderCornerFloralFrameFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Top-Right floral bouquet swaying calmly from corner anchor
  const swayTR = (Math.sin(tau) * 1.35).toFixed(2);
  const topRightBouquet = `<g transform="translate(${width - 14}, 14) rotate(${swayTR})">
    ${buildBotanicalBerrySprigMarkup('M -96 10 Q -126 18, -148 34', [{ x: -128, y: 18, r: 3.1 }, { x: -140, y: 26, r: 2.8 }, { x: -150, y: 34, r: 2.5 }, { x: -116, y: 24, r: 2.6 }], '#9C6D24', '#EAB74C', '#9E6E1E')}
    ${buildBotanicalBerrySprigMarkup('M -22 92 Q -18 128, -26 154', [{ x: -18, y: 118, r: 3.0 }, { x: -20, y: 136, r: 2.7 }, { x: -26, y: 152, r: 2.4 }, { x: -12, y: 128, r: 2.4 }], '#9C6D24', '#EAB74C', '#9E6E1E')}
    ${buildBotanicalBerrySprigMarkup('M -72 54 Q -92 78, -108 92', [{ x: -88, y: 74, r: 3.2 }, { x: -98, y: 84, r: 2.8 }, { x: -108, y: 92, r: 2.5 }], '#6838A8', '#9D62EB', '#5B2B99')}
    ${buildBotanicalSageLeafMarkup(-112, 12, 168, 1.05, 0.92, 't14LeafViolet', '#F0E4FD', 0.92)}
    ${buildBotanicalSageLeafMarkup(-132, 22, 152, 0.95, 0.84, 't14LeafBlue', '#E8F2FC', 0.90)}
    ${buildBotanicalSageLeafMarkup(-86, 48, 134, 1.12, 0.96, 't14LeafBlue', '#E8F2FC', 0.92)}
    ${buildBotanicalSageLeafMarkup(-56, 78, 114, 1.05, 0.90, 't14LeafViolet', '#F0E4FD', 0.90)}
    ${buildBotanicalSageLeafMarkup(-14, 96, 94, 0.98, 0.86, 't14LeafBlue', '#E8F2FC', 0.88)}
    ${buildBotanicalSageLeafMarkup(-36, 122, 108, 0.86, 0.78, 't14LeafGold', '#FFF6DA', 0.88)}
    ${buildWatercolorFlowerMarkup(-56, 40, 38, 14, 'floralPetalLilac', 'floralPetalSoft', 0.96)}
    ${buildWatercolorFlowerMarkup(-18, 92, 21, 34, 'floralPetalSoft', 'floralPetalLilac', 0.92)}
  </g>`;

  // 2. Bottom-Left floral bouquet swaying calmly from corner anchor
  const swayBL = (Math.sin(tau + 2.3) * 1.35).toFixed(2);
  const bottomLeftBouquet = `<g transform="translate(14, ${height - 14}) rotate(${swayBL})">
    ${buildBotanicalBerrySprigMarkup('M 28 -88 Q 36 -124, 52 -148', [{ x: 36, y: -116, r: 3.1 }, { x: 44, y: -134, r: 2.8 }, { x: 52, y: -148, r: 2.5 }, { x: 46, y: -118, r: 2.4 }], '#9C6D24', '#EAB74C', '#9E6E1E')}
    ${buildBotanicalBerrySprigMarkup('M 98 -22 Q 134 -24, 162 -36', [{ x: 126, y: -24, r: 3.0 }, { x: 144, y: -28, r: 2.7 }, { x: 160, y: -36, r: 2.4 }], '#9C6D24', '#EAB74C', '#9E6E1E')}
    ${buildBotanicalBerrySprigMarkup('M 64 -58 Q 84 -80, 100 -94', [{ x: 82, y: -76, r: 3.2 }, { x: 92, y: -86, r: 2.8 }, { x: 100, y: -94, r: 2.5 }], '#6838A8', '#9D62EB', '#5B2B99')}
    ${buildBotanicalSageLeafMarkup(18, -104, -76, 1.06, 0.92, 't14LeafViolet', '#F0E4FD', 0.92)}
    ${buildBotanicalSageLeafMarkup(28, -132, -62, 0.94, 0.84, 't14LeafBlue', '#E8F2FC', 0.90)}
    ${buildBotanicalSageLeafMarkup(54, -76, -42, 1.12, 0.96, 't14LeafBlue', '#E8F2FC', 0.92)}
    ${buildBotanicalSageLeafMarkup(88, -46, -24, 1.06, 0.92, 't14LeafViolet', '#F0E4FD', 0.90)}
    ${buildBotanicalSageLeafMarkup(122, -16, -8, 0.98, 0.86, 't14LeafBlue', '#E8F2FC', 0.88)}
    ${buildBotanicalSageLeafMarkup(138, -32, -18, 0.86, 0.78, 't14LeafGold', '#FFF6DA', 0.88)}
    ${buildWatercolorFlowerMarkup(50, -54, 40, -16, 'floralPetalLilac', 'floralPetalSoft', 0.96)}
    ${buildWatercolorFlowerMarkup(106, -22, 21, 18, 'floralPetalSoft', 'floralPetalLilac', 0.92)}
  </g>`;

  // 3. Slowly floating detached lavender petals & leaves around safe margins
  const floatingPetals = [
    { bx: 36, by: 88, rot: -26, s: 0.76, ax: 1.6, ay: 2.4, phase: 0.5 },
    { bx: 204, by: 42, rot: 48, s: 0.84, ax: 1.8, ay: 2.6, phase: 1.7 },
    { bx: 28, by: 208, rot: 22, s: 0.74, ax: 1.5, ay: 2.3, phase: 2.9 },
    { bx: 722, by: 238, rot: -38, s: 0.82, ax: 1.8, ay: 2.6, phase: 1.1 },
    { bx: 694, by: 368, rot: 32, s: 0.88, ax: 2.0, ay: 2.8, phase: 3.6 },
    { bx: 618, by: 410, rot: -52, s: 0.80, ax: 1.7, ay: 2.5, phase: 4.8 },
    { bx: 254, by: 408, rot: 38, s: 0.78, ax: 1.6, ay: 2.4, phase: 2.2 },
  ]
    .map((pt) => {
      const p = slowFloat(pt.bx, pt.by, pt.ax, pt.ay, tau, pt.phase);
      const rot = pt.rot + Math.sin(tau + pt.phase) * 11;
      return buildFloatingPetalMarkup(p.x, p.y, rot, pt.s, 0.86);
    })
    .join('\n    ');

  const floatingLeaves = [
    { bx: 184, by: 72, rot: 28, s: 0.58, grad: 't14LeafViolet', vein: '#F0E4FD', phase: 0.9 },
    { bx: 642, by: 162, rot: 142, s: 0.62, grad: 't14LeafBlue', vein: '#E8F2FC', phase: 2.4 },
    { bx: 658, by: 394, rot: -124, s: 0.64, grad: 't14LeafViolet', vein: '#F0E4FD', phase: 4.1 },
    { bx: 214, by: 392, rot: -22, s: 0.60, grad: 't14LeafGold', vein: '#FFF6DA', phase: 5.3 },
  ]
    .map((lf) => {
      const p = slowFloat(lf.bx, lf.by, 1.8, 2.6, tau, lf.phase);
      const rot = lf.rot + Math.sin(tau + lf.phase) * 9;
      return buildBotanicalSageLeafMarkup(p.x, p.y, rot, lf.s, lf.s * 0.88, lf.grad, lf.vein, 0.86);
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="floralPetalLilac" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F6EEFF"/>
        <stop offset="48%" stop-color="#C98EF6"/>
        <stop offset="100%" stop-color="#8A3ED6"/>
      </linearGradient>
      <linearGradient id="floralPetalSoft" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="52%" stop-color="#DFB8FA"/>
        <stop offset="100%" stop-color="#A662E4"/>
      </linearGradient>
      <linearGradient id="t14LeafViolet" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#C49CF8"/>
        <stop offset="55%" stop-color="#8246CA"/>
        <stop offset="100%" stop-color="#4A1E8A"/>
      </linearGradient>
      <linearGradient id="t14LeafBlue" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#B9D8F8"/>
        <stop offset="55%" stop-color="#5B86D4"/>
        <stop offset="100%" stop-color="#2D4A9A"/>
      </linearGradient>
      <linearGradient id="t14LeafGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FCE498"/>
        <stop offset="55%" stop-color="#CFA044"/>
        <stop offset="100%" stop-color="#9A681A"/>
      </linearGradient>
    </defs>

    ${topRightBouquet}
    ${bottomLeftBouquet}
    ${floatingLeaves}
    ${floatingPetals}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Generates the standalone lavender watercolor floral & slowly floating petals/leaves
 * Template 14 GIF (`anniversary-bg14.gif`) without any employee name, photo, or text overlay.
 */
export async function generateLavenderCornerFloralFrameBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 40,
  frameDelay: number = 110,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildLavenderCornerFloralFrameBackdropSvg(width, height),
    (t) => buildLavenderCornerFloralFrameFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Helper to render a swinging rustic wooden plank tag suspended by a hemp rope.
 */
const buildWoodHangingTagMarkup = (
  anchorX: number,
  anchorY: number,
  ropeLen: number,
  w: number,
  h: number,
  lines: string[],
  swingDeg: number,
  doubleRope: boolean = false,
): string => {
  const topY = ropeLen;
  const rx = -w / 2;
  const ropes = doubleRope
    ? `<line x1="${(rx + 11).toFixed(1)}" y1="0" x2="${(rx + 11).toFixed(1)}" y2="${topY + 4}" stroke="#8B5A2B" stroke-width="2.0" stroke-linecap="round"/>
       <line x1="${(rx + w - 11).toFixed(1)}" y1="0" x2="${(rx + w - 11).toFixed(1)}" y2="${topY + 4}" stroke="#8B5A2B" stroke-width="2.0" stroke-linecap="round"/>
       <circle cx="${(rx + 11).toFixed(1)}" cy="${topY + 4}" r="1.8" fill="#5A3614"/>
       <circle cx="${(rx + w - 11).toFixed(1)}" cy="${topY + 4}" r="1.8" fill="#5A3614"/>`
    : `<line x1="0" y1="0" x2="0" y2="${topY + 4}" stroke="#8B5A2B" stroke-width="2.1" stroke-linecap="round"/>
       <circle cx="0" cy="${topY + 4}" r="1.9" fill="#5A3614"/>`;

  const textYBase = topY + (lines.length === 1 ? h * 0.64 : h * 0.44);
  const textSvg = lines
    .map((ln, idx) => {
      const yPos = (textYBase + idx * 9.5).toFixed(1);
      return `<text x="0" y="${yPos}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="700" font-size="8.4" fill="#2B1606">${escapeXml(ln)}</text>`;
    })
    .join('');

  return `<g transform="translate(${anchorX.toFixed(1)}, ${anchorY.toFixed(1)}) rotate(${swingDeg.toFixed(2)})">
    ${ropes}
    <rect x="${(rx + 1.5).toFixed(1)}" y="${topY + 2}" width="${w}" height="${h}" rx="3" fill="rgba(40, 22, 6, 0.22)"/>
    <rect x="${rx.toFixed(1)}" y="${topY}" width="${w}" height="${h}" rx="3" fill="url(#t15WoodPlank)" stroke="#9C6424" stroke-width="1.0"/>
    <line x1="${(rx + 4).toFixed(1)}" y1="${topY + 5}" x2="${(rx + w - 5).toFixed(1)}" y2="${topY + 5}" stroke="rgba(130, 78, 22, 0.28)" stroke-width="0.8"/>
    <line x1="${(rx + 5).toFixed(1)}" y1="${topY + h - 5}" x2="${(rx + w - 4).toFixed(1)}" y2="${topY + h - 5}" stroke="rgba(130, 78, 22, 0.28)" stroke-width="0.8"/>
    ${textSvg}
  </g>`;
};

/**
 * Helper to draw the sunlit golden championship trophy cup on a dark hardwood plinth.
 */
const buildGoldenTrophyCupMarkup = (cx: number, baseY: number, scale: number = 1): string => {
  const pts = getFivePointStarVertices(0, -68, 9.5, 4.2, 0)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  return `<g transform="translate(${cx.toFixed(1)}, ${baseY.toFixed(1)}) scale(${scale.toFixed(2)})">
    <!-- Ground contact shadow -->
    <ellipse cx="0" cy="2" rx="34" ry="5" fill="rgba(36, 18, 4, 0.38)"/>
    <!-- Two-tier dark espresso wood base -->
    <path d="M -28 0 L 28 0 L 24 -8 L -24 -8 Z" fill="#2A1508" stroke="#180A03" stroke-width="0.8"/>
    <path d="M -24 -8 L 24 -8 L 20 -28 L -20 -28 Z" fill="#3E200E" stroke="#180A03" stroke-width="0.8"/>
    <!-- Brass nameplate on front of base -->
    <rect x="-14" y="-24" width="28" height="13" rx="1.5" fill="url(#t15GoldTrophy)" stroke="#8B5E0C" stroke-width="0.7"/>
    <line x1="-10" y1="-19" x2="10" y2="-19" stroke="#7A4F08" stroke-width="1.2" opacity="0.7"/>
    <line x1="-8" y1="-15" x2="8" y2="-15" stroke="#7A4F08" stroke-width="1.2" opacity="0.7"/>
    <!-- Trophy stem & collar -->
    <path d="M -14 -28 Q 0 -32, 14 -28 L 8 -36 Q 0 -42, 6 -50 L -6 -50 Q 0 -42, -8 -36 Z" fill="url(#t15GoldTrophy)" stroke="#9C6A0E" stroke-width="0.8"/>
    <!-- Sculpted curved cup handles -->
    <path d="M -18 -84 C -36 -84, -36 -58, -12 -54" fill="none" stroke="url(#t15GoldTrophy)" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M 18 -84 C 36 -84, 36 -58, 12 -54" fill="none" stroke="url(#t15GoldTrophy)" stroke-width="4.2" stroke-linecap="round"/>
    <!-- Glowing chalice cup bowl -->
    <path d="M -21 -88 L 21 -88 C 20 -64, 12 -50, 0 -48 C -12 -50, -20 -64, -21 -88 Z" fill="url(#t15GoldTrophy)" stroke="#9C6A0E" stroke-width="0.9"/>
    <ellipse cx="0" cy="-88" rx="21" ry="4" fill="#FFF2A8" stroke="#A67414" stroke-width="0.8"/>
    <!-- Embossed 5-point star emblem on cup -->
    <polygon points="${pts}" fill="#FFF7BE" stroke="#9C6A0E" stroke-width="0.8"/>
  </g>`;
};

/**
 * Builds the static warm sunlit cream backdrop with grassy wooden floor ledge,
 * golden championship trophy on the lower-left, and oak tree trunk on the right for Template 15 (`anniversary-bg15.gif`).
 */
const buildWoodlandTreeTagsBackdropSvg = (
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const trunkX = 688;
  const ledgeY = height - 24;

  // Grass tufts tucked behind trophy and tree base
  const grassLeft = [
    `M 0 ${ledgeY} Q 8 ${ledgeY - 26}, 18 ${ledgeY - 42} Q 14 ${ledgeY - 16}, 12 ${ledgeY} Z`,
    `M 12 ${ledgeY} Q 24 ${ledgeY - 22}, 38 ${ledgeY - 36} Q 28 ${ledgeY - 14}, 24 ${ledgeY} Z`,
    `M 88 ${ledgeY} Q 102 ${ledgeY - 18}, 116 ${ledgeY - 28} Q 104 ${ledgeY - 10}, 100 ${ledgeY} Z`,
    `M 102 ${ledgeY} Q 118 ${ledgeY - 16}, 134 ${ledgeY - 22} Q 120 ${ledgeY - 8}, 114 ${ledgeY} Z`,
  ]
    .map((d, i) => `<path d="${d}" fill="${i % 2 === 0 ? '#4B9B12' : '#7AD124'}" opacity="0.92"/>`)
    .join('\n    ');

  const grassRight = [
    `M 604 ${ledgeY} Q 618 ${ledgeY - 16}, 632 ${ledgeY - 26} Q 620 ${ledgeY - 10}, 616 ${ledgeY} Z`,
    `M 622 ${ledgeY} Q 638 ${ledgeY - 22}, 654 ${ledgeY - 34} Q 640 ${ledgeY - 14}, 634 ${ledgeY} Z`,
    `M 718 ${ledgeY} Q 732 ${ledgeY - 20}, 746 ${ledgeY - 32} Q 736 ${ledgeY - 12}, 730 ${ledgeY} Z`,
    `M 736 ${ledgeY} Q 748 ${ledgeY - 24}, 758 ${ledgeY - 38} Q 750 ${ledgeY - 14}, 748 ${ledgeY} Z`,
  ]
    .map((d, i) => `<path d="${d}" fill="${i % 2 === 0 ? '#4B9B12' : '#7AD124'}" opacity="0.92"/>`)
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="t15SunGlow" cx="50%" cy="44%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="58%" stop-color="#FCFDF7"/>
        <stop offset="100%" stop-color="#EEF5DC"/>
      </radialGradient>
      <radialGradient id="t15CornerSunR" cx="88%" cy="74%" r="34%">
        <stop offset="0%" stop-color="#D7ED9B" stop-opacity="0.46"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="t15WoodTable" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#D29A5E"/>
        <stop offset="22%" stop-color="#B07238"/>
        <stop offset="72%" stop-color="#8A5222"/>
        <stop offset="100%" stop-color="#693C16"/>
      </linearGradient>
      <linearGradient id="t15BarkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#865329"/>
        <stop offset="48%" stop-color="#643B1A"/>
        <stop offset="100%" stop-color="#42240E"/>
      </linearGradient>
      <linearGradient id="t15GoldTrophy" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF4B2"/>
        <stop offset="38%" stop-color="#F2BF3C"/>
        <stop offset="78%" stop-color="#C68414"/>
        <stop offset="100%" stop-color="#8A5608"/>
      </linearGradient>
      <linearGradient id="t15LeafDark" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#8CD62E"/>
        <stop offset="55%" stop-color="#4B9B12"/>
        <stop offset="100%" stop-color="#276206"/>
      </linearGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#t15SunGlow)"/>
    <rect width="${width}" height="${height}" fill="url(#t15CornerSunR)"/>

    <!-- Lower-left lush plant cluster beside trophy -->
    ${buildBotanicalSageLeafMarkup(28, 368, -68, 0.96, 0.86, 't15LeafDark', '#DCF8A6', 0.92)}
    ${buildBotanicalSageLeafMarkup(46, 354, -92, 0.90, 0.82, 't15LeafDark', '#DCF8A6', 0.88)}
    ${buildBotanicalSageLeafMarkup(18, 392, -38, 1.02, 0.90, 't15LeafDark', '#DCF8A6', 0.92)}

    <!-- Sturdy oak bark tree trunk rooted behind wooden ledge on right wing -->
    <path d="M ${trunkX - 42} ${ledgeY}
      C ${trunkX - 24} ${ledgeY - 18}, ${trunkX - 22} 336, ${trunkX - 20} 266
      C ${trunkX - 18} 214, ${trunkX - 16} 182, ${trunkX - 12} 156
      L ${trunkX + 10} 156
      C ${trunkX + 12} 210, ${trunkX + 15} 288, ${trunkX + 24} 352
      C ${trunkX + 30} 392, ${trunkX + 42} ${ledgeY - 10}, ${trunkX + 52} ${ledgeY}
      Z"
      fill="url(#t15BarkGrad)"/>
    <!-- Bark grain striations -->
    <path d="M ${trunkX - 18} ${ledgeY - 4} Q ${trunkX - 8} 348, ${trunkX - 7} 226" fill="none" stroke="#3A1E0A" stroke-width="1.4" opacity="0.62" stroke-linecap="round"/>
    <path d="M ${trunkX + 4} ${ledgeY - 2} Q ${trunkX + 2} 332, ${trunkX + 1} 204" fill="none" stroke="#9C6636" stroke-width="1.3" opacity="0.52" stroke-linecap="round"/>

    ${grassLeft}
    ${grassRight}

    <!-- Polished wood tabletop ledge along bottom -->
    <rect x="0" y="${ledgeY}" width="${width}" height="24" fill="url(#t15WoodTable)"/>
    <line x1="0" y1="${ledgeY + 1}" x2="${width}" y2="${ledgeY + 1}" stroke="#EAC18A" stroke-width="1.2" opacity="0.72"/>
    <line x1="40" y1="${ledgeY + 9}" x2="290" y2="${ledgeY + 9}" stroke="#683B14" stroke-width="1.0" opacity="0.32"/>
    <line x1="410" y1="${ledgeY + 14}" x2="720" y2="${ledgeY + 14}" stroke="#683B14" stroke-width="1.0" opacity="0.32"/>

    <!-- Golden championship trophy on wooden ledge in bottom-left -->
    ${buildGoldenTrophyCupMarkup(64, ledgeY + 4, 0.95)}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Builds the gently swaying oak canopy with swinging rustic wooden plank tags ("tree tags"),
 * slowly floating gold/green/white balloons ("ballons"), and drifting party blasts ("party blast")
 * for Template 15 (`anniversary-bg15.gif`).
 */
const buildWoodlandTreeTagsFloatingSvg = (
  t: number,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
): Buffer => {
  const tau = 2 * Math.PI * t;

  // 1. Gently swaying oak branches, leafy canopy & hanging wooden value tags
  const treeSway = (Math.sin(tau) * 1.4).toFixed(2);
  const branches = [
    'M 684 186 Q 642 160, 598 142',
    'M 642 162 Q 618 146, 594 128',
    'M 686 176 Q 676 142, 668 112',
    'M 692 178 Q 722 152, 746 134',
    'M 684 226 Q 650 212, 616 206',
    'M 694 232 Q 720 220, 742 214',
  ]
    .map((d) => `<path d="${d}" fill="none" stroke="#643B1A" stroke-width="5.2" stroke-linecap="round"/>`)
    .join('\n      ');

  const canopyLeaves: Array<{
    x: number;
    y: number;
    rot: number;
    sx: number;
    sy: number;
    grad: 't15LeafLime' | 't15LeafRich';
  }> = [
    { x: 602, y: 124, rot: -154, sx: 0.90, sy: 0.82, grad: 't15LeafLime' },
    { x: 594, y: 146, rot: -168, sx: 0.84, sy: 0.78, grad: 't15LeafRich' },
    { x: 626, y: 112, rot: -132, sx: 0.94, sy: 0.86, grad: 't15LeafLime' },
    { x: 654, y: 104, rot: -102, sx: 0.96, sy: 0.88, grad: 't15LeafRich' },
    { x: 682, y: 108, rot: -76, sx: 0.98, sy: 0.88, grad: 't15LeafLime' },
    { x: 708, y: 116, rot: -48, sx: 0.94, sy: 0.86, grad: 't15LeafRich' },
    { x: 734, y: 126, rot: -26, sx: 0.92, sy: 0.84, grad: 't15LeafLime' },
    { x: 744, y: 152, rot: 12, sx: 0.88, sy: 0.80, grad: 't15LeafRich' },
    { x: 642, y: 136, rot: -124, sx: 0.86, sy: 0.78, grad: 't15LeafLime' },
    { x: 672, y: 138, rot: -84, sx: 0.88, sy: 0.80, grad: 't15LeafRich' },
    { x: 716, y: 148, rot: -18, sx: 0.88, sy: 0.80, grad: 't15LeafLime' },
    { x: 608, y: 196, rot: -164, sx: 0.86, sy: 0.78, grad: 't15LeafRich' },
    { x: 738, y: 204, rot: 18, sx: 0.86, sy: 0.78, grad: 't15LeafLime' },
  ];

  // 4 hanging rustic wooden tags gently swinging from tree limbs clear of center copy
  const hangingTags = [
    buildWoodHangingTagMarkup(624, 146, 12, 54, 21, ['Dedication'], Math.sin(tau + 0.3) * 2.8, true),
    buildWoodHangingTagMarkup(716, 152, 13, 56, 22, ['Team', 'Spirit'], Math.sin(tau + 1.8) * 2.8, false),
    buildWoodHangingTagMarkup(634, 208, 12, 52, 22, ['Hard', 'Work'], Math.sin(tau + 3.2) * 3.0, false),
    buildWoodHangingTagMarkup(718, 222, 13, 50, 20, ['Success'], Math.sin(tau + 4.7) * 3.0, false),
  ].join('\n      ');

  const treeAssembly = `<g transform="rotate(${treeSway}, 688, 228)">
      ${branches}
      ${canopyLeaves
        .map((lf) =>
          buildBotanicalSageLeafMarkup(lf.x, lf.y, lf.rot, lf.sx, lf.sy, lf.grad, '#DCF8A6', 0.94),
        )
        .join('\n      ')}
      ${hangingTags}
    </g>`;

  // 2. Glossy gold, emerald-green & pearl-white balloons floating calmly in top sky clear of tree
  const balloons = [
    { bx: 604, by: 48, rx: 16, ry: 20, rot: -10, grad: 't15GoldBalloon', knot: '#B87E12', dx: -6, len: 48, flecks: false, ax: 1.7, ay: 3.0, phase: 0.4 },
    { bx: 652, by: 36, rx: 18, ry: 22, rot: -4, grad: 't15GreenBalloon', knot: '#176E1C', dx: 6, len: 54, flecks: false, ax: 1.9, ay: 3.4, phase: 1.6 },
    { bx: 706, by: 52, rx: 17, ry: 21, rot: 7, grad: 't15GoldBalloon', knot: '#B87E12', dx: 7, len: 52, flecks: false, ax: 1.8, ay: 3.2, phase: 2.8 },
    { bx: 742, by: 84, rx: 14, ry: 17, rot: 10, grad: 't15WhiteBalloon', knot: '#CEDCE6', dx: -4, len: 44, flecks: false, ax: 1.5, ay: 2.8, phase: 4.1 },
    { bx: 204, by: 46, rx: 13, ry: 16, rot: -8, grad: 't15WhiteBalloon', knot: '#CEDCE6', dx: -5, len: 40, flecks: true, ax: 1.5, ay: 2.6, phase: 2.2 },
  ]
    .map((b) => {
      const p = slowFloat(b.bx, b.by, b.ax, b.ay, tau, b.phase);
      const rot = b.rot + Math.sin(tau + b.phase) * 2.4;
      const swayDx = b.dx + Math.sin(tau + b.phase) * 4.5;
      const rim = b.grad === 't15WhiteBalloon' ? 'rgba(164, 186, 206, 0.68)' : undefined;
      return buildFestiveBalloonMarkup(
        p.x,
        p.y,
        b.rx,
        b.ry,
        rot,
        b.grad,
        b.knot,
        swayDx,
        b.len,
        b.flecks,
        'rgba(186, 134, 20, 0.66)',
        rim,
      );
    })
    .join('\n    ');

  // 3. Slowly drifting golden ribbons, 5-point foil stars & confetti party blasts around outer edges
  const ribbonSpecs = [
    { bx: 28, by: 162, rot: -14, scale: 0.72, color: '#D89612', hi: '#FFF0A0', variant: 'sCurl' as const, phase: 0.6 },
    { bx: 36, by: 286, rot: 18, scale: 0.78, color: '#D89612', hi: '#FFF0A0', variant: 'loopCurl' as const, phase: 2.4 },
    { bx: 726, by: 316, rot: -18, scale: 0.78, color: '#3F9E22', hi: '#BDF47C', variant: 'sCurl' as const, phase: 3.9 },
  ]
    .map((s) => {
      const p = slowFloat(s.bx, s.by, 1.6, 2.4, tau, s.phase);
      const rot = s.rot + Math.sin(tau + s.phase) * 7.5;
      return buildCurledStreamerMarkup(p.x, p.y, rot, s.scale, s.color, s.hi, s.variant);
    })
    .join('\n    ');

  const blastItems: Array<{
    bx: number;
    by: number;
    kind: 'star' | 'shard';
    size: number;
    rot: number;
    fill: string;
    phase: number;
  }> = [
    { bx: 256, by: 40, kind: 'star', size: 8.0, rot: 12, fill: '#F3B41C', phase: 0.5 },
    { bx: 288, by: 64, kind: 'shard', size: 7.2, rot: 34, fill: '#D89612', phase: 1.9 },
    { bx: 598, by: 96, kind: 'shard', size: 7.2, rot: -32, fill: '#47A826', phase: 3.1 },
    { bx: 26, by: 228, kind: 'star', size: 7.6, rot: -18, fill: '#F3B41C', phase: 4.3 },
    { bx: 128, by: 348, kind: 'star', size: 8.2, rot: 22, fill: '#F3B41C', phase: 1.4 },
    { bx: 146, by: 382, kind: 'shard', size: 7.4, rot: -26, fill: '#47A826', phase: 2.7 },
    { bx: 616, by: 344, kind: 'star', size: 8.4, rot: -14, fill: '#F3B41C', phase: 0.8 },
    { bx: 648, by: 378, kind: 'shard', size: 7.6, rot: 28, fill: '#D89612', phase: 5.1 },
  ];

  const blastMarkup = blastItems
    .map((b) => {
      const p = slowFloat(b.bx, b.by, 1.5, 2.2, tau, b.phase);
      const rot = b.rot + Math.sin(tau + b.phase) * 8;
      if (b.kind === 'star') {
        return buildPartyStarMarkup(p.x, p.y, b.size, rot, b.fill, '#C6820A', 0.6, 0.95);
      }
      return buildConfettiShardMarkup(p.x, p.y, b.size, b.size * 0.68, rot, b.fill, 0.9);
    })
    .join('\n    ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="t15WoodPlank" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#F6CE86"/>
        <stop offset="50%" stop-color="#DDA656"/>
        <stop offset="100%" stop-color="#BD8138"/>
      </linearGradient>
      <linearGradient id="t15LeafLime" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#D2FA68"/>
        <stop offset="50%" stop-color="#8FD820"/>
        <stop offset="100%" stop-color="#53A00A"/>
      </linearGradient>
      <linearGradient id="t15LeafRich" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#A6E634"/>
        <stop offset="55%" stop-color="#56A810"/>
        <stop offset="100%" stop-color="#2D6E06"/>
      </linearGradient>
      <radialGradient id="t15GreenBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#B8F49C"/>
        <stop offset="28%" stop-color="#36A22E"/>
        <stop offset="72%" stop-color="#1A6E1C"/>
        <stop offset="100%" stop-color="#0E4410"/>
      </radialGradient>
      <radialGradient id="t15GoldBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#FFFCE0"/>
        <stop offset="28%" stop-color="#F7CF58"/>
        <stop offset="72%" stop-color="#CE8C18"/>
        <stop offset="100%" stop-color="#8A5608"/>
      </radialGradient>
      <radialGradient id="t15WhiteBalloon" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="52%" stop-color="#EFF4F8"/>
        <stop offset="86%" stop-color="#CFDCE6"/>
        <stop offset="100%" stop-color="#A8BCCB"/>
      </radialGradient>
    </defs>

    ${treeAssembly}
    ${blastMarkup}
    ${ribbonSpecs}
    ${balloons}
  </svg>`;

  return Buffer.from(svg, 'utf-8');
};

/**
 * Generates the standalone woodland tree with swinging hanging tags, golden trophy, glossy balloons,
 * and slow-floating party blasts Template 15 GIF (`anniversary-bg15.gif`) without employee overlay.
 */
export async function generateWoodlandTreeTagsBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 40,
  frameDelay: number = 110,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildWoodlandTreeTagsBackdropSvg(width, height),
    (t) => buildWoodlandTreeTagsFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone lavender watercolor floral & slowly floating blossoms Template 9 GIF
 * (`anniversary-bg9.gif`) without any employee name, photo, or text overlay.
 */
export async function generateWatercolorFloralBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 36,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildWatercolorFloralBackdropSvg(width, height),
    (t) => buildWatercolorFloralFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone royal purple starry sky, gold gifts & slow-floating balloons Template 8 GIF
 * (`anniversary-bg8.gif`) without any employee name, photo, or text overlay.
 */
export async function generateRoyalPurpleBalloonsBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 36,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildRoyalPurpleBalloonsBackdropSvg(width, height),
    (t) => buildRoyalPurpleBalloonsFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone slow-floating party blast streamers & confetti Template 7 GIF
 * (`anniversary-bg7.gif`) without any employee name, photo, or text overlay.
 */
export async function generatePartyBlastBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 36,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildPartyBlastBackdropSvg(width, height),
    (t) => buildPartyBlastFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone watercolor sage-green botanical leaves Template 6 GIF
 * (`anniversary-bg6.gif`) without any employee name, photo, or text overlay.
 */
export async function generateBotanicalGreenBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 32,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildBotanicalGreenBackdropSvg(width, height),
    (t) => buildBotanicalGreenFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone sunrise cliff & slowly floating sky Template 5 GIF
 * (`anniversary-bg5.gif`) without any employee name, photo, or text overlay.
 */
export async function generateSunriseCliffBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 32,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildSunriseCliffBackdropSvg(width, height),
    (t) => buildSunriseCliffFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone crimson arc & floating gold stars Template 4 GIF
 * (`anniversary-bg4.gif`) without any employee name, photo, or text overlay.
 */
export async function generateCrimsonStarBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 32,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildCrimsonStarBackdropSvg(width, height),
    (t) => buildCrimsonStarFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone purple watercolor & swaying golden botanical Template 3 GIF
 * (`anniversary-bg3.gif`) without any employee name, photo, or text overlay.
 */
export async function generatePurpleGoldBotanicalBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 32,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildPurpleGoldBotanicalBackdropSvg(width, height),
    (t) => buildPurpleGoldBotanicalFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone fireworks & cheering-crowd animated background Template 2 GIF
 * (`anniversary-bg2.gif`) without any employee name or text overlay.
 */
export async function generateCrowdFireworksBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 32,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildCrowdFireworksBackdropSvg(width, height),
    (t) => buildCrowdFireworksFloatingSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

/**
 * Generates the standalone luxury gold-and-navy animated background template GIF
 * (without any employee name, photo, or text overlay) and returns its buffer.
 * Optionally persists it to `outputPath`.
 */
export async function generateLuxuryBackgroundTemplateGif(
  outputPath?: string,
  width: number = GIF_WIDTH,
  height: number = GIF_HEIGHT,
  totalFrames: number = 32,
  frameDelay: number = 100,
): Promise<Buffer> {
  return renderAnimatedTemplateGif(
    buildLuxuryBackdropSvg(width, height),
    (t) => buildFloatingElementsSvg(t, width, height),
    outputPath,
    width,
    height,
    totalFrames,
    frameDelay,
  );
}

const TEMPLATE_SYNTHESIS_MAP: Record<
  number,
  {
    backdrop: (width: number, height: number) => Buffer;
    floating: (t: number, width: number, height: number) => Buffer;
    isDarkBackdrop?: boolean;
    totalFrames?: number;
    frameDelay?: number;
  }
> = {
  1: { backdrop: buildLuxuryBackdropSvg, floating: buildFloatingElementsSvg },
  2: { backdrop: buildCrowdFireworksBackdropSvg, floating: buildCrowdFireworksFloatingSvg },
  3: { backdrop: buildPurpleGoldBotanicalBackdropSvg, floating: buildPurpleGoldBotanicalFloatingSvg },
  4: { backdrop: buildCrimsonStarBackdropSvg, floating: buildCrimsonStarFloatingSvg },
  5: { backdrop: buildSunriseCliffBackdropSvg, floating: buildSunriseCliffFloatingSvg },
  6: { backdrop: buildBotanicalGreenBackdropSvg, floating: buildBotanicalGreenFloatingSvg },
  7: { backdrop: buildPartyBlastBackdropSvg, floating: buildPartyBlastFloatingSvg, totalFrames: 36, frameDelay: 100 },
  8: {
    backdrop: buildRoyalPurpleBalloonsBackdropSvg,
    floating: buildRoyalPurpleBalloonsFloatingSvg,
    isDarkBackdrop: true,
    totalFrames: 36,
    frameDelay: 100,
  },
  9: {
    backdrop: buildWatercolorFloralBackdropSvg,
    floating: buildWatercolorFloralFloatingSvg,
    totalFrames: 36,
    frameDelay: 100,
  },
  10: {
    backdrop: buildStageCurtainSpotlightBackdropSvg,
    floating: buildStageCurtainSpotlightFloatingSvg,
    isDarkBackdrop: true,
    totalFrames: 40,
    frameDelay: 110,
  },
  11: {
    backdrop: buildPurpleCrowdStarsBackdropSvg,
    floating: buildPurpleCrowdStarsFloatingSvg,
    isDarkBackdrop: true,
    totalFrames: 40,
    frameDelay: 110,
  },
  12: {
    backdrop: buildSpringTreePartyBackdropSvg,
    floating: buildSpringTreePartyFloatingSvg,
    totalFrames: 40,
    frameDelay: 110,
  },
  13: {
    backdrop: buildSkyMeadowTreeBalloonsBackdropSvg,
    floating: buildSkyMeadowTreeBalloonsFloatingSvg,
    totalFrames: 40,
    frameDelay: 110,
  },
  14: {
    backdrop: buildLavenderCornerFloralFrameBackdropSvg,
    floating: buildLavenderCornerFloralFrameFloatingSvg,
    totalFrames: 40,
    frameDelay: 110,
  },
  15: {
    backdrop: buildWoodlandTreeTagsBackdropSvg,
    floating: buildWoodlandTreeTagsFloatingSvg,
    totalFrames: 40,
    frameDelay: 110,
  },
};

const resolveTemplateIndexFromPath = (gifSourcePath?: string): number => {
  if (!gifSourcePath) return 1;
  const match = /(?:^|[-_])bg(\d*)\./i.exec(path.basename(gifSourcePath));
  if (!match) return 1;
  return match[1] ? Math.max(1, parseInt(match[1], 10)) : 1;
};

/**
 * Builds a fresh combined animated GIF banner every call (no cache).
 * Uses the animated background template at `gifSourcePath` when available
 * (or renders the matching luxury animated backdrop directly), then composites
 * the dynamic Worksphere logo, circular gold-framed profile portrait, and dynamic milestone text.
 *
 * @param params - dynamic parameters for the employee
 * @returns AnniversaryGifResult with in-memory buffer + base64 (filePath empty)
 */
export async function generateAnniversaryBannerGif(
  params: AnniversaryGifParams,
): Promise<AnniversaryGifResult> {
  const {
    name,
    years,
    designation,
    gifSourcePath,
    photoBuffer,
    logoPath,
  } = params;

  // Always rebuild (no memory/disk cache) — same fresh-build approach as birthday mail
  const safeYears = Math.max(1, years || 1);
  const resolvedTemplateIndex = resolveTemplateIndexFromPath(gifSourcePath);
  const resolvedSourcePath = (gifSourcePath && fs.existsSync(gifSourcePath))
    ? gifSourcePath
    : getAnniversaryTemplatePath(resolvedTemplateIndex);
  const templateSynth = TEMPLATE_SYNTHESIS_MAP[resolvedTemplateIndex] || TEMPLATE_SYNTHESIS_MAP[1];
  const hasPhoto = !!(photoBuffer && photoBuffer.length > 0);
  const resolvedDesignation = designation || DEFAULT_DESIGNATION;

  // Inspect source animated GIF dimensions & frame timing from template on disk
  const hasSourceBg = Boolean(resolvedSourcePath && fs.existsSync(resolvedSourcePath));
  const sourceBuffer = hasSourceBg ? fs.readFileSync(resolvedSourcePath) : null;
  const sourceMeta = sourceBuffer
    ? await getSharp(sourceBuffer, { animated: true }).metadata()
    : null;

  const width: number = sourceMeta?.width || GIF_WIDTH;
  const synthFrames: number = templateSynth.totalFrames || 32;
  const srcFrames: number = sourceBuffer ? Math.max(1, sourceMeta?.pages || 1) : synthFrames;
  const height: number =
    sourceMeta?.pageHeight ||
    (sourceMeta?.height && sourceMeta.pages
      ? Math.floor(sourceMeta.height / sourceMeta.pages)
      : GIF_HEIGHT);
  const frameDelay: number =
    Array.isArray(sourceMeta?.delay) && sourceMeta.delay[0] > 0
      ? sourceMeta.delay[0]
      : templateSynth.frameDelay || 100;
  const ordinal = `${safeYears}${getOrdinalSuffix(safeYears)}`;

  // 3. Unified full-content overlay across ALL background templates (InvenTech top-left wordmark logo, circular photo, hero, ribbon, copy, quote)
  const logoData = await prepareCompanyLogo(logoPath, 136);
  const logoX = 28;
  const logoY = 21;

  // Prepare circular portrait avatar (166×166, +8% larger portrait)
  const avatarSize = 166;
  const circleCenterX = 154;
  const avatarY = Math.round(height * 0.193);
  const avatarX = Math.round(circleCenterX - avatarSize / 2);
  let circularAvatarBuffer: Buffer | null = null;

  if (hasPhoto && photoBuffer) {
    try {
      circularAvatarBuffer = await prepareOvalAvatar(
        photoBuffer,
        avatarSize,
        avatarSize,
      );
    } catch {
      circularAvatarBuffer = null;
    }
  }

  const foregroundSvgBuffer = buildCenteredAnniversarySvg(
    name,
    ordinal,
    safeYears,
    resolvedDesignation,
    !!circularAvatarBuffer,
    !!logoData,
    logoData?.width || 126,
    logoData?.height || 41,
    logoY,
    avatarSize,
    avatarSize,
    avatarY,
    circleCenterX,
    width,
    height,
    Boolean(templateSynth.isDarkBackdrop),
  );

  const staticForegroundParts: Array<{ input: Buffer; top: number; left: number }> = [];
  if (logoData) {
    if (templateSynth.isDarkBackdrop) {
      // Crisp letter-hugging white outer aura on dark backdrops so original blue InvenTech logo stays sharp without any card
      const pad = 7;
      const paddedAlpha = await getSharp(logoData.buffer)
        .ensureAlpha()
        .extend({
          top: pad,
          bottom: pad,
          left: pad,
          right: pad,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extractChannel('alpha')
        .blur(2.0)
        .linear(5.2, 0)
        .toBuffer();
      const whiteAura = await getSharp({
        create: {
          width: logoData.width + pad * 2,
          height: logoData.height + pad * 2,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .joinChannel(paddedAlpha)
        .png()
        .toBuffer();
      staticForegroundParts.push({ input: whiteAura, top: logoY - pad, left: logoX - pad });
    }
    staticForegroundParts.push({ input: logoData.buffer, top: logoY, left: logoX });
  }
  if (circularAvatarBuffer) {
    staticForegroundParts.push({
      input: circularAvatarBuffer,
      top: avatarY,
      left: avatarX,
    });
  }
  const foregroundLayerBuffer: Buffer =
    staticForegroundParts.length > 0
      ? await getSharp(foregroundSvgBuffer).composite(staticForegroundParts).png().toBuffer()
      : await getSharp(foregroundSvgBuffer).png().toBuffer();

  // 4. Composite onto each animated frame from source GIF (or synthesize matching animated backdrop)
  const encoder = new getGifEncoder(width, height, 'octree', false);
  encoder.setRepeat(0);
  encoder.setDelay(frameDelay);
  encoder.start();

  if (sourceBuffer && srcFrames >= 1) {
    for (let i = 0; i < srcFrames; i++) {
      const frameRaw = await getSharp(sourceBuffer, { page: i })
        .ensureAlpha()
        .composite([{ input: foregroundLayerBuffer, top: 0, left: 0 }])
        .raw()
        .toBuffer({ resolveWithObject: true });

      encoder.addFrame(frameRaw.data);
    }
  } else {
    const backdropSvg = templateSynth.backdrop(width, height);
    const backdropBuffer = await getSharp(backdropSvg).png().toBuffer();

    for (let i = 0; i < synthFrames; i++) {
      const t = i / synthFrames;
      const floatingLayer = templateSynth.floating(t, width, height);
      const frameRaw = await getSharp(backdropBuffer)
        .composite([
          { input: floatingLayer, top: 0, left: 0 },
          { input: foregroundLayerBuffer, top: 0, left: 0 },
        ])
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      encoder.addFrame(frameRaw.data);
    }
  }

  encoder.finish();
  const buffer: Buffer = (encoder as any).out.getData();

  return {
    buffer,
    filePath: '',
    base64: buffer.toString('base64'),
  };
}
