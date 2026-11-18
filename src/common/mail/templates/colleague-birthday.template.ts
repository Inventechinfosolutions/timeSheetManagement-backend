const mjml2html = require('mjml');
import {
  getColleagueTemplateUrl,
  COLLEAGUE_TEMPLATE_URLS,
  INVENTECH_LOGO_URL,
} from '../../../assets/templates';

export { getColleagueTemplateUrl, COLLEAGUE_TEMPLATE_URLS, INVENTECH_LOGO_URL };

export interface ColleagueTemplateConfig {
  id: string;
  templateNumber: number;
  name: string;
  file: string;
  url: string;
  textSide: 'left' | 'right' | 'center';
  titleColor: string;
  textColor: string;
  themeColor: string;
  cardHeight: number;
}

export const COLLEAGUE_TEMPLATES: ColleagueTemplateConfig[] = [
  {
    id: 'C1',
    templateNumber: 1,
    name: 'Soft Sage & Mint Festivity',
    file: 'C1.jpg',
    url: 'https://iili.io/npOmuFs.jpg',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#BE123C',
    cardHeight: 380,
  },
  {
    id: 'C2',
    templateNumber: 2,
    name: 'Rose & Wine Elegance',
    file: 'C2.jpg',
    url: 'https://iili.io/npOmVcb.jpg',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#1D4ED8',
    cardHeight: 380,
  },
  {
    id: 'C3',
    templateNumber: 3,
    name: 'Lavender & Purple Glamour',
    file: 'C3.jpg',
    url: 'https://iili.io/npOmkV1.jpg',
    textSide: 'right',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#B45309',
    cardHeight: 380,
  },
  {
    id: 'C4',
    templateNumber: 4,
    name: 'Berry & Rose Romance',
    file: 'C4.png',
    url: 'https://iili.io/npOmPNp.png',
    textSide: 'right',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#047857',
    cardHeight: 380,
  },
  {
    id: 'C5',
    templateNumber: 5,
    name: 'Warm Coral & Gold',
    file: 'C5.png',
    url: 'https://iili.io/npOpJb2.png',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#1E40AF',
    cardHeight: 370,
  },
  {
    id: 'C6',
    templateNumber: 6,
    name: 'Crimson Balloons & Gift Celebration',
    file: 'C6.png',
    url: 'https://iili.io/npOpzbV.png',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#0E7490',
    cardHeight: 375,
  },
  {
    id: 'C7',
    templateNumber: 7,
    name: 'Amber Sunshine & Balloons',
    file: 'C7.png',
    url: 'https://iili.io/npOpNdG.png',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#6D28D9',
    cardHeight: 380,
  },
  {
    id: 'C8',
    templateNumber: 8,
    name: 'Deep Rose Confetti',
    file: 'C8.jpg',
    url: 'https://iili.io/npOyJ2a.jpg',
    textSide: 'center',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#0369A1',
    cardHeight: 380,
  },
  {
    id: 'C9',
    templateNumber: 9,
    name: 'Apricot Peach Celebration',
    file: 'C9.png',
    url: 'https://iili.io/npOyTvf.png',
    textSide: 'right',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#4338CA',
    cardHeight: 360,
  },
  {
    id: 'C10',
    templateNumber: 10,
    name: 'Blush Sparkle & Ribbon',
    file: 'C10.png',
    url: 'https://iili.io/npOyMyx.png',
    textSide: 'right',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#0F766E',
    cardHeight: 380,
  },
  {
    id: 'C11',
    templateNumber: 11,
    name: 'Antique Rose Glamour',
    file: 'C11.png',
    url: 'https://iili.io/npOyPnI.png',
    textSide: 'right',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#1E40AF',
    cardHeight: 380,
  },
  {
    id: 'C12',
    templateNumber: 12,
    name: 'Ice Blue & Silver Streamers',
    file: 'C12.png',
    url: 'https://iili.io/npOyQFn.png',
    textSide: 'right',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#BE123C',
    cardHeight: 325,
  },
  {
    id: 'C13',
    templateNumber: 13,
    name: 'Gold Champagne Elegance',
    file: 'C13.png',
    url: 'https://iili.io/npOyyt2.png',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#6D28D9',
    cardHeight: 380,
  },
  {
    id: 'C14',
    templateNumber: 14,
    name: 'Royal Sapphire & Balloons',
    file: 'C14.jpg',
    url: 'https://iili.io/npe9BAx.jpg',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#B45309',
    cardHeight: 380,
  },
  {
    id: 'C15',
    templateNumber: 15,
    name: 'Sunset Coral Harmony',
    file: 'C15.png',
    url: 'https://iili.io/npe9ntV.png',
    textSide: 'left',
    titleColor: '#0F172A',
    textColor: '#334155',
    themeColor: '#0369A1',
    cardHeight: 380,
  },
];

