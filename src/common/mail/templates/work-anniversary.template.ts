import dayjs from 'dayjs';
import * as path from 'path';

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
}

export const getOrdinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export const getWorkAnniversarySubject = (employeeName: string, years: number = 1): string => {
  const ordinal = `${years}${getOrdinalSuffix(years)}`;
  return `🎉 Happy ${ordinal} Work Anniversary, ${employeeName}!`;
};

// Production corporate email assets
// WorkSphere logo from user upload (hosted on CDN + fallback to local CID)
const WORKSPHERE_LOGO_URL = 'https://n.uguu.se/fFcdyile.png';
const INVENTECH_WEBSITE_URL = 'https://inventechinfo.com/';
// Golden drape & confetti background matching user reference template
const DEFAULT_ANNIVERSARY_BG_URL = 'https://n.uguu.se/jvCcpxFJ.jpg';

export const ANNIVERSARY_BG_PATH = path.join(process.cwd(), 'assets', 'anniversary-bg.jpg');
export const WORKSPHERE_LOGO_PATH = path.join(process.cwd(), 'assets', 'worksphere-logo.png');

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
  if (!name) return 'WS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Modern & Luxury Celebration Email Template for Work Anniversary:
 * - WorkSphere brand logo centered at the top
 * - Profile photo below in an elegant vertical OVAL frame with luxury double-ring golden halo
 * - Clean typography for Employee Name and Designation directly below the oval (no card/box)
 * - Modern, unique, high-end headline section (Milestone celebration kicker, script, bold year, navy capsule)
 * - Modern frosted appreciation card with personalized anniversary wishes addressing the individual employee
 * - 100% dynamic from database (no hardcoding)
 */
