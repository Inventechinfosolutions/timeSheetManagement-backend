import * as fs from 'fs';
import * as path from 'path';
import { NotePermission } from '../../notes/enums/note-permission.enum';

let inLogoBase64 = '';
try {
  const possiblePaths = [
    path.join(__dirname, '../../../assets/in-logo.png'),
    path.join(__dirname, '../../assets/in-logo.png'),
    path.join(__dirname, '../assets/in-logo.png'),
    path.join(process.cwd(), 'assets/in-logo.png'),
    path.join(process.cwd(), 'src/assets/in-logo.png'),
    'c:\\Timesheet\\timeSheetManagement-backend\\assets\\in-logo.png',
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const buffer = fs.readFileSync(p);
      inLogoBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
      break;
    }
  }
} catch (err) {
  // Ignore fallback
}

export const IN_LOGO_SRC =
  inLogoBase64 ||
  'https://worksphere.inventech-developer.in/assets/inventech-logo-Cp1E027l.jpg';

const TABLE_COLORS_MAP: Record<string, string> = {
  '--tbl-black': '#000000',
  '--tbl-dark-slate': '#1e293b',
  '--tbl-slate-gray': '#475569',
  '--tbl-deep-blue': '#1d4ed8',
  '--tbl-electric-blue': '#2563eb',
  '--tbl-teal': '#0284c7',
  '--tbl-dark-green': '#15803d',
  '--tbl-bold-green': '#16a34a',
  '--tbl-bold-amber': '#d97706',
  '--tbl-bold-orange': '#ea580c',
  '--tbl-crimson-red': '#dc2626',
  '--tbl-deep-red': '#b91c1c',
  '--tbl-bold-pink': '#e11d48',
  '--tbl-vibrant-purple': '#9333ea',
  '--tbl-deep-purple': '#6b21a8',
  '--tbl-white': '#FFFFFF',
  '--tbl-gray': '#F1F5F9',
  '--tbl-blue': '#DBEAFE',
  '--tbl-cyan': '#A5F3FC',
  '--tbl-green': '#DCFCE7',
  '--tbl-lime': '#D9F99D',
  '--tbl-yellow': '#FEF9C3',
  '--tbl-orange': '#FED7AA',
  '--tbl-light-red': '#FEE2E2',
  '--tbl-purple': '#F3E8FF',
};

