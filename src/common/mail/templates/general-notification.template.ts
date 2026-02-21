import { baseLayout } from './base.layout';

export interface GeneralNotificationData {
  recipientName: string;
  title: string;
  message: string;
}

export const getGeneralNotificationTemplate = (data: GeneralNotificationData) => {
  const content = `
    <div style="font-size: 15px; color: #1f2937; line-height: 1.6;">
      <p>Dear ${data.recipientName},</p>
      
      <div style="margin: 25px 0;">
        ${data.message.replace(/\n/g, '<br>')}
      </div>

      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 35px;">
        <tr>
          <td align="left">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://timesheet.inventech-developer.in" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
              <w:anchorlock/>
              <center>
            <![endif]-->
            <a href="https://timesheet.inventech-developer.in" class="btn" style="background-color:#2563eb;border-radius:8px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:14px;font-weight:bold;line-height:50px;text-align:center;text-decoration:none;width:200px;-webkit-text-size-adjust:none;">LOGIN TO PORTAL →</a>
            <!--[if mso]>
              </center>
            </v:roundrect>
            <![endif]-->
          </td>
        </tr>
      </table>
    </div>
  `;

  return baseLayout(content, data.title, data.title);
};