export const getWorkAnniversaryTemplate = (data: WorkAnniversaryData): string => {
  const joiningDay = data.joiningDate ? dayjs(data.joiningDate) : null;
  const annivDay = data.anniversaryDate ? dayjs(data.anniversaryDate) : dayjs();

  // Dynamic years calculation
  const calculatedYears = (joiningDay && joiningDay.isValid() && annivDay.isValid())
    ? Math.max(1, annivDay.diff(joiningDay, 'year'))
    : 1;
  const years = data.years && data.years > 0 ? data.years : calculatedYears;
  const suffix = getOrdinalSuffix(years);
  const ordinal = `${years}${suffix}`;

  const rawName = data.employeeName || 'Valued Team Member';
  const employeeName = escapeHtml(rawName);
  const designation = escapeHtml(data.designation || 'Team Member');
  const initials = escapeHtml(getInitials(rawName));

  const rawPhoto = data.profilePicUrl || '';
  const hasPhoto = !!(data.hasPhoto || rawPhoto);
  const photoSrc = hasPhoto
    ? (rawPhoto.startsWith('http') ? escapeHtml(rawPhoto) : 'cid:anniversary-profile-photo')
    : '';

  const bgSource = data.bgUrl || DEFAULT_ANNIVERSARY_BG_URL;
  const logoSource = data.logoUrl || WORKSPHERE_LOGO_URL;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Happy ${ordinal} Work Anniversary, ${employeeName}!</title>

  <!-- Google Fonts for authentic script calligraphy & bold corporate typography -->
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
    .cursive-script, .cursive-script * {
      font-family: 'Brush Script MT', 'Lucida Handwriting', 'Segoe Script', cursive, Georgia, serif !important;
      font-size: 32px !important;
      line-height: 36px !important;
      color: #78350F !important;
      background: transparent !important;
      background-color: transparent !important;
      mso-highlight: none !important;
      mso-shading: none !important;
      border: none !important;
      text-decoration: none !important;
      mso-line-height-rule: exactly !important;
    }
    .milestone-subline {
      font-size: 9.5px !important;
      letter-spacing: 0.5px !important;
      color: #78350F !important;
      font-weight: 800 !important;
    }
  </style>
  <![endif]-->

  <style>
    body, table, td, p, a, span {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }

    /* Suppress Gmail hover overlay icons */
    .a5q, .a6o, [role="button"][aria-label*="Download"], [role="button"][aria-label*="download"], img + div {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }

    .cursive-script, .cursive-script * {
      font-family: 'Alex Brush', 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive, Georgia, serif !important;
      color: #78350F !important;
      background: transparent !important;
      background-color: transparent !important;
      text-decoration: none !important;
      border: none !important;
      outline: none !important;
    }

    /* ─── Celebratory Slow-Motion Entrance & Glow Animations (Apple Mail / Modern Webmail) ─── */
    @keyframes celebrationEntrance {
      0% {
        opacity: 0;
        transform: scale(0.94) translateY(16px);
      }
      60% {
        opacity: 0.9;
      }
      100% {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    @keyframes goldenPulse {
      0%, 100% {
        box-shadow: 0 0 0 2px #F59E0B, 0 14px 32px rgba(180, 83, 9, 0.32);
      }
      50% {
        box-shadow: 0 0 0 4px #FBBF24, 0 18px 40px rgba(245, 158, 11, 0.55);
      }
    }

    .email-container {
      animation: celebrationEntrance 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    }

    .halo-pulse {
      animation: goldenPulse 3s ease-in-out infinite !important;
    }

    @media only screen and (max-width: 640px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; text-align: center !important; }
      .photo-cell { text-align: center !important; padding: 10px 0 !important; }
      .headline-cell { text-align: center !important; padding: 10px 0 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #F4EAD4; -webkit-font-smoothing: antialiased;">

  <!-- Hidden Preview Text -->
  <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    🎉 Congratulations ${employeeName} on your ${ordinal} Work Anniversary! Thank you for your continued dedication, leadership, and excellence.
  </div>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F4EAD4; table-layout: fixed; padding: 12px 0;">
    <tr>
      <td align="center" style="padding: 0 10px;">

        <!--[if mso]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="620">
        <tr>
        <td align="center" valign="top" width="620">
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:620px;height:840px;">
        <v:fill type="frame" src="${bgSource}" color="#F5E4C3" />
        <v:textbox inset="0,0,0,0">
        <![endif]-->

        <!-- ─── MAIN POSTER CONTAINER (Golden Drape Background) ─── -->
        <table role="presentation" class="email-container" width="620" border="0" cellspacing="0" cellpadding="0" background="${bgSource}" style="width: 620px; max-width: 620px; background-color: #FDFBF7; background-image: url('${bgSource}'); background-size: cover; background-position: center top; background-repeat: no-repeat; border-radius: 20px; overflow: hidden; box-shadow: 0 16px 48px rgba(180, 83, 9, 0.22); border: 1.5px solid #E5C378; table-layout: fixed;">
          
          <!-- Top Row: WorkSphere Logo Centered Directly Above Left Column (Oval Photo) -->
          <tr>
            <td style="padding: 24px 32px 14px 32px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout: fixed;">
                <tr>
                  <!-- Left cell (220px wide): Logo centered directly above the oval profile photo column -->
                  <td class="stack-column photo-cell" width="220" align="center" valign="middle" style="width: 220px; text-align: center; padding-right: 12px;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center">
                          <img src="${logoSource}"
                               alt="WorkSphere"
                               width="145"
                               style="display: block; width: 145px; height: auto; border: 0; outline: none; margin: 0 auto; pointer-events: none;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Right cell (336px wide): Empty so golden drape flows down gracefully -->
                  <td class="stack-column headline-cell" width="336" style="width: 336px; padding-left: 12px;">
                    &nbsp;
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Middle Row: Two-Column Showcase (Oval Photo Left + Matching-Height Milestone Card Right) -->
          <tr>
            <td style="padding: 0 32px 18px 32px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout: fixed;">
                <tr>

                  <!-- ─── LEFT: ELEGANT VERTICAL OVAL PROFILE PHOTO + NAME & DESIGNATION ─── -->
                  <td class="stack-column photo-cell" width="220" align="center" valign="top" style="width: 220px; vertical-align: top; text-align: center; padding-right: 12px;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center">
                          <!-- Outer Golden Halo & Pure Vertical Oval (width: 176px; height: 236px; border-radius: 50%) -->
                          <div class="halo-pulse" style="width: 176px; height: 236px; border-radius: 50%; overflow: hidden; border: 3.5px solid #FFFFFF; box-shadow: 0 0 0 2px #F59E0B, 0 14px 32px rgba(180, 83, 9, 0.32); background-color: #FFFFFF;">
                            ${
                              hasPhoto
                                ? `
                              <!--[if mso]>
                              <v:oval style="width:176px;height:236px;" stroked="false">
                                <v:fill type="frame" src="${photoSrc}" />
                                <v:textbox inset="0,0,0,0">
                              <![endif]-->
                              <table role="presentation" width="176" height="236" border="0" cellspacing="0" cellpadding="0" background="${photoSrc}" style="width: 176px; height: 236px; border-collapse: collapse; background-image: url('${photoSrc}'); background-size: cover; background-position: center top; background-repeat: no-repeat; border-radius: 50%; pointer-events: none;">
                                <tr>
                                  <td width="176" height="236" align="center" valign="middle" style="width: 176px; height: 236px; padding: 0; pointer-events: none;">
                                    <div style="width: 176px; height: 236px; line-height: 236px; font-size: 0; opacity: 0; pointer-events: none;">&nbsp;</div>
                                  </td>
                                </tr>
                              </table>
                              <!--[if gte mso 9]>
                                </v:textbox>
                              </v:oval>
                              <![endif]-->
                              `
                                : `
                              <!-- Graceful Executive Monogram Oval Fallback -->
                              <table role="presentation" width="176" height="236" border="0" cellspacing="0" cellpadding="0" style="height: 236px; width: 176px; background: linear-gradient(145deg, #FFF9ED 0%, #F8E6C2 50%, #E6B86A 100%); border-radius: 50%;">
                                <tr>
                                  <td align="center" valign="middle" style="text-align: center;">
                                    <div style="width: 80px; height: 80px; border-radius: 50%; background-color: #FFFFFF; border: 3px solid #E6B86A; margin: 0 auto 10px auto; box-shadow: 0 6px 16px rgba(180, 83, 9, 0.25);">
                                      <table role="presentation" width="100%" height="100%" border="0" cellspacing="0" cellpadding="0">
                                        <tr>
                                          <td align="center" valign="middle" style="font-family: 'Montserrat', sans-serif; font-size: 28px; font-weight: 800; color: #0F2C59; line-height: 1;">
                                            ${initials}
                                          </td>
                                        </tr>
                                      </table>
                                    </div>
                                    <div style="font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 800; color: #854D0E; letter-spacing: 1.5px; text-transform: uppercase;">
                                      ${ordinal} YEAR
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              `
                            }
                          </div>
                        </td>
                      </tr>

                      <!-- Clean Typography Directly Below Oval (No Box) -->
                      <tr>
                        <td align="center" style="padding-top: 12px;">
                          <div style="font-family: 'Montserrat', sans-serif; font-size: 19px; font-weight: 800; color: #0B2545; text-transform: uppercase; letter-spacing: 0.6px; line-height: 1.2;">
                            ${employeeName}
                          </div>
                          <div style="font-family: 'Montserrat', sans-serif; font-size: 13px; font-weight: 700; color: #854D0E; text-transform: capitalize; letter-spacing: 0.5px; margin-top: 4px; line-height: 1.2;">
                            ${designation}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- ─── RIGHT: MODERN & UNIQUE MILESTONE HEADLINE SECTION (CLEAN TEXT DIRECTLY ON BACKGROUND) ─── -->
                  <td class="stack-column headline-cell" width="336" align="center" valign="middle" style="width: 336px; vertical-align: middle; text-align: center; padding-left: 12px;">
                    
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto; width: 100%; height: 291px;" height="291">
                      <tr>
                        <td align="center" valign="middle" style="padding: 10px 12px; height: 291px; min-height: 291px;" height="291">
                          
                          <!-- High-Contrast Milestone Badge Tag -->
                          <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 6px auto;">
                            <tr>
                              <td style="background-color: #FFFFFF; border-radius: 12px; padding: 4px 16px; border: 1.5px solid #E5C378; box-shadow: 0 2px 8px rgba(180, 83, 9, 0.15);">
                                <div style="font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 800; color: #78350F; letter-spacing: 2.2px; text-transform: uppercase; line-height: 1;">
                                  ✦ MILESTONE CELEBRATION ✦
                                </div>
                              </td>
                            </tr>
                          </table>

                          <!-- Calligraphy Script: Rich Dark Gold, Zero Background / No Box (Transparent & Clean) -->
                          <div class="cursive-script" style="font-family: 'Alex Brush', 'Brush Script MT', cursive; font-size: 36px; line-height: 40px; color: #78350F; font-weight: 700; margin: 4px 0 0 0; text-shadow: 0 1px 3px rgba(255, 255, 255, 0.95), 0 0 2px #FFFFFF; white-space: nowrap; background: transparent !important; background-color: transparent !important; mso-highlight: none !important; mso-shading: none !important; border: 0 !important; outline: none !important;">
                            Cong&zwnj;ratu&zwnj;lations
                          </div>

                          <!-- Sculpted Milestone Number (e.g. 1st, 2nd, 3rd) in Rich Dark Gold -->
                          <div style="font-family: 'Montserrat', sans-serif; font-size: 78px; font-weight: 900; color: #78350F; line-height: 78px; letter-spacing: -2px; margin: 2px 0; text-shadow: 0 2px 10px rgba(255, 255, 255, 0.95), 0 1px 2px #FFFFFF;">
                            ${ordinal}
                          </div>

                          <!-- Modern Royal Navy Capsule Ribbon (Solid Navy fallback for Outlook MSO) -->
                          <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 8px auto 0 auto;">
                            <tr>
                              <td bgcolor="#0B2545" style="background-color: #0B2545; background: linear-gradient(135deg, #0B2545 0%, #153E6B 100%); border-radius: 22px; padding: 10px 24px; border: 1.5px solid #E5C378; box-shadow: 0 6px 16px rgba(11, 37, 69, 0.32);">
                                <div style="font-family: 'Montserrat', sans-serif; font-size: 13px; font-weight: 800; color: #FFFFFF; letter-spacing: 2px; text-transform: uppercase; line-height: 1; text-align: center;">
                                  WORK ANNIVERSARY
                                </div>
                              </td>
                            </tr>
                          </table>

                          <!-- Subline: High-Visibility Rich Dark Gold Color -->
                          <div class="milestone-subline" style="font-family: 'Montserrat', sans-serif; font-size: 10.5px; font-weight: 800; color: #78350F; letter-spacing: 1px; text-transform: uppercase; margin-top: 10px; text-shadow: 0 1px 3px rgba(255, 255, 255, 0.95), 0 0 2px #FFFFFF;">
                            HONORING YOUR MILESTONE &amp; DEDICATION
                          </div>

                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bottom Row: Modern Luxury Appreciation Card -->
          <tr>
            <td align="center" style="padding: 14px 36px 26px 36px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="background: rgba(255, 255, 255, 0.92); border: 1.5px solid rgba(245, 158, 11, 0.4); border-radius: 18px; padding: 26px 32px; box-shadow: 0 10px 30px rgba(180, 83, 9, 0.12);">
                    
                    <!-- Personalized Individual Anniversary Text (Speaking directly to the employee) -->
                    <p style="margin: 0; font-family: 'Montserrat', sans-serif; font-size: 14px; line-height: 26px; font-weight: 600; color: #1E293B; text-align: center;">
                      Wishing you a very Happy ${ordinal} Work Anniversary! Thank you for your outstanding dedication, hard work, and invaluable contributions. May this special milestone bring you immense pride in all that you have accomplished, and wishing you ongoing growth, rewarding experiences, and continued success ahead!
                    </p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corporate Sub-Footer Bar -->
          <tr>
            <td align="center" style="background-color: #0B2545; padding: 10px 16px;">
              <div style="font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 600; color: #CBD5E1; letter-spacing: 0.8px;">
                Worksphere &bull; Developed by <a href="${INVENTECH_WEBSITE_URL}" target="_blank" style="color: #FFFFFF; text-decoration: underline; font-weight: 700;">InvenTech Info Solutions</a>
              </div>
            </td>
          </tr>

        </table>
        <!-- ─── END MAIN POSTER CONTAINER ─── -->

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
