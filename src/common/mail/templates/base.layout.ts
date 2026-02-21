export const baseLayout = (
  content: string,
  title: string,
  headerCardTitle?: string
) => {
  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${title}</title>

<!--[if mso]>
<xml>
  <o:OfficeDocumentSettings>
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
<style>
  table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  td { padding: 0; }
  img { -ms-interpolation-mode: bicubic; }
</style>
<![endif]-->

<style>
  body, table, td, p, a {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -ms-text-size-adjust: 100%;
    -webkit-text-size-adjust: 100%;
  }

  body {
    margin: 0;
    padding: 0;
    width: 100% !important;
    height: 100% !important;
    background-color: #ffffff;
  }

  /* Main Card */
  .container {
    max-width: 620px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 18px;
    overflow: hidden;
  }

  /* Header */
  .header {
    background-color: #2563eb;
    padding: 35px 40px;
    color: #ffffff;
  }

  .company-name {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #ffffff;
  }

  .company-sub {
    margin: 4px 0 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.85;
    color: #ffffff;
  }

  /* Glass Header Card */
  .header-card {
    margin-top: 25px;
    background-color: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 14px;
    padding: 14px 20px;
    text-align: center;
  }

  .header-card h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #ffffff;
  }

  /* Main Content */
  .main-body {
    padding: 40px;
    background-color: #ffffff;
  }

  /* Status Badges */
  .status-badge {
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  /* Button */
  .btn {
    background-color: #2563eb;
    color: #ffffff !important;
    text-decoration: none;
    padding: 14px 30px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    display: inline-block;
    text-align: center;
    mso-padding-alt: 0;
    text-underline-color: #2563eb;
  }

  /* Footer */
  .footer {
    padding: 24px 40px;
    background-color: #f1f5f9;
    text-align: center;
    font-size: 12px;
    color: #64748b;
  }
</style>
</head>

<body style="margin:0; padding:0; background-color:#ffffff;">
  <!--[if gte mso 9]>
  <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="mso-width-percent:1000;height:1000px;">
    <v:fill type="solid" color="#ffffff" />
    <v:textbox inset="0,0,0,0">
  <![endif]-->
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 10px;">
        
        <!--[if mso]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="620">
        <tr>
        <td align="center" valign="top" width="620">
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" arcsize="5%" stroke="false" fillcolor="#ffffff" style="width:620px;">
        <w:anchorlock/>
        <v:textbox inset="0,0,0,0">
        <![endif]-->
        
        <div class="container" style="max-width: 620px; width: 100%; border-radius: 18px;">
          
          <!-- Header -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(90deg, #2563eb, #1e40af); background-color: #2563eb; border-radius: 18px 18px 0 0;">
            <tr>
              <td style="padding: 35px 40px;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left">
                      <h1 class="company-name" style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800;">INVENTECH</h1>
                      <p class="company-sub" style="margin: 4px 0 0; color: #ffffff; font-size: 11px; text-transform: uppercase;">INFO SOLUTIONS PVT. LTD.</p>
                    </td>
                    <td align="right" width="40">
                      <span style="font-size: 26px;">🔔</span>
                    </td>
                  </tr>
                </table>

                ${headerCardTitle ? `
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 25px;">
                    <tr>
                      <td style="background-color: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 14px; padding: 14px 20px; text-align: center;">
                        <h2 style="margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #ffffff;">${headerCardTitle}</h2>
                      </td>
                    </tr>
                  </table>
                ` : ""}
              </td>
            </tr>
          </table>

          <!-- Main Content -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
            <tr>
              <td class="main-body" style="padding: 40px;">
                ${content}
              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; border-radius: 0 0 18px 18px;">
            <tr>
              <td class="footer" style="padding: 24px 40px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b;">This is an automated message. Please do not reply directly.</p>
                <p style="margin: 0; font-size: 12px; color: #64748b;">© ${new Date().getFullYear()} InvenTech Info Solutions Pvt. Ltd.</p>
              </td>
            </tr>
          </table>

        </div>

        <!--[if mso]>
        </v:textbox>
        </v:roundrect>
        </td>
        </tr>
        </table>
        <![endif]-->

      </td>
    </tr>
  </table>
  <!--[if gte mso 9]>
    </v:textbox>
  </v:rect>
  <![endif]-->
</body>
</html>
`;
};