export function getColleagueTemplateConfig(identifier?: string | number): ColleagueTemplateConfig {
  if (typeof identifier === 'number') {
    const idx = (identifier - 1) % COLLEAGUE_TEMPLATES.length;
    return COLLEAGUE_TEMPLATES[idx >= 0 ? idx : 0];
  }
  if (typeof identifier === 'string') {
    const trimmed = identifier.trim().toUpperCase();
    const found = COLLEAGUE_TEMPLATES.find(
      (t) => t.id === trimmed || String(t.templateNumber) === trimmed,
    );
    if (found) return found;
  }
  return COLLEAGUE_TEMPLATES[0];
}

export interface ColleagueBirthdayData {
  recipientName: string;
  birthdayEmployeeName: string;
  department?: string;
  designation?: string;
  templateId?: string | number;
}

export function getFormattedDepartment(dept?: string): string {
  const raw = (dept || '').trim();
  if (!raw || raw.toLowerCase() === 'our' || raw.toLowerCase() === 'general') {
    return 'our department';
  }
  if (/department$/i.test(raw)) {
    return raw;
  }
  return `${raw} department`;
}

export function formatPossessiveName(name?: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'our colleague';
  return trimmed.endsWith("'s") ? trimmed : `${trimmed}'s`;
}

function buildCardInnerHtml(
  config: ColleagueTemplateConfig,
  birthdayName: string,
  deptText: string,
): string {
  const formattedName = formatPossessiveName(birthdayName);
  const messageBlock = `
    <div style="font-family:'Playfair Display','Cinzel',Georgia,'Palatino Linotype','Book Antiqua',serif;font-size:16px;font-weight:600;color:${config.titleColor};line-height:1.75;margin-bottom:14px;letter-spacing:0.2px;text-shadow:0 1px 3px rgba(255,255,255,0.95), 0 0 10px rgba(255,255,255,0.85);">
      Today is <span style="font-size:18px;font-weight:700;color:${config.themeColor};text-shadow:0 1px 3px rgba(255,255,255,0.95);">${formattedName}</span> birthday from ${deptText}, Take a moment to share your warm wishes and make their day even more special. &#127874;&#10024;
    </div>
    <div style="font-family:'Montserrat','Segoe UI',Roboto,-apple-system,Arial,sans-serif;font-size:13px;font-weight:500;color:${config.textColor};line-height:1.6;text-shadow:0 1px 2px rgba(255,255,255,0.9);">
      Thank you<br />
      Best regards<br />
      <strong style="font-family:'Playfair Display','Cinzel',Georgia,serif;color:${config.titleColor};font-size:14px;font-weight:700;letter-spacing:0.3px;">Team InvenTech Info Solutions</strong>
    </div>
  `;

  const logoRow = `
    <tr>
      <td colspan="${config.textSide === 'center' ? 1 : 2}" align="left" style="height:46px;padding:14px 0 0 24px;text-align:left;vertical-align:top;line-height:0;">
        <img src="${INVENTECH_LOGO_URL}" alt="InvenTech" width="103" height="34" style="display:inline-block;width:103px;height:34px;border:0;" />
      </td>
    </tr>
  `;

  let contentRow: string;
  if (config.textSide === 'right') {
    contentRow = `
      <tr>
        <td width="260" style="width:260px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="390" style="width:390px;vertical-align:middle;padding:10px 32px 24px 10px;text-align:left;">
          ${messageBlock}
        </td>
      </tr>
    `;
  } else if (config.textSide === 'left') {
    contentRow = `
      <tr>
        <td width="390" style="width:390px;vertical-align:middle;padding:10px 10px 24px 32px;text-align:left;">
          ${messageBlock}
        </td>
        <td width="260" style="width:260px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
    `;
  } else {
    contentRow = `
      <tr>
        <td width="650" style="width:650px;vertical-align:middle;padding:10px 48px 24px 48px;text-align:center;">
          ${messageBlock}
        </td>
      </tr>
    `;
  }

  return logoRow + contentRow;
}

