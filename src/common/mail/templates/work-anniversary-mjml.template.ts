import mjml2html from 'mjml';
import dayjs from 'dayjs';
import {
  WorkAnniversaryData,
  getOrdinalSuffix,
} from './work-anniversary.template';

const INVENTECH_WEBSITE_URL = 'https://inventechinfo.com/';
const INVENTECH_DOMAIN_LABEL = 'inventechinfo.com';
const INVENTECH_LEGAL_NAME = 'InvenTech Info Solutions Pvt. Ltd.';
const DEFAULT_BANNER_SRC = 'cid:anniversary-banner';
const EMAIL_CONTAINER_WIDTH_PX = 600;

const EMAIL_PALETTE = {
  pageBg: '#FFFFFF',
  cardBg: '#FFFFFF',
  cardBorder: '#EAE5D9',
  footerText: '#8A94A6',
  footerLink: '#8B6914',
} as const;

const LAYOUT_SPACING = {
  outerPad: '8px',
  bannerBottomGap: '4px',
  footerTopGap: '4px',
  footerBottomPad: '8px',
} as const;

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

/**
 * Resolves shared dynamic display context for both MJML and HTML fallback templates.
 */
const resolveAnniversaryContext = (data: WorkAnniversaryData) => {
  const joiningDay = data.joiningDate ? dayjs(data.joiningDate) : null;
  const annivDay = data.anniversaryDate ? dayjs(data.anniversaryDate) : dayjs();

  const calculatedYears =
    joiningDay && joiningDay.isValid() && annivDay.isValid()
      ? Math.max(1, annivDay.diff(joiningDay, 'year'))
      : 1;
  const years =
    data.years && Number.isFinite(data.years) && data.years > 0
      ? Math.floor(data.years)
      : calculatedYears;
  const ordinal = `${years}${getOrdinalSuffix(years)}`;
  const employeeName = escapeHtml(data.employeeName || 'Valued Team Member');
  const currentYear = new Date().getFullYear();
  const bannerSrc = escapeHtml(data.bgUrl || DEFAULT_BANNER_SRC);
  const titleText = `Happy ${ordinal} Work Anniversary, ${employeeName}!`;
  const footerHtml = `&copy; ${currentYear} ${INVENTECH_LEGAL_NAME} &bull; <a href="${INVENTECH_WEBSITE_URL}" target="_blank" style="color:${EMAIL_PALETTE.footerLink};text-decoration:underline;font-weight:600;">${INVENTECH_DOMAIN_LABEL}</a>`;

  return { years, ordinal, employeeName, currentYear, bannerSrc, titleText, footerHtml };
};

/**
 * Builds the Work Anniversary email template.
 *
 * ═══════════════════════════════════════════════════════
 * SINGLE COMBINED ANIMATED GIF DESIGN
 * ═══════════════════════════════════════════════════════
 *
 * All anniversary content (milestone, congratulations, employee name,
 * designation, and celebration message) is baked directly into the
 * animated anniversary GIF banner.
 *
 * In Outlook Web App (OWA), Gmail, Apple Mail, and modern clients:
 *   → The animated GIF plays inline via <img src="cid:anniversary-banner">.
 *
 * In classic Outlook Desktop (Word-engine):
 *   → Displays the first frame of the GIF (containing the full baked text)
 *     as the static fallback.
 *
 * Zero duplicate content, zero separate cards, zero CSS background hacks.
 */
const buildMjmlFromContext = (
  ctx: ReturnType<typeof resolveAnniversaryContext>,
): string => {
  const { bannerSrc, titleText, footerHtml } = ctx;

  return `<mjml>
<mj-head>
<mj-title>${titleText}</mj-title>
<mj-preview>🎉 ${titleText} Celebrating your milestone with InvenTech.</mj-preview>
<mj-attributes>
<mj-all font-family="'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" padding="0px" />
<mj-text font-size="12px" color="#64748B" line-height="1.5" padding="0" />
<mj-section padding="0px" />
</mj-attributes>
<mj-style>
body { background-color: ${EMAIL_PALETTE.pageBg} !important; margin: 0; padding: 0; }
.banner-card {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06) !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  border: 1px solid ${EMAIL_PALETTE.cardBorder} !important;
  background-color: ${EMAIL_PALETTE.cardBg} !important;
}
/* Suppress Outlook Joyful Animations / mark.js highlights */
[data-markjs="true"], span[data-markjs="true"],
button[class*="JoyfulAnimation"], .ms-JoyfulAnimations-button {
  background: transparent !important;
  color: inherit !important;
  box-shadow: none !important;
  border: none !important;
}
/* Suppress Gmail download button overlay */
.a5q, .a6o, [role="button"][aria-label*="Download"] {
  display: none !important;
  opacity: 0 !important;
}
</mj-style>
</mj-head>

<mj-body background-color="${EMAIL_PALETTE.pageBg}" width="${EMAIL_CONTAINER_WIDTH_PX}px">

<!-- ── COMBINED ANNIVERSARY CARD ── -->
<mj-section padding="${LAYOUT_SPACING.outerPad}">
<mj-column width="${EMAIL_CONTAINER_WIDTH_PX}px" css-class="banner-card">
<mj-image
  src="${bannerSrc}"
  alt="${titleText}"
  width="${EMAIL_CONTAINER_WIDTH_PX}px"
  border="0"
  border-radius="12px"
  padding="0"
  fluid-on-mobile="true"
/>
</mj-column>
</mj-section>

</mjml>`;
};

export const buildWorkAnniversaryMjml = (data: WorkAnniversaryData): string =>
  buildMjmlFromContext(resolveAnniversaryContext(data));

/**
 * Compiles the MJML template into production-ready HTML email.
 */
export const getWorkAnniversaryTemplateMjml = async (data: WorkAnniversaryData): Promise<string> => {
  const ctx = resolveAnniversaryContext(data);
  const mjmlContent = buildMjmlFromContext(ctx);
  try {
    const result = await mjml2html(mjmlContent, {
      validationLevel: 'soft',
      minify: false,
    });
    if (result && result.html) {
      return result.html;
    }
  } catch (err) {
    // If MJML parsing fails, return clean HTML fallback
  }

  // Pure HTML fallback in case MJML parser throws
  const { bannerSrc, titleText } = ctx;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titleText}</title>
<style>
body { margin: 0; padding: 0; background-color: ${EMAIL_PALETTE.pageBg}; font-family: Arial, sans-serif; }
table { border-collapse: collapse; }
img { display: block; border: 0; max-width: 100%; height: auto; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_PALETTE.pageBg};">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_PALETTE.pageBg};">
  <tr>
    <td align="center" style="padding:${LAYOUT_SPACING.outerPad};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:${EMAIL_CONTAINER_WIDTH_PX}px;background-color:${EMAIL_PALETTE.cardBg};border-radius:12px;overflow:hidden;border:1px solid ${EMAIL_PALETTE.cardBorder};box-shadow:0 4px 20px rgba(0,0,0,0.06);">
        <tr>
          <td align="center" style="padding:0;line-height:0;">
            <img src="${bannerSrc}" alt="${titleText}" width="${EMAIL_CONTAINER_WIDTH_PX}" style="width:100%;max-width:${EMAIL_CONTAINER_WIDTH_PX}px;height:auto;display:block;border:0;border-radius:12px;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
};

// Note: work-anniversary.template and work-anniversary-themes are exported
// directly from index.ts — do not re-export here to avoid duplicate identifier errors.
