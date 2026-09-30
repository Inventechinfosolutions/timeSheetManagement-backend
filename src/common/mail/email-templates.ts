import { NotePermission } from '../../notes/entities/note-recipient.entity';

// ─────────────────────────────────────────────────────────────────────────────
// Note share email — Outlook-first, wider template, with attachment links
// ─────────────────────────────────────────────────────────────────────────────
export const getNoteEmailTemplate = (
  noteTitle: string,
  noteContent: string,
  senderName: string,
  senderEmail: string,
  permission: NotePermission,
  customMessage?: string,
  attachments?: Array<{ name: string; downloadUrl: string }>,
): string => {
  const isEdit = permission === NotePermission.CanEdit;
  const senderInitial = (senderName || 'U').charAt(0).toUpperCase();
  const ctaText   = isEdit ? 'Open Portal to Edit &#8594;' : 'Open in WorkSphere Inbox &#8594;';
  const ctaColor  = isEdit ? '#276749' : '#0a8fe7';
  const ctaNote   = isEdit
    ? 'You have edit access. Log in to WorkSphere to edit this note directly.'
    : 'This is a read-only view. Log in to WorkSphere to view it in your Inbox.';
  const year = new Date().getFullYear();

  const customMsgBlock = customMessage ? `
<tr>
  <td style="padding:12px 40px 0 40px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbeb;border:1px solid #fbd38d;">
      <tr>
        <td style="padding:14px 18px;">
          <p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;color:#b7791f;text-transform:uppercase;letter-spacing:1px;">Message from sender</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#744210;line-height:1.6;">${customMessage}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>` : '';

  const attachmentsBlock = attachments && attachments.length > 0 ? `
<tr>
  <td style="padding:0 40px 24px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:0 0 10px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#4a5568;text-transform:uppercase;letter-spacing:1px;">&#128206; Attachments (${attachments.length})</p>
        </td>
      </tr>
      ${attachments.map(att => `
      <tr>
        <td style="padding:6px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;color:#2d3748;">
                &#128196; ${att.name}
              </td>
              <td align="right" style="padding:10px 16px;">
                <a href="${att.downloadUrl}"
                   style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#0a8fe7;text-decoration:none;">
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
  body { margin:0; padding:0; background-color:#eef2f7; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  p { margin:0; padding:0; }
  .note-content p  { color:#4a5568; font-size:14px; line-height:1.8; margin:0 0 12px 0; font-family:Arial,sans-serif; }
  .note-content h1 { color:#1a202c; font-size:22px; font-weight:bold; margin:0 0 10px 0; font-family:Arial,sans-serif; }
  .note-content h2 { color:#1a202c; font-size:18px; font-weight:bold; margin:0 0 10px 0; font-family:Arial,sans-serif; }
  .note-content h3 { color:#1a202c; font-size:16px; font-weight:bold; margin:0 0 8px 0; font-family:Arial,sans-serif; }
  .note-content ul, .note-content ol { padding-left:22px; color:#4a5568; font-size:14px; line-height:1.8; margin:0 0 12px 0; }
  .note-content li { margin-bottom:4px; }
  .note-content code { background-color:#2d3748; color:#e2e8f0; padding:2px 6px; font-family:Courier New,Courier,monospace; font-size:13px; }
  .note-content pre  { background-color:#2d3748; color:#e2e8f0; padding:16px; font-family:Courier New,Courier,monospace; font-size:13px; line-height:1.6; margin:0 0 12px 0; overflow-x:auto; }
  .note-content blockquote { border-left:4px solid #4318FF; margin:0 0 12px 0; padding:10px 16px; background-color:#f7f0ff; color:#553c9a; font-size:14px; }
  .note-content table { border-collapse:collapse; width:100%; margin-bottom:12px; }
  .note-content th { background-color:#edf2f7; font-weight:bold; padding:8px 12px; border:1px solid #e2e8f0; font-family:Arial,sans-serif; font-size:13px; }
  .note-content td { padding:8px 12px; border:1px solid #e2e8f0; font-family:Arial,sans-serif; font-size:13px; color:#4a5568; }
  @media screen and (max-width:720px) {
    .outer { width:100% !important; }
    .pad   { padding:20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;">
<tr>
<td align="center" style="padding:40px 10px;">
<!--[if mso]><table width="720" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table class="outer" width="720" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">

<!-- HEADER: VML gradient for Outlook -->
<tr>
  <td>
    <!--[if mso]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:720px;height:90px;">
      <v:fill type="gradient" color="#0a8fe7" color2="#4318FF" angle="135"/>
      <v:textbox inset="0,0,0,0">
    <![endif]-->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a8fe7;">
      <tr>
        <td style="padding:24px 40px;">
          <span style="font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#ffffff;line-height:1;">WORKSPHERE</span><br>
          <span style="font-family:Arial,sans-serif;font-size:12px;color:#cce9ff;line-height:1.6;">Notes &amp; Inbox</span>
        </td>
      </tr>
    </table>
    <!--[if mso]></v:textbox></v:rect><![endif]-->
  </td>
</tr>

<!-- SENDER INFO -->
<tr>
  <td style="background-color:#f8faff;padding:18px 40px;border-bottom:1px solid #e2e8f0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="44" style="vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="40" height="40" align="center" valign="middle" style="background-color:#0a8fe7;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;line-height:40px;">${senderInitial}</td>
            </tr>
          </table>
        </td>
        <td style="padding-left:14px;vertical-align:middle;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#2d3748;">${senderName}</p>
          <p style="margin:3px 0 0 0;font-family:Arial,sans-serif;font-size:12px;color:#718096;">${senderEmail} &nbsp;&#8226;&nbsp; shared a note with you</p>
        </td>
      </tr>
    </table>
  </td>
</tr>

<!-- NOTE TITLE -->
<tr>
  <td class="pad" style="padding:28px 40px 10px 40px;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#1a202c;line-height:1.3;">${noteTitle}</p>
    <table width="56" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
      <tr><td height="3" style="background-color:#0a8fe7;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td>
</tr>

${customMsgBlock}

<!-- NOTE CONTENT -->
<tr>
  <td class="pad" style="padding:16px 40px 24px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:24px 28px;font-family:Arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.8;">
          <div class="note-content">
            ${noteContent || '<p style="color:#a0aec0;font-style:italic;font-family:Arial,sans-serif;font-size:14px;">No content provided.</p>'}
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>

${attachmentsBlock}

<!-- CTA BUTTON -->
<tr>
  <td align="center" style="padding:8px 40px 32px 40px;">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://worksphere.inventech-developer.in"
      style="height:46px;v-text-anchor:middle;width:300px;" arcsize="7%"
      fillcolor="${ctaColor}" stroke="f">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${isEdit ? 'Open Portal to Edit' : 'Open in WorkSphere Inbox'}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="https://worksphere.inventech-developer.in"
       style="display:inline-block;background-color:${ctaColor};color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 40px;letter-spacing:0.3px;">
      ${ctaText}
    </a>
    <!--<![endif]-->
    <p style="margin:10px 0 0 0;font-family:Arial,sans-serif;font-size:11px;color:#a0aec0;text-align:center;">${ctaNote}</p>
  </td>
</tr>

<!-- FOOTER -->
<tr>
  <td style="background-color:#f8faff;padding:18px 40px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;line-height:1.6;text-align:center;">
      This is an automated notification from WorkSphere Notes. Do not reply to this email.<br>
      &copy; ${year} InvenTech Info Solutions
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
// Generic notification email
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
  body,table,td,p,a { font-family:Arial,sans-serif; text-size-adjust:100%; }
  body { margin:0; padding:0; background-color:#eef2f7; }
  @media screen and (max-width:600px) { .container { width:100% !important; } }
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f7;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
<tr>
  <td style="background-color:#0a8fe7;padding:24px 40px;">
    <span style="font-family:Georgia,serif;font-size:28px;font-weight:bold;color:#ffffff;">WORKSPHERE</span>
    <br><span style="font-family:Arial,sans-serif;font-size:12px;color:#cce9ff;">${title}</span>
  </td>
</tr>
<tr>
  <td style="padding:40px;">
    <p style="margin:0 0 24px 0;font-size:16px;line-height:1.7;color:#333333;">${msgHtml}</p>
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://worksphere.inventech-developer.in"
      style="height:44px;v-text-anchor:middle;width:220px;" arcsize="10%" fillcolor="#0a8fe7" stroke="f">
      <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">LOGIN TO PORTAL</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="https://worksphere.inventech-developer.in"
       style="background-color:#0a8fe7;color:#ffffff;text-decoration:none;padding:12px 32px;font-size:14px;font-weight:bold;display:inline-block;">
      LOGIN TO PORTAL &#8594;
    </a>
    <!--<![endif]-->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:20px;">
      <tr><td><p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        This is an automated message. Do not reply directly.<br>&copy; ${year} InvenTech Info Solutions
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
