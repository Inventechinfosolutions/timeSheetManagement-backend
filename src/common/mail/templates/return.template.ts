import { baseLayout } from './base.layout';

export interface ReturnData {
  employeeName: string;
  requestType: string;
  title: string;
  comment: string;
}

export const getReturnTemplate = (data: ReturnData) => {
  const content = `
    <p style="font-size: 16px; color: #1f2937;">Dear ${data.employeeName},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your request for <strong>${data.requestType}</strong> titled "<strong>${data.title}</strong>" has been <strong>Returned</strong> for corrections.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0; border-left: 4px solid #f97316;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="font-weight: 700; color: #f97316; font-size: 14px; padding-bottom: 8px;">Admin Comment:</td>
            </tr>
            <tr>
              <td style="font-style: italic; color: #374151; font-size: 14px;">${data.comment}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: #f97316; text-transform: uppercase;">Returned</span>
    </p>

    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      Please update the request information and resubmit.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 40px;">
      <tr>
        <td align="left">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://timesheet.inventech-developer.in" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
            <w:anchorlock/>
            <center>
          <![endif]-->
          <a href="https://timesheet.inventech-developer.in" class="btn" style="background-color:#2563eb;border-radius:8px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:14px;font-weight:bold;line-height:50px;text-align:center;text-decoration:none;width:200px;-webkit-text-size-adjust:none;">UPDATE REQUEST →</a>
          <!--[if mso]>
            </center>
          </v:roundrect>
          <![endif]-->
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, `${data.requestType} Returned`, `${data.requestType} RETURNED`);
};

