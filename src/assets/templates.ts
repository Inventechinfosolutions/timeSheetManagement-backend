/**
 * Unified Template Assets Registry
 * 
 * Centralizes all templates across:
 * 1. Birthday Templates (BRD1 - BRD15)
 * 2. Colleague Birthday Templates (C1 - C15)
 * 3. Festival Templates (Dynamic & Holiday Mappings)
 * 
 * All templates resolve directly to high-speed CDN URLs without
 * requiring runtime filesystem paths, disk I/O, or MIME attachments.
 */

// ─── 1. Birthday Templates (BRD1 - BRD15) ───────────────────────────────────

export const BIRTHDAY_TEMPLATE_URLS: Record<string, string> = {
  'BRD1.gif': 'https://files.catbox.moe/y4iojk.gif',
  'BRD2.gif': 'https://files.catbox.moe/jds7k2.gif',
  'BRD3.gif': 'https://files.catbox.moe/nek2wh.gif',
  'BRD4.gif': 'https://files.catbox.moe/4p0j8l.gif',
  'BRD5.gif': 'https://files.catbox.moe/z22st1.gif',
  'BRD6.gif': 'https://files.catbox.moe/ico926.gif',
  'BRD7.gif': 'https://iili.io/oHNYHZB.gif',
  'BRD8.gif': 'https://files.catbox.moe/ma11xv.gif',
  'BRD9.gif': 'https://files.catbox.moe/l0ar0k.gif',
  'BRD10.gif': 'https://files.catbox.moe/xkgsmj.gif',
  'BRD11.gif': 'https://files.catbox.moe/fh3go7.gif',
  'BRD12.gif': 'https://files.catbox.moe/ri638h.gif',
  'BRD13.gif': 'https://files.catbox.moe/tlhdtn.gif',
  'BRD14.gif': 'https://iili.io/o2Yjt2V.gif',
  'BRD15.gif': 'https://files.catbox.moe/d6ydb7.gif',
};

export function getBirthdayTemplateUrl(filename: string): string {
  if (!filename) return '';
  if (BIRTHDAY_TEMPLATE_URLS[filename]) return BIRTHDAY_TEMPLATE_URLS[filename];
  const lower = filename.trim().toLowerCase();
  for (const [key, val] of Object.entries(BIRTHDAY_TEMPLATE_URLS)) {
    if (key.toLowerCase() === lower) return val;
  }
  return '';
}

// ─── 2. Colleague Birthday Templates (C1 - C15) ─────────────────────────────

export const COLLEAGUE_TEMPLATE_URLS: Record<string, string> = {
  'C1.jpg': 'https://iili.io/npOmuFs.jpg',
  'C2.jpg': 'https://iili.io/npOmVcb.jpg',
  'C3.jpg': 'https://iili.io/npOmkV1.jpg',
  'C4.png': 'https://iili.io/npOmPNp.png',
  'C5.png': 'https://iili.io/npOpJb2.png',
  'C6.png': 'https://iili.io/npOpzbV.png',
  'C7.png': 'https://iili.io/npOpNdG.png',
  'C8.jpg': 'https://iili.io/npOyJ2a.jpg',
  'C9.png': 'https://iili.io/npOyTvf.png',
  'C10.png': 'https://iili.io/npOyMyx.png',
  'C11.png': 'https://iili.io/npOyPnI.png',
  'C12.png': 'https://iili.io/npOyQFn.png',
  'C13.png': 'https://iili.io/npOyyt2.png',
  'C14.jpg': 'https://iili.io/npe9BAx.jpg',
  'C15.png': 'https://iili.io/npe9ntV.png',
};

export function getColleagueTemplateUrl(filename: string): string {
  if (!filename) return '';
  if (COLLEAGUE_TEMPLATE_URLS[filename]) return COLLEAGUE_TEMPLATE_URLS[filename];
  const lower = filename.trim().toLowerCase();
  for (const [key, val] of Object.entries(COLLEAGUE_TEMPLATE_URLS)) {
    if (key.toLowerCase() === lower) return val;
  }
  return '';
}

// ─── 3. Festival Templates ──────────────────────────────────────────────────

