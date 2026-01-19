export const getNotificationEmailTemplate = (
  title: string,
  message: string,
) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  /* Reset */
  body, table, td, div, p, a {
    font-family: 'Helvetica', 'Arial', sans-serif;
    -webkit-font-smoothing: antialiased;
    box-sizing: border-box;
  }
  body { margin: 0; padding: 0; background-color: #f4f6f8; }
  table { border-collapse: collapse; width: 100%; }
  /* Hover effect for button */
  .btn-primary:hover {
    background-color: #007ec5 !important;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2) !important;
  }
</style>
</head>
<body style="background-color: #f4f6f8; padding: 40px 0;">

  <!-- Main Container -->
  <table role="presentation" align="center" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    
    <!-- HEADER SECTION (Blue Diagonal Design) -->
    <tr>
      <td style="position: relative; background-color: #0093E9; padding: 0;">
        <!-- Minimalist CSS Gradient for Diagonal Effect (works in modern clients, fallbacks to solid blue) -->
        <div style="background: linear-gradient(135deg, #0093E9 0%, #0093E9 55%, #007ec5 55%, #007ec5 100%); padding: 40px; height: 180px;">
          <table width="100%">
            <tr>
              <td colspan="2" style="padding: 0;">
                 <table width="100%">
                    <tr>
                       <td style="width: 50px; vertical-align: middle;">
                          <!-- PLEASE REPLACE THIS SRC WITH YOUR PUBLICLY HOSTED LOGO URL -->
                          <img src="https://placehold.co/50x50/transparent/white?text=LOGO" alt="InvenTech" style="width: 50px; height: 50px; display: block;">
                       </td>
                       <td style="vertical-align: middle; padding-left: 15px;">
                          <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">
                            INVENTECH
                          </h2>
                          <p style="color: rgba(255,255,255,0.9); margin: 2px 0 0 0; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
                            INFO SOLUTIONS PVT. LTD.
                          </p>
                       </td>
                       <td align="right" style="vertical-align: middle;">
                          <!-- Notification Bell Icon -->
                          <div style="width: 50px; height: 50px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1);">
                             <img src="https://placehold.co/24x24/transparent/white?text=🔔" alt="Notification" style="width: 24px; height: 24px;">
                          </div>
                       </td>
                    </tr>
                 </table>
                 
                 <!-- Title Card with Smoke Border -->
                 <div style="margin-top: 30px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); backdrop-filter: blur(5px);">
                    <h1 style="color: #ffffff; margin: 0; font-size: 17px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; text-align: center; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                      ${title}
                    </h1>
                 </div>
              </td>
            </tr>
            <!-- Website URL Removed -->
          </table>
        </div>
      </td>
    </tr>

    <!-- BRANDING ROW REMOVED -->

    <!-- CONTENT BODY -->
    <tr>
      <td style="padding: 30px 40px 40px 40px;">
        <p style="margin: 0; color: #555555; font-size: 16px; line-height: 1.6;">
          ${message.replace(/\n/g, '<br>')}
        </p>

        <!-- Action Link -->
        <div style="margin-top: 25px; margin-bottom: 20px;">
           <!-- Class 'btn-primary' added for hover effect (see style block in head) -->
           <a href="http://localhost:5173/" class="btn-primary" style="background-color: #0093E9; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: background-color 0.3s ease;">
             LOGIN TO PORTAL &nbsp;&nbsp;&rarr;
           </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee;">
           <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
             This is an automated message. Please do not reply directly to this email.<br>
             &copy; ${new Date().getFullYear()} InvenTech Info Solutions.
           </p>
        </div>
      </td>
    </tr>

  </table>
  
  <div style="text-align: center; margin-top: 20px;">
    <p style="color: #999999; font-size: 12px;">Sent securely by InvenTech TimeSheet Pro</p>
  </div>

</body>
</html>
`;
