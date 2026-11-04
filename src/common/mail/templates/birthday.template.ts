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

// Production Cloudflare CDN URLs
const REMOTE_BG_URL = 'https://iili.io/niKiYTx.jpg';
const WORKSPHERE_LOGO_URL = 'https://iili.io/ni8btUX.png';
const INVENTECH_LOGO_URL = 'https://iili.io/niGVDga.png';
const INVENTECH_WEBSITE_URL = 'https://inventechinfo.com/';

// Local path to the imported background template
export const BIRTHDAY_BG_PATH = path.join(process.cwd(), 'assets', 'birthday-bg.jpg');

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
 * Premium Royal Blue & Gold Corporate Birthday Email Template for Worksphere.
 * - Royal Blue vertical banner & golden ribbon backdrop
 * - Official Worksphere logo positioned at the top of the blue banner
 * - Employee profile photo in gold-bordered executive portrait frame on left (dead centered in blue stripe)
 * - Employee name in elegant calligraphy signature font
 * - Employee designation and company subline
 * - "Happy Birthday" in bold typography and royal navy cursive script on right
 * - Warm corporate birthday greeting message
 * - Footer bar: Worksphere Developed by InvenTech (links directly to https://inventechinfo.com/)
 * - Zero links on the worksphere message/photo as requested
 * - Zero hover download buttons
 */
export const getBirthdayNotificationTemplate = (
  data: BirthdayTemplateData,
): string => {
  const rawName = data.employeeName || data.fullName || 'Valued Team Member';
  const employeeName = escapeHtml(rawName);
  const designation = escapeHtml(data.designation || 'Team Member');
  const company = escapeHtml(data.companyName || 'Worksphere');
  const rawPhoto = data.employeePhotoUrl || data.photoUrl || '';
  const photoSrc = (data.hasPhoto || rawPhoto)
    ? (rawPhoto.startsWith('http') ? escapeHtml(rawPhoto) : 'cid:profile-photo')
    : '';
  const initials = escapeHtml(getInitials(rawName));
  const bgSource = data.bgUrl || REMOTE_BG_URL;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Happy Birthday, ${employeeName}!</title>

  <!-- Google Fonts for authentic script calligraphy & bold typography -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

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
      font-family: 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', Georgia, cursive, serif !important;
    }
    .birthday-script {
      font-size: 64px !important;
      line-height: 60px !important;
      white-space: nowrap !important;
    }
  </style>
  <![endif]-->

  <style>
    body, table, td, p, a, span {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    body {
      margin: 0 !important;
      padding: 20px 0 !important;
      width: 100% !important;
      background-color: #eef2f7;
    }
    .cursive-script {
      font-family: 'Alex Brush', 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', 'Playfair Display', cursive, Georgia, serif !important;
    }

    /* Aggressively suppress Gmail download & hover overlay icons */
    .a5q, .a6o, [role="button"][aria-label*="Download"], [role="button"][aria-label*="download"], img + div {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 20px 0; width: 100%; background-color: #eef2f7;">

  <!-- Preheader text preview -->
  <div style="display: none; font-size: 1px; color: #eef2f7; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    🎉 Wishing you a wonderful birthday filled with happiness, laughter, and beautiful memories, ${employeeName}!
  </div>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eef2f7; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 10px;">

        <!--[if mso]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="640">
        <tr>
        <td align="center" valign="top" width="640">
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:640px;height:670px;">
        <v:fill type="frame" src="${bgSource}" color="#0E3B75" />
        <v:textbox inset="0,0,0,0">
        <![endif]-->

        <!-- ─── MAIN POSTER CARD (Boxed Corporate Template matching reference) ─── -->
        <table role="presentation" class="email-container" width="640" border="0" cellspacing="0" cellpadding="0" background="${bgSource}" style="width: 640px; max-width: 640px; background-color: #FFFFFF; background-image: url('${bgSource}'); background-repeat: no-repeat; background-position: center top; background-size: 640px 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 44px rgba(14, 59, 117, 0.22); border: 1.5px solid #D4AF37;">
          <tr>
            <td style="padding: 0;">
              <table role="presentation" width="640" border="0" cellspacing="0" cellpadding="0" style="width: 640px; border-collapse: collapse; table-layout: fixed;">
                <tr>

                  <!-- ─── 1. LEFT CONFETTI & RIBBON SPACER (64px) ─── -->
                  <td width="64" style="width: 64px; min-width: 64px; max-width: 64px; padding: 0; line-height: 1;">&nbsp;</td>

                  <!-- ─── 2. ROYAL BLUE STRIPE COLUMN: LOGO, PHOTO & SIGNATURE (206px) ─── -->
                  <td width="206" align="center" valign="top" style="width: 206px; min-width: 206px; max-width: 206px; vertical-align: top; text-align: center; padding: 12px 0 20px 0;">
                    
                    <!-- Worksphere Header Logo (Positioned at Top of Blue Banner) -->
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 12px auto;">
                      <tr>
                        <td align="center">
                          <img src="${WORKSPHERE_LOGO_URL}"
                               alt="Worksphere"
                               width="135"
                               style="display: block; width: 135px; height: auto; border: 0; outline: none; margin: 0 auto; pointer-events: none; -webkit-user-drag: none;" />
                        </td>
                      </tr>
                    </table>

                    <!-- Portrait Frame with Golden Border (Mathematically Centered in Blue Stripe) -->
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 5px; background: linear-gradient(135deg, #FFF6E5 0%, #F8E6C2 50%, #D4AF37 100%); background-color: #F8E6C2; border-radius: 16px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);">
                          <div style="width: 162px; height: 210px; border-radius: 12px; overflow: hidden; border: 2.5px solid #FFFFFF; background-color: #FFFFFF;">
                            ${
                              photoSrc
                                ? `
                              <!--[if gte mso 9]>
                              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:162px;height:210px;">
                                <v:fill type="frame" src="${photoSrc}" />
                                <v:textbox inset="0,0,0,0">
                              <![endif]-->
                              <table role="presentation" width="162" height="210" border="0" cellspacing="0" cellpadding="0" background="${photoSrc}" style="width: 162px; height: 210px; border-collapse: collapse; background-image: url('${photoSrc}'); background-size: cover; background-position: center top; background-repeat: no-repeat; border-radius: 12px; pointer-events: none;">
                                <tr>
                                  <td width="162" height="210" align="center" valign="middle" style="width: 162px; height: 210px; padding: 0; pointer-events: none;">
                                    <div style="width: 162px; height: 210px; line-height: 210px; font-size: 0; opacity: 0; pointer-events: none;">&nbsp;</div>
                                  </td>
                                </tr>
                              </table>
                              <!--[if gte mso 9]>
                                </v:textbox>
                              </v:rect>
                              <![endif]-->
                              `
                                : `
                              <!-- Executive Monogram Fallback -->
                              <table role="presentation" width="100%" height="210" border="0" cellspacing="0" cellpadding="0" style="height: 210px; width: 162px; background: linear-gradient(145deg, #FFF9ED 0%, #F8E6C2 50%, #E6B86A 100%);">
                                <tr>
                                  <td align="center" valign="middle">
                                    <div style="width: 72px; height: 72px; border-radius: 50%; background: #FFFFFF; border: 3px solid #D4AF37; text-align: center; line-height: 72px; font-family: 'Montserrat', sans-serif; font-size: 28px; font-weight: 900; color: #0E3B75; box-shadow: 0 6px 14px rgba(0,0,0,0.25);">
                                      ${initials}
                                    </div>
                                    <div class="cursive-script" style="font-family: 'Alex Brush', cursive; font-size: 22px; color: #0E3B75; margin-top: 8px; letter-spacing: 0.5px;">
                                      Best Wishes
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

                    <!-- Employee Name Signature in Script Font (Bright White with Glow on Blue) -->
                    <div class="cursive-script" style="font-family: 'Alex Brush', 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive, Georgia, serif; font-size: 34px; line-height: 1.15; color: #FFFFFF; font-weight: 600; margin-top: 10px; text-shadow: 0 2px 8px rgba(0,0,0,0.7); padding: 0 8px; word-break: break-word; white-space: nowrap;">
                      ${employeeName}
                    </div>

                    <!-- Designation Underneath (Bright Champagne Gold) -->
                    <div style="font-family: 'Montserrat', sans-serif; font-size: 13px; font-weight: 800; color: #F8E6C2; margin-top: 3px; letter-spacing: 0.5px; text-shadow: 0 1px 4px rgba(0,0,0,0.6); padding: 0 8px;">
                      (${designation})
                    </div>

                  </td>

                  <!-- ─── 3. RIGHT CONTENT COLUMN (370px) ─── -->
                  <td width="370" valign="middle" style="width: 370px; min-width: 370px; max-width: 370px; vertical-align: middle; padding: 32px 30px 28px 24px; box-sizing: border-box;">
                    
                    <!-- "Happy" in clean bold typography -->
                    <div style="font-family: 'Montserrat', sans-serif; font-size: 30px; font-weight: 600; color: #0E3B75; letter-spacing: 0.5px; line-height: 1;">
                      Happy
                    </div>

                    <!-- "Birthday" in Giant Navy Calligraphy Script (Single line, MSO safe) -->
                    <div class="cursive-script birthday-script" style="font-family: 'Alex Brush', 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive, Georgia, serif; font-size: 68px; line-height: 64px; color: #0E3B75; font-weight: 600; margin: 4px 0 16px 0; white-space: nowrap; mso-line-height-rule: exactly;">
                      Birthday
                    </div>

                    <!-- Warm Birthday Greeting Message (Bold Lead) -->
                    <div style="font-family: 'Montserrat', sans-serif; font-size: 14.5px; line-height: 24px; color: #0E3B75; font-weight: 700; max-width: 310px;">
                      Wishing you a wonderful birthday filled with happiness, laughter, and beautiful memories!
                    </div>

                    <!-- Inspiring Subline -->
                    <div style="font-family: 'Montserrat', sans-serif; font-size: 13px; line-height: 22px; color: #334155; margin-top: 12px; max-width: 310px;">
                      May this special day mark the beginning of an amazing year filled with new opportunities, exciting experiences, good health, and remarkable achievements. Wishing you endless happiness and success in everything you do. Have a fantastic birthday!
                    </div>

                  </td>

                </tr>
              </table>
            </td>
          </tr>

          <!-- ─── SLEEK BOTTOM FOOTER BAR (Worksphere Developed by InvenTech) ─── -->
          <tr>
            <td style="background-color: #0B2F64; padding: 12px 20px; text-align: center;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle;">
                    <img src="${WORKSPHERE_LOGO_URL}" alt="Worksphere" height="19" style="height: 19px; width: auto; display: block; border: 0;" />
                  </td>
                  <td style="padding: 0 8px; color: #FFFFFF; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 500; vertical-align: middle; letter-spacing: 0.5px; white-space: nowrap;">
                    &bull;&nbsp;&nbsp;Developed by
                  </td>
                  <td style="vertical-align: middle; white-space: nowrap;">
                    <a href="${INVENTECH_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" style="color: #F8E6C2; text-decoration: underline; font-weight: 700; font-family: 'Montserrat', sans-serif; font-size: 11.5px; letter-spacing: 0.5px;">InvenTech Info Solutions</a>
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
</html>`;
};

// Export backward-compatible aliases
export const getBirthdayCelebrationTemplate = getBirthdayNotificationTemplate;
