import dayjs from 'dayjs';
import * as fs from 'fs';
import * as path from 'path';

export interface BirthdayTemplateData {
  employeeName?: string;
  fullName?: string;
  designation?: string;
  birthdayDate?: string;
  date?: string;
  employeePhotoUrl?: string;
  photoUrl?: string;
  hasPhoto?: boolean;
  companyName?: string;
  portalUrl?: string;
  gender?: string;
  employeeId?: string;
  bgUrl?: string;
}

export type BirthdayCelebrationData = BirthdayTemplateData;

// Production Cloudflare CDN URL for the new White & Gold Balloon Background
const REMOTE_BG_URL = 'https://iili.io/nLqc3Zv.jpg';
// Official Worksphere Color Logo (Transparent)
const WORKSPHERE_LOGO_URL = 'https://iili.io/nLuaTbV.png';
const INVENTECH_WEBSITE_URL = 'https://inventechinfo.com/';

// Local path to the background template
export const BIRTHDAY_BG_PATH = path.join(process.cwd(), 'assets', 'birthday-gold-bg.jpg');

export const getBirthdayMailAttachments = (
  photoDataUri?: string,
): Array<{ filename?: any; path?: string; content?: any; encoding?: string; contentType?: string; cid?: string; contentDisposition?: string }> => {
  const attachments: Array<{ filename?: any; path?: string; content?: any; encoding?: string; contentType?: string; cid?: string; contentDisposition?: string }> = [];

  if (photoDataUri && photoDataUri.startsWith('data:')) {
    const match = photoDataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      attachments.push({
        filename: false,
        content: match[2],
        encoding: 'base64',
        contentType: match[1] || 'image/jpeg',
        cid: 'profile-photo',
        contentDisposition: 'inline',
      });
    }
  }

  return attachments;
};