export const inlineTableEmailColors = (html: string): string => {
  if (!html) return '';
  let result = html;

  // 1. Replace var(--tbl-*) in styles with exact hex values
  result = result.replace(/var\((--tbl-[a-z0-9-]+)\)/gi, (match, varName) => {
    return TABLE_COLORS_MAP[varName.toLowerCase()] || match;
  });

  // 2. Inline background colors and bgcolor for bg-tbl-* class names
  for (const [varName, hex] of Object.entries(TABLE_COLORS_MAP)) {
    const cls = 'bg-' + varName.replace('--', '');
    const classPattern = new RegExp(`(<(td|th|tr)[^>]*?class="[^"]*?\\b${cls}\\b[^"]*"[^>]*?)>`, 'gi');
    result = result.replace(classPattern, (match, openTag) => {
      let updatedTag = openTag;
      if (!updatedTag.includes('bgcolor=')) {
        updatedTag += ` bgcolor="${hex}"`;
      }
      if (updatedTag.includes('style="')) {
        return updatedTag.replace('style="', `style="background-color: ${hex} !important; `) + '>';
      } else {
        return `${updatedTag} style="background-color: ${hex} !important;">`;
      }
    });
  }

  // 3. For any cell or row with explicit hex background-color, add bgcolor attribute for Outlook desktop support
  result = result.replace(/<(td|th|tr)([^>]*?style="[^"]*?background-color:\s*(#[0-9a-fA-F]{3,8})[^"]*"[^>]*?)>/gi, (match, tag, rest) => {
    if (match.includes('bgcolor=')) return match;
    const hexMatch = match.match(/background-color:\s*(#[0-9a-fA-F]{3,8})/i);
    if (hexMatch && hexMatch[1]) {
      return `<${tag}${rest} bgcolor="${hexMatch[1]}">`;
    }
    return match;
  });

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// Note share email — Wide, edge-to-edge corporate template with Inventech & WorkSphere header
// ─────────────────────────────────────────────────────────────────────────────
export const getNoteEmailTemplate = (
  noteTitle: string,
  noteContent: string,
  senderName: string,
  senderEmail: string,
  permission: NotePermission | string,
  customMessage?: string,
  attachments?: Array<{ name: string; downloadUrl: string }>,
  options?: { hasDescription?: boolean; hasDocument?: boolean; projectName?: string | null; noteType?: string },
): string => {
  const permStr = String(permission || '');
  const isEdit = permStr.includes('CanEdit') || permStr.includes('EDIT');
  const isDelete = permStr.includes('CanDelete') || permStr.includes('DELETE');
  const senderInitial = (senderName || 'U').charAt(0).toUpperCase();
  const ctaText = isEdit ? 'Open Portal to Edit &#8594;' : 'Open in WorkSphere Inbox &#8594;';
  const ctaColor = isEdit ? '#16a34a' : '#0a8fe7';
  const ctaNote = isEdit
    ? `You have ${isDelete ? 'edit & delete' : 'edit'} access. Log in to WorkSphere to manage this note directly.`
    : 'This is a read-only view. Log in to WorkSphere to view it in your Inbox.';
  const year = new Date().getFullYear();

  const showDescription = options?.hasDescription !== false;
  const showAttachments = options?.hasDocument !== false && attachments && attachments.length > 0;

  const customMsgBlock = customMessage ? `
<tr>
  <td style="padding:14px 44px 0 44px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbeb;border:1px solid #fbd38d;border-radius:6px;">
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;color:#b7791f;text-transform:uppercase;letter-spacing:1px;">Message from sender</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#744210;line-height:1.6;">${customMessage}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>` : '';

  const attachmentsBlock = showAttachments ? `
<tr>
  <td style="padding:0 44px 28px 44px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:0 0 12px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#4a5568;text-transform:uppercase;letter-spacing:1px;">&#128206; Attached Documents (${attachments!.length})</p>
        </td>
      </tr>
      ${attachments!.map(att => `
      <tr>
        <td style="padding:5px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
            <tr>
              <td style="padding:12px 18px;font-family:Arial,sans-serif;font-size:13.5px;color:#1e293b;font-weight:500;">
                &#128196; &nbsp;${att.name}
              </td>
              <td align="right" style="padding:12px 18px;">
                <span style="display:inline-block;background-color:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:5px 12px;font-family:Arial,sans-serif;font-size:11.5px;font-weight:600;border-radius:4px;">
                  &#128206; Attached to email
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`).join('')}
    </table>
  </td>
</tr>` : '';

  const formattedNoteContent = inlineTableEmailColors(noteContent || '');

  const contentBlock = showDescription ? `
<!-- NOTE CONTENT (EXPANDED WIDTH) -->
<tr>
  <td class="pad" style="padding:16px 44px 26px 44px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
      <tr>
        <td style="padding:28px 32px;font-family:Arial,sans-serif;font-size:14.5px;color:#1e293b;line-height:1.8;">
          <div class="note-content">
            ${formattedNoteContent || '<p style="color:#94a3b8;font-style:italic;font-family:Arial,sans-serif;font-size:14.5px;">No content provided.</p>'}
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>` : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${noteTitle} - WorkSphere Note</title>
<!--[if mso]>
<noscript><xml>
  <o:OfficeDocumentSettings>
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml></noscript>
<style>
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  td, th { padding:0; }
</style>
<![endif]-->
<style>
  :root {
    --tbl-black: #000000;
    --tbl-dark-slate: #1e293b;
    --tbl-slate-gray: #475569;
    --tbl-deep-blue: #1d4ed8;
    --tbl-electric-blue: #2563eb;
    --tbl-teal: #0284c7;
    --tbl-dark-green: #15803d;
    --tbl-bold-green: #16a34a;
    --tbl-bold-amber: #d97706;
    --tbl-bold-orange: #ea580c;
    --tbl-crimson-red: #dc2626;
    --tbl-deep-red: #b91c1c;
    --tbl-bold-pink: #e11d48;
    --tbl-vibrant-purple: #9333ea;
    --tbl-deep-purple: #6b21a8;
    --tbl-white: #FFFFFF;
    --tbl-gray: #F1F5F9;
    --tbl-blue: #DBEAFE;
    --tbl-cyan: #A5F3FC;
    --tbl-green: #DCFCE7;
    --tbl-lime: #D9F99D;
    --tbl-yellow: #FEF9C3;
    --tbl-orange: #FED7AA;
    --tbl-light-red: #FEE2E2;
    --tbl-purple: #F3E8FF;
  }
  .bg-tbl-black { background-color: #000000 !important; }
  .bg-tbl-dark-slate { background-color: #1e293b !important; }
  .bg-tbl-slate-gray { background-color: #475569 !important; }
  .bg-tbl-deep-blue { background-color: #1d4ed8 !important; }
  .bg-tbl-electric-blue { background-color: #2563eb !important; }
  .bg-tbl-teal { background-color: #0284c7 !important; }
  .bg-tbl-dark-green { background-color: #15803d !important; }
  .bg-tbl-bold-green { background-color: #16a34a !important; }
  .bg-tbl-bold-amber { background-color: #d97706 !important; }
  .bg-tbl-bold-orange { background-color: #ea580c !important; }
  .bg-tbl-crimson-red { background-color: #dc2626 !important; }
  .bg-tbl-deep-red { background-color: #b91c1c !important; }
  .bg-tbl-bold-pink { background-color: #e11d48 !important; }
  .bg-tbl-vibrant-purple { background-color: #9333ea !important; }
  .bg-tbl-deep-purple { background-color: #6b21a8 !important; }
  .bg-tbl-white { background-color: #FFFFFF !important; }
  .bg-tbl-gray { background-color: #F1F5F9 !important; }
  .bg-tbl-blue { background-color: #DBEAFE !important; }
  .bg-tbl-cyan { background-color: #A5F3FC !important; }
  .bg-tbl-green { background-color: #DCFCE7 !important; }
  .bg-tbl-lime { background-color: #D9F99D !important; }
  .bg-tbl-yellow { background-color: #FEF9C3 !important; }
  .bg-tbl-orange { background-color: #FED7AA !important; }
  .bg-tbl-light-red { background-color: #FEE2E2 !important; }
  .bg-tbl-purple { background-color: #F3E8FF !important; }

  html, body { margin:0 !important; padding:0 !important; width:100% !important; background-color:#ffffff; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  p { margin:0; padding:0; }
  .note-content p  { color:#334155; font-size:14.5px; line-height:1.8; margin:0 0 14px 0; font-family:Arial,sans-serif; }
  .note-content h1 { color:#0f172a; font-size:24px; font-weight:bold; margin:0 0 12px 0; font-family:Arial,sans-serif; }
  .note-content h2 { color:#0f172a; font-size:20px; font-weight:bold; margin:0 0 10px 0; font-family:Arial,sans-serif; }
  .note-content h3 { color:#0f172a; font-size:17px; font-weight:bold; margin:0 0 8px 0; font-family:Arial,sans-serif; }
  .note-content ul, .note-content ol { padding-left:24px; color:#334155; font-size:14.5px; line-height:1.8; margin:0 0 14px 0; }
  .note-content li { margin-bottom:5px; }
  .note-content code { background-color:#1e293b; color:#f1f5f9; padding:2px 7px; border-radius:4px; font-family:Consolas,Courier New,Courier,monospace; font-size:13px; }
  .note-content pre  { background-color:#1e293b; color:#f1f5f9; padding:18px; border-radius:6px; font-family:Consolas,Courier New,Courier,monospace; font-size:13px; line-height:1.6; margin:0 0 14px 0; overflow-x:auto; }
  .note-content blockquote { border-left:4px solid #0a8fe7; margin:0 0 14px 0; padding:12px 18px; background-color:#f0f9ff; color:#0369a1; font-size:14px; border-radius:0 6px 6px 0; }
  .note-content table { border-collapse:collapse; width:100%; margin-bottom:14px; }
  .note-content th { background-color:#f1f5f9; font-weight:bold; padding:10px 14px; border:1px solid #cbd5e1; font-family:Arial,sans-serif; font-size:13.5px; color:#1e293b; }
  .note-content td { padding:10px 14px; border:1px solid #cbd5e1; font-family:Arial,sans-serif; font-size:13.5px; color:#334155; }
  @media screen and (max-width:768px) {
    .outer { width:100% !important; border:none !important; }
    .pad   { padding-left:20px !important; padding-right:20px !important; }
    .header-td { padding:16px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;">

<!-- FULL-WIDTH CONTAINER: No wasted margin/grey gutters -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;width:100%;background-color:#ffffff;">
<tr>
<td align="center" style="margin:0;padding:0;">

<!--[if mso]><table width="980" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table class="outer" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:980px;margin:0 auto;background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">

<!-- TOP HEADER: INVENTECH LOGO ON LEFT | WORKSPHERE ON RIGHT -->
<tr>
  <td style="margin:0;padding:0;">
    <!--[if mso]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:980px;height:90px;">
      <v:fill type="gradient" color="#0a8fe7" color2="#1e46a1" angle="135"/>
      <v:textbox inset="0,0,0,0">
    <![endif]-->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #0a8fe7 0%, #1e46a1 100%);background-color:#0a8fe7;">
      <tr>
        <!-- LEFT: INVENTECH LOGO & BRAND -->
        <td class="header-td" style="padding:20px 44px;vertical-align:middle;" align="left">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;padding-right:14px;">
                <img src="cid:inventech-logo"
                     alt="InvenTech Logo"
                     width="42"
                     height="42"
                     style="display:block;width:42px;height:42px;border-radius:6px;border:0;background-color:#ffffff;object-fit:contain;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:19px;font-weight:bold;color:#ffffff;letter-spacing:1px;line-height:1.2;display:block;">INVENTECH</span>
                <span style="font-family:Arial,sans-serif;font-size:10px;color:#d0eaff;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;display:block;">Info Solutions</span>
              </td>
            </tr>
          </table>
        </td>

        <!-- RIGHT: WORKSPHERE BRAND & SECTION -->
        <td class="header-td" style="padding:20px 44px;vertical-align:middle;" align="right">
          <table cellpadding="0" cellspacing="0" border="0" align="right">
            <tr>
              <td align="right" style="vertical-align:middle;">
                <span style="font-family:Georgia,'Segoe UI',Arial,serif;font-size:25px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;line-height:1.1;display:block;">WORKSPHERE</span>
                <span style="font-family:Arial,sans-serif;font-size:11px;color:#cce9ff;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;display:block;margin-top:2px;">Notes &amp; Inbox</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <!--[if mso]></v:textbox></v:rect><![endif]-->
  </td>
</tr>

<!-- SENDER INFO -->
<tr>
  <td class="pad" style="background-color:#f8fafc;padding:16px 44px;border-bottom:1px solid #e2e8f0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="46" style="vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="42" height="42" align="center" valign="middle" style="background:linear-gradient(135deg, #0a8fe7 0%, #1e46a1 100%);background-color:#0a8fe7;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;line-height:42px;border-radius:50%;">${senderInitial}</td>
            </tr>
          </table>
        </td>
        <td style="padding-left:14px;vertical-align:middle;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#1e293b;">${senderName}</p>
          <p style="margin:2px 0 0 0;font-family:Arial,sans-serif;font-size:12.5px;color:#64748b;">${senderEmail} &nbsp;&#8226;&nbsp; shared a note with you</p>
        </td>
      </tr>
    </table>
  </td>
</tr>

<!-- NOTE TITLE & NOMENCLATURE -->
<tr>
  <td class="pad" style="padding:24px 44px 10px 44px;">
    ${options?.projectName ? `
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
      <tr>
        <td style="background-color:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:4px 12px;font-family:Arial,sans-serif;font-size:11.5px;font-weight:bold;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;line-height:16px;">
          &#128193; Project: ${options.projectName}
        </td>
      </tr>
    </table>
    ` : ""}
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;">
      <tr>
        <td style="vertical-align:baseline;padding-right:8px;">
          <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;white-space:nowrap;">Title/Subject:</span>
        </td>
        <td style="vertical-align:baseline;">
          <span style="font-family:Arial,sans-serif;font-size:24px;font-weight:bold;color:#0f172a;line-height:1.3;">${noteTitle}</span>
        </td>
      </tr>
    </table>
    <table width="64" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
      <tr><td height="3" style="background-color:#0a8fe7;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td>
</tr>

${customMsgBlock}

${contentBlock}

${attachmentsBlock}

<!-- CTA BUTTON -->
<tr>
  <td class="pad" align="center" style="padding:10px 44px 34px 44px;">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://worksphere.inventech-developer.in"
      style="height:48px;v-text-anchor:middle;width:320px;" arcsize="10%"
      fillcolor="${ctaColor}" stroke="f">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${isEdit ? 'Open Portal to Edit' : 'Open in WorkSphere Inbox'}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="https://worksphere.inventech-developer.in"
       style="display:inline-block;background-color:${ctaColor};color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 44px;letter-spacing:0.3px;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${ctaText}
    </a>
    <!--<![endif]-->
    <p style="margin:12px 0 0 0;font-family:Arial,sans-serif;font-size:11.5px;color:#94a3b8;text-align:center;">${ctaNote}</p>
  </td>
</tr>

<!-- FOOTER -->
<tr>
  <td class="pad" style="background-color:#f8fafc;padding:20px 44px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11.5px;color:#94a3b8;line-height:1.6;text-align:center;">
      This is an automated notification from WorkSphere Notes. Do not reply to this email.<br>
      &copy; ${year} InvenTech Info Solutions. All rights reserved.
    </p>
  </td>
</tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td>
</tr>
</table>

</body>
</html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic notification email — Wide, corporate design with Inventech & WorkSphere header
// ─────────────────────────────────────────────────────────────────────────────
export const getNotificationEmailTemplate = (
  title: string,
  message: string,
): string => {
  const year = new Date().getFullYear();
  const msgHtml = message.replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<style>
  html, body { margin:0 !important; padding:0 !important; width:100% !important; background-color:#ffffff; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  body, table, td, p, a { font-family:Arial,sans-serif; text-size-adjust:100%; }
  @media screen and (max-width:768px) {
    .container { width:100% !important; border:none !important; }
    .content { padding:24px !important; }
    .header-td { padding:16px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;width:100%;background-color:#ffffff;">
<tr>
<td align="center" style="margin:0;padding:0;">

<table class="container" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:960px;margin:0 auto;background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">

<!-- TOP HEADER -->
<tr>
  <td style="margin:0;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #0a8fe7 0%, #1e46a1 100%);background-color:#0a8fe7;">
      <tr>
        <!-- LEFT: INVENTECH LOGO -->
        <td class="header-td" style="padding:20px 40px;vertical-align:middle;" align="left">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;padding-right:14px;">
                <img src="cid:inventech-logo"
                     alt="InvenTech Logo"
                     width="42"
                     height="42"
                     style="display:block;width:42px;height:42px;border-radius:6px;border:0;background-color:#ffffff;object-fit:contain;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:1px;line-height:1.2;display:block;">INVENTECH</span>
                <span style="font-family:Arial,sans-serif;font-size:10px;color:#d0eaff;letter-spacing:1px;text-transform:uppercase;font-weight:600;display:block;">Info Solutions</span>
              </td>
            </tr>
          </table>
        </td>

        <!-- RIGHT: WORKSPHERE -->
        <td class="header-td" style="padding:20px 40px;vertical-align:middle;" align="right">
          <table cellpadding="0" cellspacing="0" border="0" align="right">
            <tr>
              <td align="right" style="vertical-align:middle;">
                <span style="font-family:Georgia,serif;font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;line-height:1.1;display:block;">WORKSPHERE</span>
                <span style="font-family:Arial,sans-serif;font-size:11px;color:#cce9ff;letter-spacing:1px;text-transform:uppercase;font-weight:600;display:block;margin-top:2px;">${title}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>

<tr>
  <td class="content" style="padding:40px;">
    <p style="margin:0 0 28px 0;font-size:15px;line-height:1.8;color:#1e293b;">${msgHtml}</p>
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://worksphere.inventech-developer.in"
      style="height:46px;v-text-anchor:middle;width:240px;" arcsize="10%" fillcolor="#0a8fe7" stroke="f">
      <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">LOGIN TO PORTAL</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="https://worksphere.inventech-developer.in"
       style="background-color:#0a8fe7;color:#ffffff;text-decoration:none;padding:14px 36px;font-size:14px;font-weight:bold;display:inline-block;border-radius:6px;">
      LOGIN TO PORTAL &#8594;
    </a>
    <!--<![endif]-->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;margin-top:36px;padding-top:20px;">
      <tr><td><p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.6;">
        This is an automated message. Do not reply directly.<br>&copy; ${year} InvenTech Info Solutions. All rights reserved.
      </p></td></tr>
    </table>
  </td>
</tr>
</table>

</td></tr>
</table>
</body>
</html>`;
};
