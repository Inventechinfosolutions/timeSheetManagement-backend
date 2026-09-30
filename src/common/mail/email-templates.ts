import { NotePermission } from '../../notes/enums/note-permission.enum';

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
): string => {
  const permStr = String(permission || '');
  const isEdit = permStr.includes('CanEdit') || permStr.includes('EDIT');
  const isDelete = permStr.includes('CanDelete') || permStr.includes('DELETE');
  const senderInitial = (senderName || 'U').charAt(0).toUpperCase();
  const ctaText   = isEdit ? 'Open Portal to Edit &#8594;' : 'Open in WorkSphere Inbox &#8594;';
  const ctaColor  = isEdit ? '#16a34a' : '#0a8fe7';
  const ctaNote   = isEdit
    ? `You have ${isDelete ? 'edit & delete' : 'edit'} access. Log in to WorkSphere to manage this note directly.`
    : 'This is a read-only view. Log in to WorkSphere to view it in your Inbox.';
  const year = new Date().getFullYear();

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

  const attachmentsBlock = attachments && attachments.length > 0 ? `
<tr>
  <td style="padding:0 44px 28px 44px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:0 0 12px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#4a5568;text-transform:uppercase;letter-spacing:1px;">&#128206; Attached Documents (${attachments.length})</p>
        </td>
      </tr>
      ${attachments.map(att => `
      <tr>
        <td style="padding:5px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
            <tr>
              <td style="padding:12px 18px;font-family:Arial,sans-serif;font-size:13.5px;color:#1e293b;font-weight:500;">
                &#128196; &nbsp;${att.name}
              </td>
              <td align="right" style="padding:12px 18px;">
                <a href="${att.downloadUrl}"
                   target="_blank"
                   style="display:inline-block;background-color:#eff6ff;color:#0a8fe7;border:1px solid #bfdbfe;padding:6px 14px;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;text-decoration:none;border-radius:4px;">
                  &#8595; Download
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`).join('')}
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
                <img src="https://worksphere.inventech-developer.in/assets/inventech-logo-Cp1E027l.jpg"
                     alt="InvenTech Logo"
                     width="42"
                     height="42"
                     style="display:block;width:42px;height:42px;border-radius:6px;border:0;background-color:#ffffff;" />
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

<!-- NOTE TITLE -->
<tr>
  <td class="pad" style="padding:28px 44px 10px 44px;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;color:#0f172a;line-height:1.3;">${noteTitle}</p>
    <table width="64" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
      <tr><td height="3" style="background-color:#0a8fe7;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td>
</tr>

${customMsgBlock}

<!-- NOTE CONTENT (EXPANDED WIDTH) -->
<tr>
  <td class="pad" style="padding:16px 44px 26px 44px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
      <tr>
        <td style="padding:28px 32px;font-family:Arial,sans-serif;font-size:14.5px;color:#1e293b;line-height:1.8;">
          <div class="note-content">
            ${noteContent || '<p style="color:#94a3b8;font-style:italic;font-family:Arial,sans-serif;font-size:14.5px;">No content provided.</p>'}
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>

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
                <img src="https://worksphere.inventech-developer.in/assets/inventech-logo-Cp1E027l.jpg"
                     alt="InvenTech Logo"
                     width="42"
                     height="42"
                     style="display:block;width:42px;height:42px;border-radius:6px;border:0;background-color:#ffffff;" />
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
