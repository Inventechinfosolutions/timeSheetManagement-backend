import { baseLayout } from './base.layout';

export interface CancellationData {
  employeeName: string;
  employeeId: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  reason?: string;
  actionType?: 'request' | 'revert' | 'revert_back';
}

export const getCancellationTemplate = (data: CancellationData) => {
  const isRevert = data.actionType === 'revert';
  const isRevertBack = data.actionType === 'revert_back';

  let actionText = 'has submitted a cancellation request for';
  let statusText = 'Pending';
  let statusColor = '#f97316'; // Orange

  if (isRevert || isRevertBack) {
    actionText = isRevert ? 'has REVERTED their cancellation request for' : 'has REVERTED BACK their pending request for';
    statusText = 'REVERTED';
    statusColor = '#8b5cf6'; // Purple
  }

  const content = `
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Hello Admin,</p>
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) ${actionText} <strong>${data.requestType}</strong> titled "<strong>${data.title}</strong>".
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">From:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.fromDate}</td>
            </tr>
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">To:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.toDate}</td>
            </tr>
            <tr>
              <td width="140" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Duration:</td>
              <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.duration} Day(s)</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="font-family: sans-serif; font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${statusText}</span>
    </p>

    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      Please log in to the portal for more details.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 40px;">
      <tr>
        <td align="center">
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
  `;


  const headerLabel = isRevert ? 'CANCELLATION REVERTED' : isRevertBack ? `${data.requestType} REVERTED` : `${data.requestType} CANCELLATION`;

  return baseLayout(content, `${data.requestType} Update`, headerLabel);
};