export async function renderColleagueBirthdayEmail(data: ColleagueBirthdayData): Promise<string> {
  const config = getColleagueTemplateConfig(data.templateId);
  const imgSrc = config.url;

  const deptText = getFormattedDepartment(data.department);
  const rawName = (data.birthdayEmployeeName || 'our team member').trim();
  const birthdayName = rawName.endsWith("'s") ? rawName : `${rawName}'s`;

  const cardInner = buildCardInnerHtml(config, birthdayName, deptText);

  const mjmlTemplate = `
<mjml>
  <mj-head>
    <mj-title>Today is ${birthdayName} Birthday!</mj-title>
    <mj-preview>Today is ${birthdayName} birthday from ${deptText}, Take a moment to share your warm wishes and make their day even more special. 🎂✨</mj-preview>
    <mj-font name="Playfair Display" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" />
    <mj-font name="Cinzel" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap" />
    <mj-font name="Montserrat" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap" />
    <mj-attributes>
      <mj-all padding="0px" />
    </mj-attributes>
  </mj-head>
  <mj-body width="650px" background-color="#F8FAFC">
    <mj-section padding="24px 0px">
      <mj-column width="100%">
        <mj-raw>
          <!--[if mso]>
          <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:650px;height:${config.cardHeight}px;">
            <v:fill type="frame" src="${imgSrc}" />
            <v:textbox inset="0,0,0,0">
          <![endif]-->
          <table width="650" height="${config.cardHeight}" cellpadding="0" cellspacing="0" border="0" background="${imgSrc}" style="width:650px;height:${config.cardHeight}px;background:#FFFFFF url('${imgSrc}') center / cover no-repeat;background-image:url('${imgSrc}');background-size:cover;background-repeat:no-repeat;border-radius:12px;overflow:hidden;margin:0 auto;border-collapse:collapse;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1);">
            ${cardInner}
          </table>
          <!--[if mso]>
            </v:textbox>
          </v:rect>
          <![endif]-->
        </mj-raw>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

  const compiled = await (mjml2html as any)(mjmlTemplate, {
    validationLevel: 'soft',
    minify: false,
    keepComments: false,
  });

  return compiled.html;
}

export function getColleagueBirthdayTemplate(data: ColleagueBirthdayData): string {
  const config = getColleagueTemplateConfig(data.templateId);
  const imgSrc = config.url;

  const deptText = getFormattedDepartment(data.department);
  const rawName = (data.birthdayEmployeeName || 'our team member').trim();
  const birthdayName = rawName.endsWith("'s") ? rawName : `${rawName}'s`;

  const cardInner = buildCardInnerHtml(config, birthdayName, deptText);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Today is ${birthdayName} Birthday!</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Montserrat:wght@500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:24px 10px;background:#F8FAFC;font-family:'Montserrat','Segoe UI',Roboto,-apple-system,Arial,sans-serif;">
  <div style="max-width:650px;margin:0 auto;">
    <!--[if mso]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:650px;height:${config.cardHeight}px;">
      <v:fill type="frame" src="${imgSrc}" />
      <v:textbox inset="0,0,0,0">
    <![endif]-->
    <table width="650" height="${config.cardHeight}" cellpadding="0" cellspacing="0" border="0" background="${imgSrc}" style="width:650px;height:${config.cardHeight}px;background:#FFFFFF url('${imgSrc}') center / cover no-repeat;background-image:url('${imgSrc}');background-size:cover;background-repeat:no-repeat;border-radius:12px;overflow:hidden;margin:0 auto;border-collapse:collapse;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1);">
      ${cardInner}
    </table>
    <!--[if mso]>
      </v:textbox>
    </v:rect>
    <![endif]-->
  </div>
</body>
</html>`;
}

export function getColleagueMailAttachments(_templateId?: string | number): Array<any> {
  // Return empty array for zero MIME attachments: ensures Gmail never renders attachment chips or download cards
  return [];
}
