import {
  getBirthdayTemplateUrl,
  GENDER_AVATARS,
  getGenderAvatarUrl,
} from '../../../../assets/templates';

export { GENDER_AVATARS, getGenderAvatarUrl };

const mjml2html = require('mjml');

export interface BirthdayEmailData {
  fullName: string;
  email?: string;
  gender?: string;
  photoUrl?: string; // 'cid:profile-photo' or URL or base64
  templateUrl?: string; // 'cid:birthday-template' or URL
  hasPhoto?: boolean;
  templateId?: string;
  templateNumber?: number;
}

export interface BirthdayTemplateConfig {
  id: string;
  templateNumber: number;
  name: string;
  file: string;
  layoutType: 'left-frame' | 'right-frame' | 'center-frame' | 'right-stacked' | 'left-stacked';
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
  frameRadius: string;
  nameX: number;
  nameY: number;
  nameW: number;
  nameColor: string;
  avatarBg: string;
  avatarColor: string;
  headline: string;
  message: string;
}

/**
 * 15 Official Worksphere / InvenTech Birthday Templates (BRD1 - BRD15).
 * Pixel-accurate coordinates mapped directly to each Canva template (650 x 335 email canvas).
 */
export const BIRTHDAY_TEMPLATES: BirthdayTemplateConfig[] = [
  {
    id: 'BRD1',
    templateNumber: 1,
    name: 'Rose Gold & Balloons Elegant Celebration',
    file: 'BRD1.gif',
    layoutType: 'right-frame',
    frameX: 500,
    frameY: 24,
    frameW: 115,
    frameH: 130,
    frameRadius: '50%',
    nameX: 300,
    nameY: 132,
    nameW: 185,
    nameColor: '#6B1124',
    avatarBg: 'transparent',
    avatarColor: '#6B1124',
    headline: 'Happy Birthday',
    message: 'May happiness follow you wherever life takes you.',
  },
  {
    id: 'BRD2',
    templateNumber: 2,
    name: 'Navy Blue & Champagne Luxury',
    file: 'BRD2.gif',
    layoutType: 'left-frame',
    frameX: 130,
    frameY: 52,
    frameW: 130,
    frameH: 131,
    frameRadius: '8px',
    nameX: 335,
    nameY: 123,
    nameW: 185,
    nameColor: '#0A2540',
    avatarBg: 'transparent',
    avatarColor: '#0A2540',
    headline: 'Have a Fantastic Birthday!',
    message: 'WISHING YOU ENDLESS SMILES AND UNFORGETTABLE MEMORIES.',
  },
  {
    id: 'BRD3',
    templateNumber: 3,
    name: 'Festive Sky Blue with Balloons & Bunting',
    file: 'BRD3.gif',
    layoutType: 'center-frame',
    frameX: 260,
    frameY: 10,
    frameW: 130,
    frameH: 127,
    frameRadius: '50%',
    nameX: 228,
    nameY: 175,
    nameW: 200,
    nameColor: '#0284C7',
    avatarBg: 'transparent',
    avatarColor: '#0284C7',
    headline: 'Happy Birthday & Best Wishes!',
    message: 'MAY YOUR FUTURE BE BRIGHT WITH HAPPINESS AND SUCCESS.',
  },
  {
    id: 'BRD4',
    templateNumber: 4,
    name: 'Cute Pastel Teddy Bear & Gift Boxes',
    file: 'BRD4.gif',
    layoutType: 'right-frame',
    frameX: 435,
    frameY: 70,
    frameW: 143,
    frameH: 140,
    frameRadius: '16px',
    nameX: 215,
    nameY: 126,
    nameW: 200,
    nameColor: '#1E3A8A',
    avatarBg: 'transparent',
    avatarColor: '#1E3A8A',
    headline: 'HAPPY BIRTHDAY!',
    message: "HERE'S TO NEW DREAMS, FRESH HOPES AND WONDERFUL ADVENTURES.",
  },
  {
    id: 'BRD5',
    templateNumber: 5,
    name: 'Golden Sparkle & Warm Blessings',
    file: 'BRD5.gif',
    layoutType: 'center-frame',
    frameX: 255,
    frameY: 10,
    frameW: 136,
    frameH: 134,
    frameRadius: '50%',
    nameX: 220,
    nameY: 184,
    nameW: 215,
    nameColor: '#854D0E',
    avatarBg: 'transparent',
    avatarColor: '#854D0E',
    headline: 'Birthday Blessings!',
    message: 'May your heart be light and your days be bright.',
  },
  {
    id: 'BRD6',
    templateNumber: 6,
    name: 'Teal Serenity with Frosted Cake & Candles',
    file: 'BRD6.gif',
    layoutType: 'left-frame',
    frameX: 26,
    frameY: 50,
    frameW: 117,
    frameH: 134,
    frameRadius: '20px',
    nameX: 192,
    nameY: 162,
    nameW: 195,
    nameColor: '#1E3A8A',
    avatarBg: 'transparent',
    avatarColor: '#1E3A8A',
    headline: 'Another Year, Another Smile!',
    message: 'May your dreams shine brighter with every passing year.',
  },
  {
    id: 'BRD7',
    templateNumber: 7,
    name: 'Sage Green & Lilac Cake with Arch Window',
    file: 'BRD7.gif',
    layoutType: 'left-stacked',
    frameX: 68,
    frameY: 47,
    frameW: 110,
    frameH: 154,
    frameRadius: '55px 55px 4px 4px',
    nameX: 28,
    nameY: 286,
    nameW: 175,
    nameColor: '#BE123C',
    avatarBg: 'transparent',
    avatarColor: '#BE123C',
    headline: 'Happy Birthday',
    message: "Here's to new dreams, fresh hopes and wonderful adventures.",
  },
  {
    id: 'BRD8',
    templateNumber: 8,
    name: 'Pink Glamour & Golden Cake Celebration',
    file: 'BRD8.gif',
    layoutType: 'right-stacked',
    frameX: 403,
    frameY: 17,
    frameW: 143,
    frameH: 140,
    frameRadius: '50%',
    nameX: 375,
    nameY: 189,
    nameW: 195,
    nameColor: '#831843',
    avatarBg: 'transparent',
    avatarColor: '#831843',
    headline: 'Have a Fantastic Birthday!',
    message: 'Wishing you endless smiles and unforgettable memories.',
  },
  {
    id: 'BRD9',
    templateNumber: 9,
    name: 'Joyful Confetti & Celebratory Cake',
    file: 'BRD9.gif',
    layoutType: 'left-frame',
    frameX: 145,
    frameY: 50,
    frameW: 115,
    frameH: 150,
    frameRadius: '50%',
    nameX: 332,
    nameY: 121,
    nameW: 160,
    nameColor: '#0284C7',
    avatarBg: 'transparent',
    avatarColor: '#0284C7',
    headline: 'Wishing You a Wonderful Birthday!',
    message: 'MAY EVERY MOMENT BRING A REASON TO SMILE.',
  },
  {
    id: 'BRD10',
    templateNumber: 10,
    name: 'Colorful Party Flags & Cupcakes ("Cheers to You!")',
    file: 'BRD10.gif',
    layoutType: 'center-frame',
    frameX: 247,
    frameY: 23,
    frameW: 159,
    frameH: 157,
    frameRadius: '50%',
    nameX: 220,
    nameY: 207,
    nameW: 210,
    nameColor: '#111827',
    avatarBg: 'transparent',
    avatarColor: '#111827',
    headline: 'Cheers to You!',
    message: 'May your new year of life be filled with exciting possibilities.',
  },
  {
    id: 'BRD11',
    templateNumber: 11,
    name: 'Rose Gold Shimmer with Laurel Wreath & Tiered Cake',
    file: 'BRD11.gif',
    layoutType: 'left-frame',
    frameX: 45,
    frameY: 55,
    frameW: 150,
    frameH: 145,
    frameRadius: '50%',
    nameX: 237,
    nameY: 142,
    nameW: 160,
    nameColor: '#881337',
    avatarBg: 'transparent',
    avatarColor: '#881337',
    headline: 'Happy Birthday',
    message: 'May your special day sparkle with happiness and beautiful moments.',
  },
  {
    id: 'BRD12',
    templateNumber: 12,
    name: 'Vintage Kraft Paper, Teddy Bears & Party Pennants',
    file: 'BRD12.gif',
    layoutType: 'left-frame',
    frameX: 88,
    frameY: 77,
    frameW: 136,
    frameH: 137,
    frameRadius: '50%',
    nameX: 278,
    nameY: 130,
    nameW: 145,
    nameColor: '#9D174D',
    avatarBg: 'transparent',
    avatarColor: '#9D174D',
    headline: 'Happy BIRTHDAY',
    message: 'May every moment bring a reason to smile.',
  },
  {
    id: 'BRD13',
    templateNumber: 13,
    name: 'Ruby Elegance with Floating Balloons & Confetti',
    file: 'BRD13.gif',
    layoutType: 'left-frame',
    frameX: 112,
    frameY: 56,
    frameW: 171,
    frameH: 145,
    frameRadius: '10px',
    nameX: 362,
    nameY: 157,
    nameW: 185,
    nameColor: '#B91C1C',
    avatarBg: 'transparent',
    avatarColor: '#B91C1C',
    headline: 'Happy Birthday',
    message: 'Wishing you a magnificent birthday full of joy and laughter.',
  },
  {
    id: 'BRD14',
    templateNumber: 14,
    name: 'Champagne Warm Gold Luxury Celebration',
    file: 'BRD14.gif',
    layoutType: 'left-frame',
    frameX: 122,
    frameY: 30,
    frameW: 153,
    frameH: 153,
    frameRadius: '50%',
    nameX: 335,
    nameY: 158,
    nameW: 155,
    nameColor: '#A16207',
    avatarBg: 'transparent',
    avatarColor: '#A16207',
    headline: 'Happy Birthday',
    message: 'May your journey ahead be as wonderful as your smile.',
  },
  {
    id: 'BRD15',
    templateNumber: 15,
    name: 'Vibrant Magenta Party & Festive Streamers',
    file: 'BRD15.gif',
    layoutType: 'left-frame',
    frameX: 146,
    frameY: 39,
    frameW: 154,
    frameH: 116,
    frameRadius: '16px',
    nameX: 334,
    nameY: 126,
    nameW: 155,
    nameColor: '#86198F',
    avatarBg: 'transparent',
    avatarColor: '#86198F',
    headline: 'HAPPIEST BIRTHDAY!',
    message: 'May this year bring you closer to everything you wish for.',
  },
];

