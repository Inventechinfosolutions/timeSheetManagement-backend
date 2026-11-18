const mjml2html = require('mjml');

import {
  FESTIVAL_TEMPLATE_URLS,
  getFestivalImageUrl,
  FESTIVAL_TEMPLATES_MAP,
  DYNAMIC_FESTIVALS,
} from '../../../../assets/templates';

export {
  FESTIVAL_TEMPLATE_URLS,
  getFestivalImageUrl,
  FESTIVAL_TEMPLATES_MAP,
  DYNAMIC_FESTIVALS,
};

/**
 * Resolves the matching template files (GIF/PNG) for a given festival name.
 * Checks both database mapped festivals and dynamic festival configs.
 */
export function getFestivalTemplateFiles(festivalName?: string): string[] {
  if (!festivalName) return [];
  const normalized = festivalName.trim().toLowerCase();
  for (const [key, files] of Object.entries(FESTIVAL_TEMPLATES_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return files;
    }
  }
  for (const dyn of DYNAMIC_FESTIVALS) {
    const dynNorm = dyn.name.trim().toLowerCase();
    if (normalized.includes(dynNorm) || dynNorm.includes(normalized)) {
      return dyn.templates;
    }
  }
  return [];
}

export interface FestivalMailData {
  festivalName: string;
  imageSrc?: string; // 'cid:festival-image' or URL
  gifSrc?: string;   // alias for backward-compatibility
  year?: number | string;
  templateFilename?: string;
}

/**
 * Uses MJML library to deliver the festival template directly in email.
 * For New Year: Dynamically renders the year fetched from DB, matching template typography and palette.
 * Uses permanent CDN URLs with zero MIME attachments so Gmail never displays attachment chips or hover buttons.
 */
