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
  recipientName?: string;
  isSelf?: boolean;
}

export const getCancellationTemplate = (data: CancellationData) => {
  const isRevert = data.actionType === 'revert';
  const isRevertBack = data.actionType === 'revert_back';

  let actionText = data.isSelf ? 'have submitted a cancellation request for' : 'has submitted a cancellation request for';
  let statusText = 'Pending';
  let statusColor = '#f97316'; // Orange

  if (isRevert) {
    actionText = data.isSelf ? 'have REVERTED your cancellation request for' : 'has REVERTED their cancellation request for';
    statusText = 'REVERTED';
    statusColor = '#f97316'; // Orange
  } else if (isRevertBack) {
    actionText = data.isSelf ? 'have CANCELLED your pending request for' : 'has CANCELLED their pending request for';
    statusText = 'CANCELLED';
    statusColor = '#f97316'; // Orange
  }

  const greeting = data.isSelf 
    ? `Dear ${data.employeeName},`
    : (data.recipientName ? `Hello ${data.recipientName},` : `Hello,`);

  const introText = data.isSelf
    ? `You ${actionText} <strong>${data.requestType}</strong> titled "<strong>${data.title}</strong>".`
    : `<strong>${data.employeeName}</strong> ${data.employeeId ? `(EMP-${data.employeeId})` : ''} ${actionText} <strong>${data.requestType}</strong> titled "<strong>${data.title}</strong>".`;

  const content = `
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">${greeting}</p>
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">
      ${introText}
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Title:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.title}</td>
            </tr>
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

          ${data.reason ? `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px dashed #e2e8f0; margin-top: 15px;">
              <tr>
                <td style="padding-top: 15px;">
                  <p style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin: 0 0 5px 0;">Description:</p>
                  <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">${data.reason}</p>
                </td>
              </tr>
            </table>
          ` : ''}
        </td>
      </tr>
    </table>

    <p style="font-family: sans-serif; font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${statusText}</span>
    </p>

    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      Please log in to the portal for more details.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 12px;">
      <tr>
        <td align="left">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://timesheet.inventech-developer.in" style="height:35px;v-text-anchor:middle;width:160px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
            <w:anchorlock/>
            <center>
          <![endif]-->
          <a href="https://timesheet.inventech-developer.in" class="btn" style="background-color:#2563eb;border-radius:8px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:13px;font-weight:bold;line-height:35px;text-align:left;text-decoration:none;padding:0 14px;-webkit-text-size-adjust:none;">LOGIN TO PORTAL →</a>
          <!--[if mso]>
            </center>
          </v:roundrect>
          <![endif]-->
        </td>
      </tr>
    </table>
  `;


  const headerLabel = isRevert ? 'CANCELLATION REVERTED' : isRevertBack ? `${data.requestType} CANCELLED` : `${data.requestType} CANCELLATION`;

  return baseLayout(content, `${data.requestType} Update`, headerLabel);
};