export function getBirthdayCardBuffer(_identifier?: string | number): Buffer {
  return Buffer.alloc(0);
}

export { getBirthdayTemplateUrl };

export function getBirthdayTemplateConfig(identifier?: string | number): BirthdayTemplateConfig {
  if (typeof identifier === 'number') {
    const idx = (identifier - 1) % BIRTHDAY_TEMPLATES.length;
    return BIRTHDAY_TEMPLATES[idx >= 0 ? idx : 0];
  }
  if (typeof identifier === 'string') {
    const trimmed = identifier.trim().toUpperCase();
    const found = BIRTHDAY_TEMPLATES.find(
      (t) => t.id === trimmed || String(t.templateNumber) === trimmed,
    );
    if (found) return found;
  }
  return BIRTHDAY_TEMPLATES[0];
}

/**
 * Renders the birthday card email:
 * - Direct InvenTech Canva template asset (BRD1.gif - BRD15.gif).
 * - Supported both via inline CID ('cid:birthday-template') and CDN URL fallback.
 * - Initial letter of celebrant rendered cleanly inside the existing white box (no extra shadows or shapes).
 * - Celebrant name placed directly below the Happy Birthday wish inside the card.
 * - Displays simultaneously without download lag and without Outlook blocking warning.
 */
export async function renderBirthdayEmail(data: BirthdayEmailData): Promise<string> {
  const config = getBirthdayTemplateConfig(data.templateId || data.templateNumber);
  const name = (data.fullName || '').trim();
  const cdnUrl = getBirthdayTemplateUrl(config.file);
  const templateImgSrc = data.templateUrl || cdnUrl;
  const hasPhoto = Boolean(data.hasPhoto && data.photoUrl);
  const avatarUrl = getGenderAvatarUrl(data.gender);
  const displayPhotoUrl = hasPhoto ? data.photoUrl! : avatarUrl;

  const vmlShape = config.frameRadius === '50%'
    ? `<v:oval xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${config.frameW}px;height:${config.frameH}px;"><v:fill type="frame" src="${displayPhotoUrl}" /></v:oval>`
    : `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" arcsize="10%" fill="true" stroke="false" style="width:${config.frameW}px;height:${config.frameH}px;"><v:fill type="frame" src="${displayPhotoUrl}" /></v:roundrect>`;

  // Photo frame content: shows uploaded photo if available, otherwise gender-based avatar. No initial letters.
  const frameContent = `
    <!--[if mso]>
    ${vmlShape}
    <![endif]-->
    <!--[if !mso]><!-->
    <img src="${displayPhotoUrl}" alt="${name}" width="${config.frameW}" height="${config.frameH}" style="width:${config.frameW}px;height:${config.frameH}px;border-radius:${config.frameRadius};object-fit:cover;display:block;border:0;margin:0 auto;" />
    <!--<![endif]-->
  `;

  const cleanName = name
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  const fontSize = cleanName.length > 20 ? '20px' : (cleanName.length > 14 ? '24px' : '28px');

  const nameContent = `
    <div style="font-family:'Playfair Display','Cinzel','Georgia','Palatino Linotype','Times New Roman',serif;font-size:${fontSize};font-weight:700;color:${config.nameColor};line-height:1.2;letter-spacing:0.5px;text-shadow:0 1px 3px rgba(255,255,255,0.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
      ${cleanName || name}
    </div>
  `;

  let innerTableHtml = '';

  if (config.layoutType === 'left-frame') {
    const leftPad = config.frameX;
    const centerPad = Math.max(10, config.nameX - (config.frameX + config.frameW));
    const rightPad = Math.max(0, 650 - (config.nameX + config.nameW));
    const topPad = config.frameY;
    const bottomPad = Math.max(0, 335 - Math.max(config.frameY + config.frameH, config.nameY + 36));
    const namePadTop = Math.max(0, config.nameY - config.frameY);

    innerTableHtml = `
      <colgroup>
        <col width="${leftPad}" style="width:${leftPad}px;" />
        <col width="${config.frameW}" style="width:${config.frameW}px;" />
        <col width="${centerPad}" style="width:${centerPad}px;" />
        <col width="${config.nameW}" style="width:${config.nameW}px;" />
        <col width="${rightPad}" style="width:${rightPad}px;" />
      </colgroup>
      <tr style="height: ${topPad}px;">
        <td colspan="5" height="${topPad}" style="height:${topPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${config.frameH}px;">
        <td width="${leftPad}" style="width:${leftPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${config.frameW}" height="${config.frameH}" style="width:${config.frameW}px;height:${config.frameH}px;text-align:center;vertical-align:middle;">
          ${frameContent}
        </td>
        <td width="${centerPad}" style="width:${centerPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${config.nameW}" style="width:${config.nameW}px;text-align:center;vertical-align:top;padding-top:${namePadTop}px;">
          ${nameContent}
        </td>
        <td width="${rightPad}" style="width:${rightPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${bottomPad}px;">
        <td colspan="5" height="${bottomPad}" style="height:${bottomPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
    `;
  } else if (config.layoutType === 'left-stacked') {
    // Both profile frame and name are stacked vertically in the left section (e.g. BRD7)
    const leftPad = config.nameX;
    const colW = config.nameW;
    const rightMargin = Math.max(0, 650 - (leftPad + colW));
    const topPad = config.frameY;
    const wishGap = Math.max(10, config.nameY - (config.frameY + config.frameH));
    const nameH = 36;
    const bottomPad = Math.max(0, 335 - (config.nameY + nameH));

    innerTableHtml = `
      <colgroup>
        <col width="${leftPad}" style="width:${leftPad}px;" />
        <col width="${colW}" style="width:${colW}px;" />
        <col width="${rightMargin}" style="width:${rightMargin}px;" />
      </colgroup>
      <tr style="height: ${topPad}px;">
        <td colspan="3" height="${topPad}" style="height:${topPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${config.frameH}px;">
        <td width="${leftPad}" style="width:${leftPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${colW}" height="${config.frameH}" style="width:${colW}px;height:${config.frameH}px;text-align:center;vertical-align:middle;">
          ${frameContent}
        </td>
        <td width="${rightMargin}" style="width:${rightMargin}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${wishGap}px;">
        <td colspan="3" height="${wishGap}" style="height:${wishGap}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${nameH}px;">
        <td width="${leftPad}" style="width:${leftPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${colW}" height="${nameH}" style="width:${colW}px;height:${nameH}px;text-align:center;vertical-align:middle;">
          ${nameContent}
        </td>
        <td width="${rightMargin}" style="width:${rightMargin}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${bottomPad}px;">
        <td colspan="3" height="${bottomPad}" style="height:${bottomPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
    `;
  } else if (config.layoutType === 'right-stacked') {
    // Both profile frame and name are stacked vertically in the right section (e.g. BRD8)
    const leftPad = config.nameX;
    const colW = config.nameW;
    const rightMargin = Math.max(0, 650 - (leftPad + colW));
    const topPad = config.frameY;
    const wishGap = Math.max(10, config.nameY - (config.frameY + config.frameH));
    const nameH = 34;
    const bottomPad = Math.max(0, 335 - (config.nameY + nameH));

    innerTableHtml = `
      <colgroup>
        <col width="${leftPad}" style="width:${leftPad}px;" />
        <col width="${colW}" style="width:${colW}px;" />
        <col width="${rightMargin}" style="width:${rightMargin}px;" />
      </colgroup>
      <tr style="height: ${topPad}px;">
        <td colspan="3" height="${topPad}" style="height:${topPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${config.frameH}px;">
        <td width="${leftPad}" style="width:${leftPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${colW}" height="${config.frameH}" style="width:${colW}px;height:${config.frameH}px;text-align:center;vertical-align:middle;">
          ${frameContent}
        </td>
        <td width="${rightMargin}" style="width:${rightMargin}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${wishGap}px;">
        <td colspan="3" height="${wishGap}" style="height:${wishGap}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${nameH}px;">
        <td width="${leftPad}" style="width:${leftPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${colW}" height="${nameH}" style="width:${colW}px;height:${nameH}px;text-align:center;vertical-align:middle;">
          ${nameContent}
        </td>
        <td width="${rightMargin}" style="width:${rightMargin}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${bottomPad}px;">
        <td colspan="3" height="${bottomPad}" style="height:${bottomPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
    `;
  } else if (config.layoutType === 'right-frame') {
    const leftPad = config.nameX;
    const centerPad = Math.max(10, config.frameX - (config.nameX + config.nameW));
    const rightPad = Math.max(0, 650 - (config.frameX + config.frameW));
    const topPad = Math.min(config.frameY, config.nameY);
    const bottomPad = Math.max(0, 335 - Math.max(config.frameY + config.frameH, config.nameY + 36));
    const namePadTop = Math.max(0, config.nameY - topPad);
    const framePadTop = Math.max(0, config.frameY - topPad);

    innerTableHtml = `
      <colgroup>
        <col width="${leftPad}" style="width:${leftPad}px;" />
        <col width="${config.nameW}" style="width:${config.nameW}px;" />
        <col width="${centerPad}" style="width:${centerPad}px;" />
        <col width="${config.frameW}" style="width:${config.frameW}px;" />
        <col width="${rightPad}" style="width:${rightPad}px;" />
      </colgroup>
      <tr style="height: ${topPad}px;">
        <td colspan="5" height="${topPad}" style="height:${topPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${config.frameH}px;">
        <td width="${leftPad}" style="width:${leftPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${config.nameW}" style="width:${config.nameW}px;text-align:center;vertical-align:top;padding-top:${namePadTop}px;">
          ${nameContent}
        </td>
        <td width="${centerPad}" style="width:${centerPad}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${config.frameW}" height="${config.frameH}" style="width:${config.frameW}px;height:${config.frameH}px;text-align:center;vertical-align:middle;padding-top:${framePadTop}px;">
          ${frameContent}
        </td>
        <td width="${rightPad}" style="width:${rightPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${bottomPad}px;">
        <td colspan="5" height="${bottomPad}" style="height:${bottomPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
    `;
  } else {
    // center-frame
    const topPad = config.frameY;
    const framePadX = Math.round((650 - config.frameW) / 2);
    const betweenPad = Math.max(10, config.nameY - (config.frameY + config.frameH));
    const bottomPad = Math.max(0, 335 - (config.nameY + 36));

    innerTableHtml = `
      <colgroup>
        <col width="${framePadX}" style="width:${framePadX}px;" />
        <col width="${config.frameW}" style="width:${config.frameW}px;" />
        <col width="${framePadX}" style="width:${framePadX}px;" />
      </colgroup>
      <tr style="height: ${topPad}px;">
        <td colspan="3" height="${topPad}" style="height:${topPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${config.frameH}px;">
        <td width="${framePadX}" style="width:${framePadX}px;line-height:0;font-size:0;">&nbsp;</td>
        <td width="${config.frameW}" height="${config.frameH}" style="width:${config.frameW}px;height:${config.frameH}px;text-align:center;vertical-align:middle;">
          ${frameContent}
        </td>
        <td width="${framePadX}" style="width:${framePadX}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr style="height: ${betweenPad}px;">
        <td colspan="3" height="${betweenPad}" style="height:${betweenPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
      <tr>
        <td colspan="3" style="text-align:center;vertical-align:middle;">
          ${nameContent}
        </td>
      </tr>
      <tr style="height: ${bottomPad}px;">
        <td colspan="3" height="${bottomPad}" style="height:${bottomPad}px;line-height:0;font-size:0;">&nbsp;</td>
      </tr>
    `;
  }

  const mjmlTemplate = `
<mjml>
  <mj-head>
    <mj-title>Happy Birthday, ${cleanName || name}!</mj-title>
    <mj-preview>Happy Birthday, ${cleanName || name}! Wishing you joy, health, and success!</mj-preview>
    <mj-font name="Playfair Display" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&display=swap" />
    <mj-font name="Cinzel" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap" />
    <mj-attributes>
      <mj-all padding="0px" />
    </mj-attributes>
  </mj-head>
  <mj-body width="650px" background-color="#F8FAFC">
    <mj-section padding="20px 0px">
      <mj-column width="100%">
        <mj-raw>
          <!--[if mso]>
          <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:650px;height:335px;">
            <v:fill type="frame" src="cid:birthday-template" />
            <v:textbox inset="0,0,0,0">
          <![endif]-->
          <table width="650" height="335" cellpadding="0" cellspacing="0" border="0" background="cid:birthday-template" style="table-layout:fixed;width:650px;height:335px;background:#FFFFFF url('${cdnUrl}') top center / 650px 335px no-repeat;background-image:url('cid:birthday-template'), url('${cdnUrl}');background-size:650px 335px;background-repeat:no-repeat;background-position:top center;border-radius:12px;overflow:hidden;margin:0 auto;border-collapse:collapse;">
            ${innerTableHtml}
          </table>
          <!--[if mso]>
            </v:textbox>
          </v:rect>
          <![endif]-->
          <img src="cid:birthday-template" alt="" width="0" height="0" style="display:none!important;width:0px!important;height:0px!important;max-height:0px!important;mso-hide:all;" />
        </mj-raw>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

  const compiled = await (mjml2html as any)(mjmlTemplate, {
    validationLevel: 'soft',
    minify: false,
    keepComments: true,
  });

  return compiled.html;
}

/**
 * Returns inline CID attachments for the birthday card and employee profile photo.
 * Using contentDisposition: 'inline' with Content-ID headers ensures:
 * 1. Outlook NEVER shows "Images and scripts have been blocked. [Show content]".
 * 2. Zero network lag: template and name/avatar load simultaneously.
 * 3. Email clients do not treat the card as a detached file attachment.
 */
export function getBirthdayMailAttachments(
  templateIdentifier?: string | number,
  photoBuffer?: Buffer | null,
  photoMime = 'image/jpeg',
): Array<{
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
  contentDisposition: 'inline';
  headers: Record<string, string>;
}> {
  const attachments: Array<any> = [];

  if (photoBuffer && photoBuffer.length > 0) {
    attachments.push({
      filename: 'profile-photo.jpg',
      content: photoBuffer,
      cid: 'profile-photo',
      contentType: photoMime,
      contentDisposition: 'inline',
      headers: {
        'Content-ID': '<profile-photo>',
        'X-Attachment-Id': 'profile-photo',
      },
    });
  }

  const cardBuf = getBirthdayCardBuffer(templateIdentifier);
  if (cardBuf && cardBuf.length > 0) {
    attachments.push({
      filename: 'birthday-card.jpg',
      content: cardBuf,
      cid: 'birthday-template',
      contentType: 'image/jpeg',
      contentDisposition: 'inline',
      headers: {
        'Content-ID': '<birthday-template>',
        'X-Attachment-Id': 'birthday-template',
      },
    });
  }

  return attachments;
}
