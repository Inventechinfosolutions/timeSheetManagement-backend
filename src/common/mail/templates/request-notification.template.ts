import { baseLayout } from './base.layout';

export interface RequestNotificationData {
  employeeName: string;
  employeeId: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  status: string;
  description?: string;
  recipientName?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

export const getRequestNotificationTemplate = (data: RequestNotificationData) => {
  const statusLower = data.status.toLowerCase();
  const statusColor = statusLower === 'pending' ? '#f97316' : (statusLower === 'cancelled' || statusLower === 'reverted' || statusLower === 'restored' || statusLower.includes('requesting')) ? '#f97316' : '#6b7280';

  // Custom Header/Subject Logic
  let requestDisplayName = data.requestType;
  const fHalf = data.firstHalf || 'Office';
  const sHalf = data.secondHalf || 'Office';

  if (fHalf !== 'Office' || sHalf !== 'Office') {
    if (fHalf === sHalf) {
      requestDisplayName = fHalf === 'Apply Leave' || fHalf === 'Leave' ? 'Leave' : fHalf;
    } else if ((fHalf === 'Leave' || fHalf === 'Apply Leave') && sHalf === 'Office') {
      requestDisplayName = 'Half Day Leave';
    } else if (fHalf === 'Office' && (sHalf === 'Leave' || sHalf === 'Apply Leave')) {
      requestDisplayName = 'Half Day Leave';
    } else {
      const parts = [fHalf, sHalf]
        .map(h => (h === 'Apply Leave' || h === 'Leave') ? 'Leave' : h)
        .filter(h => h && h !== 'Office');
      requestDisplayName = parts.join(' + ');
    }
  }

  let actionWord = 'has submitted a new';
  let headerLabel = `NEW ${requestDisplayName.toUpperCase()} REQUEST`;
  let mailSubject = `New ${requestDisplayName} `;

  if (statusLower === 'cancelled' || statusLower === 'reverted') {
    actionWord = 'has REVERTED their';
    headerLabel = `${requestDisplayName.toUpperCase()} REVERTED`;
    mailSubject = `${requestDisplayName} Reverted`;
  } else if (statusLower.includes('cancellation')) {
    actionWord = 'has submitted a cancellation request for';
    headerLabel = `${requestDisplayName.toUpperCase()} CANCELLATION`;
    mailSubject = `${requestDisplayName} Cancellation Request`;
  } else if (statusLower.includes('modification')) {
    actionWord = 'has submitted a modification request:';
    headerLabel = `MODIFICATION REQUEST: ${requestDisplayName.toUpperCase()}`;
    mailSubject = `${requestDisplayName} Modification Request`;
  }

  const isModification = statusLower.includes('modification');
  const labelPrefix = isModification ? 'Revised ' : '';

  const displayStatus = (statusLower === 'cancelled' || statusLower === 'reverted') ? 'REVERTED' : data.status;

  const dayDetailsSection = (fHalf === sHalf)
    ? `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
                <span style="font-size: 16px; margin-right: 8px;">🕒</span> ${isModification ? 'MODIFIED ' : ''}DAY DETAILS
              </td>
            </tr>
          </table>
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <tr>
              <td align="left" style="padding: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1d4ed8;">
                Full Day : 
              </td>
              <td align="right" style="padding: 12px;">
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background-color: #dbeafe; border-radius: 6px; padding: 4px 12px;">
                      <span style="font-family: sans-serif; color: #1e40af; font-size: 12px; font-weight: 700; text-transform: uppercase;">${fHalf}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`
    : `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
                <span style="font-size: 16px; margin-right: 8px;">🕒</span> ${isModification ? 'MODIFIED ' : ''}DAY DETAILS
              </td>
            </tr>
          </table>
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="48%" style="background-color: #f1f5f9; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr><td style="font-family: sans-serif; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; padding-bottom: 4px;">FIRST HALF</td></tr>
                  <tr><td style="font-family: sans-serif; font-size: 15px; font-weight: 800; color: #2563eb;">${fHalf}</td></tr>
                </table>
              </td>
              <td width="4%">&nbsp;</td>
              <td width="48%" style="background-color: #f1f5f9; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr><td style="font-family: sans-serif; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; padding-bottom: 4px;">SECOND HALF</td></tr>
                  <tr><td style="font-family: sans-serif; font-size: 15px; font-weight: 800; color: #2563eb;">${sHalf}</td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const content = `
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Hello ${data.recipientName || 'Admin'},</p>
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) ${actionWord} <strong>${requestDisplayName}</strong>.
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
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">${labelPrefix}From:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.fromDate}</td>
            </tr>
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">${labelPrefix}To:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.toDate}</td>
            </tr>
            <tr>
              <td width="140" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">${labelPrefix}Duration:</td>
              <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.duration} Day(s)</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${dayDetailsSection}

    <p style="font-family: sans-serif; font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${displayStatus}</span>
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

  return baseLayout(content, mailSubject, headerLabel);
};