export async function renderFestivalEmail(data: FestivalMailData): Promise<string> {
  const resolvedFile = data.templateFilename || (getFestivalTemplateFiles(data.festivalName)[0] || '');
  const cdnUrl = resolvedFile ? getFestivalImageUrl(resolvedFile) : '';
  const imgSrc = data.imageSrc || data.gifSrc || cdnUrl || 'cid:festival-image';
  const isNewYear = data.festivalName.toLowerCase().includes('new year');
  const year = data.year;

  if (isNewYear && year) {
    const isTemplate2 = (data.templateFilename || '').includes('2');
    const headerBg = isTemplate2 ? '#F094FF' : '#7A2B9F';
    const yearColor = isTemplate2 ? '#4C0D89' : '#FED933';
    const animName = isTemplate2 ? 'neonPulseGlow' : 'festivePulseGlow';
    const glowShadow = isTemplate2
      ? '0 0 16px rgba(240, 148, 255, 0.95), 0 0 30px rgba(109, 40, 217, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5)'
      : '0 0 16px rgba(254, 217, 51, 0.95), 0 0 32px rgba(254, 217, 51, 0.7), 0 2px 8px rgba(0, 0, 0, 0.6)';
    const glowShadowPeak = isTemplate2
      ? '0 0 28px rgba(240, 148, 255, 1), 0 0 50px rgba(240, 148, 255, 0.9), 0 0 75px rgba(109, 40, 217, 0.8)'
      : '0 0 28px rgba(254, 217, 51, 1), 0 0 50px rgba(255, 235, 120, 0.9), 0 0 75px rgba(254, 217, 51, 0.8)';
    const overlayBg = isTemplate2 ? 'rgba(240, 148, 255, 0.85)' : 'rgba(122, 43, 159, 0.82)';

    const mjmlTemplate = `
<mjml>
  <mj-head>
    <mj-title>${data.festivalName} ${year}</mj-title>
    <mj-attributes>
      <mj-all padding="0px" />
      <mj-section padding="0px" />
    </mj-attributes>
    <mj-font name="Cinzel Decorative" href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&display=swap" />
    <mj-font name="Playfair Display" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,900&display=swap" />
    <mj-style>
      @keyframes ${animName} {
        0%, 100% {
          text-shadow: ${glowShadow};
          transform: scale(1);
          opacity: 0.95;
        }
        50% {
          text-shadow: ${glowShadowPeak};
          transform: scale(1.06);
          opacity: 1;
        }
      }
      .animated-year {
        display: inline-block;
        animation: ${animName} 2.5s infinite ease-in-out;
        font-family: 'Cinzel Decorative', 'Playfair Display', Georgia, serif;
        font-size: 64px;
        font-weight: 900;
        letter-spacing: 5px;
        color: ${yearColor};
        line-height: 1;
        text-shadow: ${glowShadow};
      }
      .festival-bg {
        background-image: url('${imgSrc}') !important;
        background-size: cover !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }
      .blur-overlay {
        backdrop-filter: blur(25px) brightness(0.7) !important;
        -webkit-backdrop-filter: blur(25px) brightness(0.7) !important;
        background-color: ${overlayBg} !important;
      }
      @media only screen and (max-width: 600px) {
        .animated-year {
          font-size: 34px !important;
          letter-spacing: 2px !important;
        }
        .hero-spacer {
          height: 170px !important;
        }
        .hero-container {
          height: 310px !important;
        }
      }
    </mj-style>
  </mj-head>
  <mj-body width="1000px" background-color="${headerBg}" css-class="festival-bg">
    <mj-wrapper padding="0px" css-class="blur-overlay">
      <mj-hero
        mode="fixed-height"
        height="562px"
        background-width="1000px"
        background-height="562px"
        background-url="${imgSrc}"
        background-color="${headerBg}"
        padding="0px"
        css-class="hero-container"
      >
        <mj-table padding="0px">
          <tr class="hero-spacer" style="height: 295px;">
            <td colspan="2">&nbsp;</td>
          </tr>
          <tr>
            <td style="width: 58%;">&nbsp;</td>
            <td style="width: 42%; text-align: left; vertical-align: middle;">
              <a href="https://inventechinfo.com/" target="_blank" style="text-decoration: none; color: inherit;">
                <div class="animated-year">
                  ${year}
                </div>
              </a>
            </td>
          </tr>
        </mj-table>
      </mj-hero>
    </mj-wrapper>
  </mj-body>
</mjml>`;

    const compiled = await (mjml2html as any)(mjmlTemplate, {
      validationLevel: 'soft',
      minify: false,
      keepComments: false,
    });

    return compiled.html;
  }

  // Non-New Year festivals: clean expanded template with ambient background
  const mjmlTemplate = `
<mjml>
  <mj-head>
    <mj-title>${data.festivalName}</mj-title>
    <mj-attributes>
      <mj-all padding="0px" />
      <mj-section padding="0px" />
    </mj-attributes>
    <mj-style>
      .festival-bg {
        background-image: url('${imgSrc}') !important;
        background-size: cover !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }
      .blur-overlay {
        backdrop-filter: blur(25px) brightness(0.7) !important;
        -webkit-backdrop-filter: blur(25px) brightness(0.7) !important;
        background-color: rgba(15, 23, 42, 0.85) !important;
      }
      .expand-template img {
        width: 100% !important;
        max-width: 1000px !important;
        height: auto !important;
        display: block !important;
        margin: 0 auto !important;
      }
    </mj-style>
  </mj-head>
  <mj-body width="1000px" background-color="#0F172A" css-class="festival-bg">
    <mj-wrapper padding="0px" css-class="blur-overlay">
      <mj-section padding="0px 0px 16px 0px" background-color="transparent">
        <mj-column width="100%">
          <mj-image
            css-class="expand-template"
            src="${imgSrc}"
            alt="${data.festivalName}"
            width="1000px"
            padding="0px"
            fluid-on-mobile="true"
            href="https://inventechinfo.com/"
          />
        </mj-column>
      </mj-section>
    </mj-wrapper>
  </mj-body>
</mjml>`;

  const compiled = await (mjml2html as any)(mjmlTemplate, {
    validationLevel: 'soft',
    minify: false,
    keepComments: false,
  });

  return compiled.html;
}

/**
 * Returns attachments for the festival email.
 * Zero MIME attachments — All festival templates are hosted on permanent CDN (https://iili.io/...)
 * to guarantee Gmail never renders attachment chips ('noname' or '.gif') in inbox
 * and eliminates the hover download/drive/photos buttons.
 */
export function getFestivalMailAttachments(_filename?: string): Array<{
  filename?: any;
  content: Buffer;
  cid: string;
  contentType: string;
  contentDisposition: string;
}> {
  // Return empty array to guarantee zero MIME attachments
  return [];
}