export const FESTIVAL_TEMPLATE_URLS: Record<string, string> = {
  'new year1.gif': 'https://iili.io/nyrf7RI.gif',
  'new year2.gif': 'https://iili.io/nyrq9eI.gif',
  'ayudha pooja1.gif': 'https://iili.io/nyrBiPa.gif',
  'ayudha pooja2.gif': 'https://iili.io/nyrllzg.gif',
  'christmas1.gif': 'https://iili.io/nyro6o7.gif',
  'christmas2.gif': 'https://iili.io/nyrx5Jf.gif',
  'deepawali1.gif': 'https://iili.io/nyrx8qF.gif',
  'deepawali2.gif': 'https://iili.io/nyrz9e4.gif',
  'Ganesh Chaturthi1.gif': 'https://iili.io/nyrzP3u.gif',
  'Ganesh Chaturthi2.gif': 'https://iili.io/nyrI6oN.gif',
  'shivaratri1.gif': 'https://iili.io/nyrILKX.gif',
  'shivaratri2.gif': 'https://iili.io/nyrTAUg.gif',
  'ugadi1.gif': 'https://iili.io/nyrTeX2.gif',
  'ugadi2.gif': 'https://iili.io/nyruThl.gif',
  'varamahalakshmi1.gif': 'https://iili.io/nyruETx.gif',
  'varamahalakshmi2.gif': 'https://iili.io/nyrumn2.gif',
  'vijayadashami1.gif': 'https://iili.io/nyrR2fI.gif',
  'vijayadashami2.gif': 'https://iili.io/nyr59ku.gif',
  'pongal1.gif': 'https://iili.io/oJ3sSgR.gif',
  'pongal2.gif': 'https://iili.io/oJ3ZEfs.gif',
  'gandhi1.gif': 'https://iili.io/oJ3bOXI.gif',
  'gandhi2.gif': 'https://iili.io/oJ3Zt1a.gif',
  'republic1.gif': 'https://iili.io/oJ3mTQI.gif',
  'republic2.gif': 'https://iili.io/oJ3tREu.gif',
  'independence1.gif': 'https://iili.io/oJ3tZjS.gif',
  'independence2.gif': 'https://iili.io/oJ3D0cG.gif',
  'sankranti1.gif': 'https://iili.io/oJ3bHiX.gif',
};

export function getFestivalImageUrl(filename: string): string {
  if (!filename) return '';
  if (FESTIVAL_TEMPLATE_URLS[filename]) return FESTIVAL_TEMPLATE_URLS[filename];
  const lower = filename.trim().toLowerCase();
  for (const [key, val] of Object.entries(FESTIVAL_TEMPLATE_URLS)) {
    if (key.toLowerCase() === lower) return val;
  }
  return '';
}

export const FESTIVAL_TEMPLATES_MAP: Record<string, string[]> = {
  'ugadi': ['ugadi1.gif', 'ugadi2.gif'],
  'ganesh chaturthi': ['Ganesh Chaturthi1.gif', 'Ganesh Chaturthi2.gif'],
  'ayudha pooja': ['ayudha pooja1.gif', 'ayudha pooja2.gif'],
  'mahanavami': ['ayudha pooja1.gif', 'ayudha pooja2.gif'],
  'vijayadashami': ['vijayadashami1.gif', 'vijayadashami2.gif'],
  'deepavali': ['deepawali1.gif', 'deepawali2.gif'],
  'diwali': ['deepawali1.gif', 'deepawali2.gif'],
  'deepawali': ['deepawali1.gif', 'deepawali2.gif'],
  'christmas': ['christmas1.gif', 'christmas2.gif'],
  'new year': ['new year1.gif', 'new year2.gif'],
  'shivaratri': ['shivaratri1.gif', 'shivaratri2.gif'],
  'maha shivaratri': ['shivaratri1.gif', 'shivaratri2.gif'],
  'shivarathri': ['shivaratri1.gif', 'shivaratri2.gif'],
  'varamahalakshmi': ['varamahalakshmi1.gif', 'varamahalakshmi2.gif'],
  'varalakshmi': ['varamahalakshmi1.gif', 'varamahalakshmi2.gif'],
  'varamahalakshmi vrata': ['varamahalakshmi1.gif', 'varamahalakshmi2.gif'],
  'gandhi': ['gandhi1.gif', 'gandhi2.gif'],
  'gandhi jayanti': ['gandhi1.gif', 'gandhi2.gif'],
  'mahatma gandhi': ['gandhi1.gif', 'gandhi2.gif'],
  'independence': ['independence1.gif', 'independence2.gif'],
  'independence day': ['independence1.gif', 'independence2.gif'],
  'pongal': ['pongal1.gif', 'pongal2.gif'],
  'republic': ['republic1.gif', 'republic2.gif'],
  'republic day': ['republic1.gif', 'republic2.gif'],
  'sankranti': ['sankranti1.gif'],
  'makar sankranti': ['sankranti1.gif'],
  'makara sankranti': ['sankranti1.gif'],
};

export const DYNAMIC_FESTIVALS = [
  {
    name: 'New Year',
    date: '01-01',//DD-MM
    templates: ['new year1.gif', 'new year2.gif'],
  },
  {
    name: 'Pongal',
    date: '17-11', //DD-MM
    templates: ['pongal1.gif', 'pongal2.gif'],
  },
  {
    name: 'Maha Shivaratri',
    date: '11-16', //DD-MM
    templates: ['shivaratri1.gif', 'shivaratri2.gif'],
  },
  {
    name: 'Varamahalakshmi',
    date: '11-14', //DD-MM
    templates: ['varamahalakshmi1.gif', 'varamahalakshmi2.gif'],
  },
];

// ─── 4. Brand & Avatar Image Assets ─────────────────────────────────────────

export const INVENTECH_LOGO_URL = 'https://iili.io/oJuOMpR.png';

export const GENDER_AVATARS = {
  FEMALE: 'https://iili.io/o25dNMg.jpg',
  MALE: 'https://iili.io/odyh6kN.png',
};

export function getGenderAvatarUrl(gender?: string | null): string {
  const g = (gender || '').trim().toUpperCase();
  if (g === 'FEMALE' || g === 'F') {
    return GENDER_AVATARS.FEMALE;
  }
  return GENDER_AVATARS.MALE;
}
