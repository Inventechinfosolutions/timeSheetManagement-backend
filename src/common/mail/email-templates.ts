export const getNotificationEmailTemplate = (
  title: string,
  message: string,
) => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>

<!--[if mso]>
<style>
table { border-collapse: collapse; border-spacing: 0; }
td { padding: 0; }
</style>
<![endif]-->

<style>
  body, table, td, p, a {
    font-family: Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-size-adjust: 100%;
  }

  body {
    margin: 0;
    padding: 0;
    background-color: #eef2f7;
  }

  .container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 8px;
  }

  .btn:hover {
    background-color: #0077c8 !important;
  }

  @media screen and (max-width: 600px) {
    .container {
      width: 100% !important;
    }
    .content {
      padding: 24px !important;
    }
  }
</style>
</head>

<body>

<!-- OUTER WRAPPER -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f7; padding:40px 0;">
<tr>
<td align="center">

<!-- MAIN CARD -->
<table class="container" width="100%" cellpadding="0" cellspacing="0">

<!-- HEADER -->
<tr>
<td style="background-color:#0a8fe7; padding:20px 40px 30px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="40" style="vertical-align: middle;">&nbsp;</td>
      <td align="center" style="vertical-align: middle;">
        <span style="font-family: 'Georgia', 'Times New Roman', serif; font-size: 30px; font-weight: bold; color: #ffffff; line-height: 1;">WORKSPHERE</span>
      </td>
      <td align="right" width="40" style="font-size:30px; color:#ffffff; vertical-align: middle;">
        🔔
      </td>
    </tr>
  </table>

  <!-- TITLE CARD -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
    <tr>
      <td style="background-color:#ffffff; padding:8px 16px; border-radius:8px; text-align:center;">
        <h1 style="margin:0; font-size:13px; letter-spacing:1px; text-transform:uppercase; color:#0a8fe7;">
          ${title}
        </h1>
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- CONTENT -->
<tr>
<td class="content" style="padding:40px;">
  <p style="margin:0; font-size:16px; line-height:1.7; color:#333333;">
    ${message.replace(/\n/g, '<br>')}
  </p>

  <!-- CTA -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:36px 0;">
    <tr>
      <td align="left">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://worksphere.inventech-developer.in"
          style="height:44px;v-text-anchor:middle;width:220px;" arcsize="10%"
          fillcolor="#0a8fe7" stroke="f">
          <w:anchorlock/>
          <center style="color:#ffffff;font-size:14px;font-weight:bold;">
            LOGIN TO PORTAL →
          </center>
        </v:roundrect>
        <![endif]-->

        <![if !mso]>
        <a href="https://worksphere.inventech-developer.in"
           class="btn"
           style="background-color:#0a8fe7; color:#ffffff; text-decoration:none;
                  padding:12px 32px; border-radius:6px;
                  font-size:14px; font-weight:bold; display:inline-block;">
          LOGIN TO PORTAL →
        </a>
        <![endif]>
      </td>
    </tr>
  </table>

  <!-- FOOTER -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb; padding-top:20px;">
    <tr>
      <td>
        <p style="margin:0; font-size:12px; color:#9ca3af; line-height:1.6;">
          This is an automated message. Please do not reply directly.<br>
          © ${new Date().getFullYear()} InvenTech Info Solutions
        </p>
      </td>
    </tr>
  </table>
</td>
</tr>

</table>
<!-- END MAIN CARD -->

<!-- BRAND FOOTER -->
<p style="margin-top:20px; font-size:12px; color:#9ca3af;">
  Sent securely via <strong>Worksphere</strong>
</p>

</td>
</tr>
</table>

</body>
</html>
`;