// Prevent HTML injection from dynamic employee data
const escapeHtml = (value?: string): string => {
  if (!value) return '';
  return value.replace(/[&<>"']/g, (char) => {
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
  if (!name) return 'WS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Premium White & Gold Corporate Birthday Email Template for Worksphere.
 * - Elegant centered vertical layout with white backdrop and golden/marble balloon borders.
 * - Official Worksphere branding at the top.
 * - "Happy Birthday" in calligraphy script (Happy in dark charcoal, Birthday in warm metallic gold).
 * - Compact arched portrait frame with reduced height.
 * - Bold golden employee name and designation.
 * - Warm corporate birthday quotation.
 */
export const getBirthdayNotificationTemplate = (
  data: BirthdayTemplateData,
): string => {
  const rawName = data.employeeName || data.fullName || 'Valued Team Member';
  const employeeName = escapeHtml(rawName);
  const designation = escapeHtml(data.designation || 'Team Member');
  const cdnBgUrl = data.bgUrl || REMOTE_BG_URL;
  const initials = getInitials(rawName);

  const hasPhoto = Boolean(data.hasPhoto || data.photoUrl || data.employeePhotoUrl);
  const photoUrl = data.photoUrl || data.employeePhotoUrl || '';

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Happy Birthday, ${employeeName}!</title>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">

  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <style type="text/css">
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    td { padding: 0; }
    .cursive-script {
      font-family: 'Brush Script MT', 'Segoe Script', cursive, Georgia, serif !important;
    }
    .birthday-script {
      font-size: 54px !important;
      line-height: 54px !important;
      white-space: nowrap !important;
    }
  </style>
  <![endif]-->

  <style>
    body, table, td, p, a, span {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
    }
    body {
      margin: 0 !important;
      padding: 25px 0 !important;
      width: 100% !important;
      background-color: #f4f6fa;
    }
    .cursive-script {
      font-family: 'Alex Brush', 'Brush Script MT', 'Segoe Script', cursive, Georgia, serif !important;
    }

    /* Suppress Gmail download & hover overlay icons */
    .a5q, .a6o, [role="button"][aria-label*="Download"], [role="button"][aria-label*="download"], img + div {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 25px 0; width: 100%; background-color: #f4f6fa;" bgcolor="#f4f6fa">

  <!-- Preheader text preview -->
  <div style="display: none; font-size: 1px; color: #f4f6fa; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    🎂 Wishing you a wonderful birthday filled with happiness, laughter, and success, ${employeeName}!
  </div>

  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f4f6fa" style="background-color: #f4f6fa; width: 100%; margin: 0; padding: 0;">
    <tr>
      <td align="center" style="padding: 10px 10px 30px 10px;">

        <!--[if mso]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="600" height="820">
        <tr>
        <td align="center" valign="top" width="600" height="820">
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:820px;">
        <v:fill type="frame" src="${cdnBgUrl}" color="#ffffff" />
        <v:textbox inset="0,0,0,0">
        <![endif]-->

        <table class="card-container" align="center" border="0" cellspacing="0" cellpadding="0" width="100%" bgcolor="#ffffff" style="max-width: 600px; width: 100%; min-height: 820px; margin: 0 auto; background-color: #ffffff; background-image: url('${cdnBgUrl}'); background-size: 100% 100%; background-position: center top; background-repeat: no-repeat; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; border-collapse: separate;">
          <tr>
            <td align="center" valign="top" style="padding: 42px 24px 35px 24px; text-align: center; vertical-align: top; box-sizing: border-box;">

              <!-- ─── 1. OFFICIAL WORKSPHERE LOGO ─── -->
              <table align="center" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="text-align: center;">
                    <img src="${WORKSPHERE_LOGO_URL}" width="210" height="55" alt="Worksphere" style="width: 210px; height: auto; max-height: 58px; display: block; margin: 0 auto; border: 0;" />
                  </td>
                </tr>
              </table>

              <!-- ─── 2. "Happy Birthday" CALLIGRAPHY ─── -->
              <table align="center" border="0" cellspacing="0" cellpadding="0" style="margin: 18px auto 16px auto;">
                <tr>
                  <td align="center" style="text-align: center; white-space: nowrap;">
                    <span class="cursive-script" style="font-family: 'Alex Brush', 'Brush Script MT', 'Segoe Script', cursive, Georgia, serif; font-size: 52px; line-height: 1; color: #1e293b; font-weight: 500; display: inline-block;">
                      Happy
                    </span>
                    &nbsp;
                    <span class="cursive-script birthday-script" style="font-family: 'Alex Brush', 'Brush Script MT', 'Segoe Script', cursive, Georgia, serif; font-size: 56px; line-height: 1; color: #c88a1e; font-weight: 600; display: inline-block;">
                      <nobr>Birthday</nobr>
                    </span>
                  </td>
                </tr>
              </table>

              <!-- ─── 3. TALL OVAL PROFILE PHOTO WITH RADIANT GOLD SHADOW EFFECT ─── -->
              <table align="center" border="0" cellspacing="0" cellpadding="0" style="margin: 6px auto 14px auto;">
                <tr>
                  <td align="center" style="padding: 14px;">
                    <div style="width: 195px; height: 245px; border-radius: 50%; overflow: hidden; background-color: #ffffff; box-shadow: 0 0 25px 8px rgba(229, 179, 44, 0.6), 0 0 45px 16px rgba(245, 205, 75, 0.35); -webkit-box-shadow: 0 0 25px 8px rgba(229, 179, 44, 0.6), 0 0 45px 16px rgba(245, 205, 75, 0.35); margin: 0 auto;">
                      ${hasPhoto && photoUrl
      ? `
                        <img src="${photoUrl}" width="195" height="245" alt="${employeeName}" style="width: 195px; height: 245px; border-radius: 50%; object-fit: cover; object-position: center top; display: block; border: 0;" />
                      `
      : `
                        <table width="195" height="245" border="0" cellspacing="0" cellpadding="0" bgcolor="#f8fafc" style="width: 195px; height: 245px; background-color: #f8fafc; border-radius: 50%;">
                          <tr>
                            <td align="center" valign="middle" style="text-align: center; vertical-align: middle;">
                              <div style="width: 84px; height: 84px; border-radius: 50%; background-color: #c88a1e; color: #ffffff; font-size: 32px; font-weight: bold; line-height: 84px; text-align: center; margin: 0 auto; box-shadow: 0 4px 14px rgba(200, 138, 30, 0.35);">
                                ${initials}
                              </div>
                              <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 12px; text-transform: uppercase; letter-spacing: 1px;">
                                Worksphere
                              </div>
                            </td>
                          </tr>
                        </table>
                      `
    }
                    </div>
                  </td>
                </tr>
              </table>

              <!-- ─── 4. EMPLOYEE NAME IN BOLD WARM GOLD ─── -->
              <div style="font-family: 'Montserrat', sans-serif; font-size: 27px; font-weight: 800; color: #c88a1e; letter-spacing: 0.5px; margin-top: 14px; line-height: 1.2;">
                ${employeeName}
              </div>

              <!-- ─── 5. DESIGNATION ─── -->
              <div style="font-family: 'Montserrat', sans-serif; font-size: 14.5px; font-weight: 700; color: #1e293b; margin-top: 5px; letter-spacing: 0.5px;">
                ${designation}
              </div>

              <!-- ─── 6. GOLDEN SPARKLE ACCENT (BRIDGES SPACE) ─── -->
              <div style="font-size: 13px; color: #c88a1e; letter-spacing: 8px; margin: 16px 0 14px 0;">
                ✦ &bull; ✦ &bull; ✦
              </div>

              <!-- ─── 7. WARM BIRTHDAY GREETING MESSAGE (DISTINCT FONT STYLES & SIZES) ─── -->
              <table align="center" border="0" cellspacing="0" cellpadding="0" style="max-width: 460px; width: 100%; margin: 0 auto;">
                <tr>
                  <td align="center" style="text-align: center;">
                    <!-- Lead highlight greeting: Sans-serif, bold, 16.5px, Deep Navy -->
                    <div style="font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16.5px; font-weight: 700; color: #0E3B75; line-height: 25px; letter-spacing: 0.2px;">
                      Wishing you a wonderful birthday filled with happiness, laughter, and beautiful memories!
                    </div>

                    <!-- Inspiring celebration paragraph: Serif, italic, 14.5px, Slate Charcoal -->
                    <div style="font-family: 'Georgia', 'Times New Roman', serif; font-size: 14.5px; font-weight: 400; font-style: italic; color: #475569; line-height: 24px; margin-top: 14px; letter-spacing: 0.2px;">
                      May this special day mark the beginning of an amazing year filled with new opportunities, exciting experiences, good health, and remarkable achievements. Wishing you endless happiness and success in everything you do. Have a fantastic birthday!
                    </div>
                  </td>
                </tr>
              </table>

              <!-- ─── 8. CALLIGRAPHY SIGN-OFF (FILLS SPACE HARMONIOUSLY) ─── -->
              <div class="cursive-script" style="font-family: 'Alex Brush', cursive, Georgia, serif; font-size: 22px; color: #c88a1e; font-weight: 600; margin-top: 22px; margin-bottom: 24px; line-height: 1;">
                Warmest Wishes &bull; Worksphere
              </div>

              <!-- ─── 9. FOOTER BAR (PLACED ABOVE BOTTOM STREAMERS) ─── -->
              <table align="center" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="font-family: 'Montserrat', sans-serif; font-size: 11.5px; color: #334155; font-weight: 600; letter-spacing: 0.5px;">
                    &copy; ${new Date().getFullYear()} <a href="${INVENTECH_WEBSITE_URL}" target="_blank" style="color: #0f172a; text-decoration: none; font-weight: 700;">InvenTech Info Solutions Pvt. Ltd.</a> &bull; <span style="color: #0E3B75; font-weight: 700;">Worksphere</span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

        <!--[if mso]>
        </v:textbox>
        </v:rect>
        </td>
        </tr>
        </table>
        <![endif]-->

      </td>
    </tr>
  </table>

</body>
</html>
`;
};

// Export backward-compatible aliases
export const getBirthdayCelebrationTemplate = getBirthdayNotificationTemplate;
