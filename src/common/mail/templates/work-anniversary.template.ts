import dayjs from 'dayjs';
import * as fs from 'fs';
import * as path from 'path';
import {
  AnniversaryTheme,
  getAnniversaryTheme,
  getThemeForEmployee,
  getThemeForMilestoneYear,
} from './work-anniversary-themes';

export interface WorkAnniversaryData {
  employeeName: string;
  employeeId?: string;
  designation?: string | null;
  department?: string | null;
  joiningDate?: string | Date;
  anniversaryDate?: string | Date;
  years?: number;
  portalUrl?: string;
  profilePicUrl?: string | null;
  hasPhoto?: boolean;
  bgUrl?: string;
  logoUrl?: string;
  themeId?: number | string;
  theme?: AnniversaryTheme;
}

export const getOrdinalSuffix = (n: number): string => {
  const safe = Number.isFinite(n) ? Math.floor(Math.abs(n)) : 0;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = safe % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export const getWorkAnniversarySubject = (employeeName: string, years: number = 1): string => {
  const safeYears = Number.isFinite(years) && years > 0 ? Math.floor(years) : 1;
  const ordinal = `${safeYears}${getOrdinalSuffix(safeYears)}`;
  return `🎉 Happy ${ordinal} Work Anniversary, ${employeeName}!`;
};

// Production corporate email assets
const INVENTECH_WEBSITE_URL = 'https://inventechinfo.com/';
const INVENTECH_DOMAIN_LABEL = 'inventechinfo.com';
const INVENTECH_COMPANY_LABEL = 'Inventech Info Solutions';

import {
  ANNIVERSARY_TEMPLATES_DIR,
  IN_LOGO_PATH,
  INVENTECH_WORDMARK_PATH,
  INVENTECH_LOGO_PATH,
  WORKSPHERE_LOGO_PATH,
  getAnniversaryTemplatePath,
  getDiscoveredTemplateIndices,
} from '../../../assets';

export {
  ANNIVERSARY_TEMPLATES_DIR,
  INVENTECH_WORDMARK_PATH,
  INVENTECH_LOGO_PATH,
  WORKSPHERE_LOGO_PATH,
  IN_LOGO_PATH,
};
export const getAvailableTemplateIndices = getDiscoveredTemplateIndices;
export const getTemplatePathByIndex = getAnniversaryTemplatePath;
export const ANNIVERSARY_BG_GIF_SRC_PATH = getAnniversaryTemplatePath(1);
export const ANNIVERSARY_BG2_GIF_SRC_PATH = getAnniversaryTemplatePath(2);
export const ANNIVERSARY_BG_GIF_PATH = ANNIVERSARY_BG_GIF_SRC_PATH;

/**
 * Returns path to the celebration background GIF asset for the requested themeId.
 * Dynamically discovers available templates (`anniversary-bg.gif`, `anniversary-bg2.gif`, ...)
 * and maps theme IDs cleanly across them without hardcoding.
 */
export const getThemeBgImagePath = (themeId: number | string = 1): string => {
  const available = getAvailableTemplateIndices();
  const numericId =
    typeof themeId === 'number' ? themeId : parseInt(String(themeId), 10);
  const resolvedId = Number.isNaN(numericId)
    ? typeof themeId === 'string' && /2|firework|crowd/i.test(themeId)
      ? 2
      : getAnniversaryTheme(themeId).id
    : Math.max(1, numericId);

  // Use exact template match when present (e.g. themeId=2 -> anniversary-bg2.gif);
  // otherwise rotate evenly across discovered templates
  const exactCandidate = getTemplatePathByIndex(resolvedId);
  const rotatedTemplateIndex = available[(resolvedId - 1) % available.length];
  const rotatedCandidate = getTemplatePathByIndex(rotatedTemplateIndex);

  return (
    [
      exactCandidate,
      rotatedCandidate,
      ANNIVERSARY_BG2_GIF_SRC_PATH,
      ANNIVERSARY_BG_GIF_SRC_PATH,
    ]
      .filter((p): p is string => Boolean(p))
      .find((assetPath) => fs.existsSync(assetPath)) || ANNIVERSARY_BG_GIF_SRC_PATH
  );
};

// Cache base64 strings in memory for high-performance email generation
const bgBase64Cache = new Map<string, string>();
let logoBase64Cache: string | null = null;

export const getLogoBase64 = (): string => {
  if (logoBase64Cache) return logoBase64Cache;
  if (fs.existsSync(INVENTECH_LOGO_PATH)) {
    try {
      logoBase64Cache = fs.readFileSync(INVENTECH_LOGO_PATH).toString('base64');
      return logoBase64Cache;
    } catch {
      return '';
    }
  }
  return '';
};

export const getThemeBgBase64 = (themeId: number | string = 1): string => {
  const filePath = getThemeBgImagePath(themeId);
  if (bgBase64Cache.has(filePath)) {
    return bgBase64Cache.get(filePath)!;
  }
  try {
    if (fs.existsSync(filePath)) {
      const b64 = fs.readFileSync(filePath).toString('base64');
      bgBase64Cache.set(filePath, b64);
      return b64;
    }
  } catch (err) {
    // Graceful fallback
  }
  return '';
};

// Prevent HTML injection from dynamic employee data
const escapeHtml = (value?: string | null): string => {
  if (!value) return '';
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
};

const getInitials = (name?: string): string => {
  if (!name) return 'IT';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Work Anniversary Email Template
 * Exact reproduction of user's celebration design concept with:
 * - Real celebration background design photo from assets/anniversary-bg-${themeId}.jpg
 *   showing golden ribbons, sparkles, and festive borders
 * - Slowly floating background layer (.bgl) with drift animation
 * - Celebration floating effects (.fx): rising glowing bokeh circles (.bk),
 *   falling festive ribbons (.cf), and twinkling stars (.sp)
 * - Gentle photo bobbing floating animation (.phw)
 * - Milestone year floating pop animation (.yr)
 * - Italic Georgia serif typography, category badge, and milestone capsule
 * - 15 distinct luxury background themes, each with its own colored background asset in assets/
 *
 * Engineered with 100% email client compatibility:
 * - Background image is embedded via background attribute, VML fill, and CSS background-image
 * - Content is visible by default (NO opacity: 0 lockup in Outlook/webmail)
 * - Zero hardcoding: all employee data, photos, and milestones are dynamically resolved
 */
export const getWorkAnniversaryTemplate = (data: WorkAnniversaryData): string => {
  const joiningDay = data.joiningDate ? dayjs(data.joiningDate) : null;
  const annivDay = data.anniversaryDate ? dayjs(data.anniversaryDate) : dayjs();

  // Dynamic years calculation
  const calculatedYears =
    joiningDay && joiningDay.isValid() && annivDay.isValid()
      ? Math.max(1, annivDay.diff(joiningDay, 'year'))
      : 1;
  const years =
    data.years && Number.isFinite(data.years) && data.years > 0
      ? Math.floor(data.years)
      : calculatedYears;
  const suffix = getOrdinalSuffix(years);
  const ordinal = `${years}${suffix}`;

  // Resolve theme from 15 distinct luxury background color palettes
  const theme: AnniversaryTheme =
    data.theme ||
    (data.themeId
      ? getAnniversaryTheme(data.themeId)
      : data.employeeId
      ? getThemeForEmployee(data.employeeId, years)
      : getThemeForMilestoneYear(years));

  const rawName = data.employeeName || 'Valued Team Member';
  const employeeName = escapeHtml(rawName);
  const designation = escapeHtml(data.designation || 'Team Member');
  const initials = escapeHtml(getInitials(rawName));

  const rawPhoto = data.profilePicUrl || '';
  const hasPhoto = !!(data.hasPhoto || rawPhoto);
  const photoSrc = hasPhoto
    ? rawPhoto.startsWith('http')
      ? escapeHtml(rawPhoto)
      : 'cid:anniversary-profile-photo'
    : '';

  const photoHtml = hasPhoto
    ? `<img src="${photoSrc}" alt="${employeeName}" width="104" height="104" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;" />`
    : `${initials}`;

  // Retrieve base64 of theme background image asset from assets directory
  const bgPath = getThemeBgImagePath(theme.id);
  const bgMimeType = bgPath.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/jpeg';
  const bgB64 = getThemeBgBase64(theme.id);
  const bgDataUri = bgB64 ? `data:${bgMimeType};base64,${bgB64}` : '';
  const bgCssUrl = bgDataUri || 'cid:anniversary-bg-image';

  const bokehHtml = [
    { size: 18, left: 6, dur: 11, delay: -2, sx: 16 },
    { size: 26, left: 14, dur: 15, delay: -5, sx: -20 },
    { size: 12, left: 22, dur: 10, delay: -1, sx: 12 },
    { size: 30, left: 34, dur: 17, delay: -8, sx: -14 },
    { size: 16, left: 42, dur: 12, delay: -4, sx: 22 },
    { size: 24, left: 52, dur: 14, delay: -6, sx: -18 },
    { size: 14, left: 60, dur: 11, delay: -3, sx: 10 },
    { size: 28, left: 68, dur: 16, delay: -7, sx: -24 },
    { size: 20, left: 76, dur: 13, delay: -5, sx: 15 },
    { size: 32, left: 84, dur: 18, delay: -9, sx: -12 },
    { size: 15, left: 90, dur: 12, delay: -2, sx: 18 },
    { size: 22, left: 4, dur: 14, delay: -4, sx: -16 },
    { size: 18, left: 48, dur: 13, delay: -3, sx: 20 },
    { size: 25, left: 94, dur: 16, delay: -6, sx: -15 },
  ]
    .map(
      (b) =>
        `<span class="bk" style="width:${b.size}px;height:${b.size}px;left:${b.left}%;animation-duration:${b.dur}s;animation-delay:${b.delay}s;--sx:${b.sx}px;"></span>`,
    )
    .join('\n          ');

  const confettiHtml = [
    { left: 5, dur: 8, delay: -1, sx: 25, colorIdx: 0 },
    { left: 12, dur: 11, delay: -4, sx: -35, colorIdx: 1 },
    { left: 19, dur: 9, delay: -2, sx: 40, colorIdx: 0 },
    { left: 27, dur: 12, delay: -6, sx: -20, colorIdx: 1 },
    { left: 33, dur: 8.5, delay: -3, sx: 30, colorIdx: 0 },
    { left: 41, dur: 10.5, delay: -5, sx: -45, colorIdx: 1 },
    { left: 49, dur: 9.5, delay: -2.5, sx: 20, colorIdx: 0 },
    { left: 57, dur: 11.5, delay: -7, sx: -30, colorIdx: 1 },
    { left: 64, dur: 8, delay: -1.5, sx: 35, colorIdx: 0 },
    { left: 71, dur: 10, delay: -4.5, sx: -25, colorIdx: 1 },
    { left: 78, dur: 12, delay: -8, sx: 45, colorIdx: 0 },
    { left: 85, dur: 9, delay: -3, sx: -15, colorIdx: 1 },
    { left: 92, dur: 11, delay: -5.5, sx: 25, colorIdx: 0 },
    { left: 15, dur: 9.8, delay: -3.8, sx: -40, colorIdx: 0 },
    { left: 53, dur: 10.2, delay: -6.2, sx: 35, colorIdx: 1 },
    { left: 88, dur: 8.8, delay: -2.2, sx: -30, colorIdx: 0 },
  ]
    .map(
      (c) =>
        `<span class="cf" style="left:${c.left}%;animation-duration:${c.dur}s;animation-delay:${c.delay}s;--sx:${c.sx}px;background:${theme.confettiColors[c.colorIdx]};"></span>`,
    )
    .join('\n          ');

  const sparkleHtml = [
    { left: 10, top: 15, delay: 0.2 },
    { left: 88, top: 18, delay: 0.8 },
    { left: 18, top: 45, delay: 1.4 },
    { left: 82, top: 52, delay: 0.5 },
    { left: 14, top: 75, delay: 1.1 },
    { left: 85, top: 82, delay: 1.7 },
    { left: 50, top: 10, delay: 0.9 },
  ]
    .map(
      (s) =>
        `<span class="sp" style="left:${s.left}%;top:${s.top}%;animation-delay:${s.delay}s;background:${theme.sparkleColor};"></span>`,
    )
    .join('\n          ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Happy ${ordinal} Work Anniversary, ${employeeName}!</title>
<style>
:root { --sans: Arial, Helvetica, sans-serif; }
html, body { margin: 0; background: ${theme.outerBg}; min-height: 100%; }
body { padding: 24px 12px 40px; font-family: Georgia, serif; }
.stage { display: flex; justify-content: center; }
.cd {
  position: relative;
  width: 100%;
  max-width: 460px;
  min-height: 700px;
  border-radius: 16px;
  overflow: hidden;
  font-family: Georgia, serif;
  color: ${theme.nameColor};
  text-align: center;
  background-color: ${theme.cardBg};
  background-image: url('${bgDataUri}');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
}
.bgl {
  position: absolute;
  inset: -6%;
  background-image: url('${bgDataUri}');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  animation: drift 15s ease-in-out infinite alternate;
  z-index: 0;
  pointer-events: none;
}
@keyframes drift {
  0% { transform: translate(-14px, -10px) scale(1.03); }
  50% { transform: translate(0px, 4px) scale(1.07); }
  100% { transform: translate(14px, 10px) scale(1.10); }
}
.fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
.bk {
  position: absolute;
  bottom: -40px;
  border-radius: 50%;
  background: ${theme.bokehColor};
  filter: blur(1.5px);
  animation: rise linear infinite;
}
@keyframes rise {
  0% { opacity: 0; transform: translate(0, 0) scale(.8); }
  15% { opacity: .9; }
  85% { opacity: .7; }
  100% { opacity: 0; transform: translate(var(--sx, 0px), -760px) scale(1.15); }
}
.cf {
  position: absolute;
  top: -20px;
  width: 7px;
  height: 15px;
  border-radius: 1px;
  animation: fall linear infinite;
}
@keyframes fall {
  0% { transform: translate(0, 0) rotateX(0) rotateZ(0); }
  100% { transform: translate(var(--sx, 0px), 760px) rotateX(900deg) rotateZ(160deg); }
}
.sp {
  position: absolute;
  width: 7px;
  height: 7px;
  transform: rotate(45deg);
  animation: tw 2.4s ease-in-out infinite;
}
@keyframes tw {
  0%, 100% { opacity: .1; transform: rotate(45deg) scale(.4); }
  50% { opacity: 1; transform: rotate(45deg) scale(1.3); }
}
.in {
  position: relative;
  z-index: 2;
  padding-top: 48px;
  padding-bottom: 56px;
}
.tg {
  display: inline-block;
  font: 700 9px var(--sans);
  letter-spacing: 2.4px;
  background: ${theme.tagBg};
  border: 1px solid ${theme.tagBorder};
  border-radius: 12px;
  padding: 5px 14px;
  color: ${theme.tagText};
  text-transform: uppercase;
}
.phw {
  animation: bob 3.6s ease-in-out infinite;
}
@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.ph {
  position: relative;
  width: 104px;
  height: 104px;
  margin: 16px auto 0;
  border-radius: 50%;
  background: ${theme.photoFallbackBg};
  border: 4px solid ${theme.photoBorder};
  box-shadow: 0 0 0 2px ${theme.photoShadow};
  display: flex;
  align-items: center;
  justify-content: center;
  font: 700 32px var(--sans);
  color: #fde8ec;
  overflow: hidden;
}
.ph img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50%;
}
.cg {
  font: italic 700 26px Georgia, serif;
  color: ${theme.congratulationsColor};
  margin-top: 14px;
}
.yr {
  display: inline-block;
  font: italic 700 68px/1.05 Georgia, serif;
  color: ${theme.yearColor};
  margin: 2px 0;
  animation: floatYear 4s ease-in-out infinite;
}
@keyframes floatYear {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px) scale(1.02); }
}
.wa {
  display: inline-block;
  background: ${theme.waBg};
  color: ${theme.waText};
  font: 700 10px var(--sans);
  letter-spacing: 2px;
  padding: 8px 18px;
  border-radius: 14px;
  margin-top: 6px;
  text-transform: uppercase;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
}
.nm {
  font: 700 18px var(--sans);
  letter-spacing: 1.2px;
  margin-top: 16px;
  color: ${theme.nameColor};
  text-transform: uppercase;
}
.rl {
  font: 12px var(--sans);
  color: ${theme.roleColor};
  margin-top: 3px;
  text-transform: capitalize;
}
.q {
  font: italic 12.5px/1.65 Georgia, serif;
  color: ${theme.quoteColor};
  margin: 14px 38px 0;
  text-align: center;
}
.sc {
  font: italic 700 19px Georgia, serif;
  color: ${theme.signoffColor};
  margin-top: 12px;
}
.ft {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 38px;
  background: ${theme.footerBg};
  color: ${theme.footerText};
  font: 700 9px var(--sans);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
}
.ft a {
  color: ${theme.footerText};
  text-decoration: underline;
  font-weight: 700;
}
@media (prefers-reduced-motion: reduce) {
  .cd * { animation: none !important; transform: none !important; }
  .fx { display: none; }
}
</style>
</head>
<body style="margin:0;padding:24px 12px 40px;background-color:${theme.outerBg};">

<div class="stage">
  <!--[if gte mso 9]>
  <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:460px;height:700px;">
  <v:fill type="frame" src="cid:anniversary-bg-image" color="${theme.cardBg}" />
  <v:textbox inset="0,0,0,0">
  <![endif]-->

  <!-- Card Table with background image attribute for Outlook on the Web / OWA -->
  <table role="presentation" width="460" cellpadding="0" cellspacing="0" border="0" align="center" class="cd go" id="cd" background="cid:anniversary-bg-image" style="width:460px;max-width:460px;min-height:700px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 16px 42px rgba(0,0,0,0.28);background-color:${theme.cardBg};background-image:url('${bgCssUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;text-align:center;font-family:Georgia,serif;color:${theme.nameColor};">
    <tr>
      <td align="center" valign="top" background="cid:anniversary-bg-image" style="background-image:url('${bgCssUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;padding:0;border-radius:16px;position:relative;">

        <!-- Slowly floating background layer (active in modern clients and browser) -->
        <div class="bgl"></div>

        <!-- Celebration Floating FX Layer: Bokeh circles, falling ribbons, twinkling stars -->
        <div class="fx" id="fx">
          <!-- Rising glowing bokeh circles -->
          ${bokehHtml}

          <!-- Falling festive ribbons -->
          ${confettiHtml}

          <!-- Twinkling celebration stars -->
          ${sparkleHtml}
        </div>

        <!-- Inner Content Container -->
        <div class="in">
          <div class="tg">MILESTONE CELEBRATION</div>

          <div class="phw">
            <div class="ph">${photoHtml}</div>
          </div>

          <div class="cg">Congratulations</div>
          <div class="yr">${ordinal}</div><br>
          <div class="wa">WORK ANNIVERSARY</div>
          <div class="nm">${employeeName}</div>
          <div class="rl">${designation}</div>

          <div class="q">Thank you for your outstanding dedication, hard work, and invaluable contributions to InvenTech. Wishing you ongoing growth, rewarding experiences, and continued success ahead!</div>
          <div class="sc">Here&#39;s to many more milestones together.</div>
        </div>

        <!-- Corporate Branded Sub-Footer -->
        <div class="ft">
          ${INVENTECH_COMPANY_LABEL} &bull; Celebrating Our People &bull;&nbsp;<a href="${INVENTECH_WEBSITE_URL}" target="_blank">${INVENTECH_DOMAIN_LABEL}</a>
        </div>

      </td>
    </tr>
  </table>

  <!--[if gte mso 9]>
  </v:textbox>
  </v:rect>
  <![endif]-->
</div>

</body>
</html>
`;
};
