import { baseLayout } from './base.layout';

export interface EmployeeReceiptData {
  employeeName: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  status: string;
  description?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

export const getEmployeeReceiptTemplate = (data: EmployeeReceiptData) => {
  const statusLower = data.status.toLowerCase();
  // Amber color for pending/requesting statuses
  const statusColor = '#f59e0b';

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

  const isModification = statusLower.includes('modification');
  const labelPrefix = isModification ? 'Revised ' : '';
  const headerLabel = isModification ? 'MODIFICATION SUBMITTED' : 'SUBMISSION SUCCESSFUL';
  const mailSubject = isModification ? `Modification Request Submitted: ${requestDisplayName}` : `${requestDisplayName} Submitted`;

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
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Dear ${data.employeeName},</p>
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your ${isModification ? '<strong>modification request</strong>' : 'request'} for <strong>${requestDisplayName}</strong> titled "<strong>${data.title}</strong>" has been successfully submitted. It is now awaiting review.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
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
      Current Status: <span style="color: ${statusColor}; text-transform: uppercase;">${data.status}</span>
    </p>

    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      You will receive another update once your request has been reviewed by your manager or administrator.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 40px;">
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://timesheet.inventech-developer.in" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
            <w:anchorlock/>
            <center>
          <![endif]-->
          <a href="https://timesheet.inventech-developer.in" class="btn" style="background-color:#2563eb;border-radius:8px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:14px;font-weight:bold;line-height:50px;text-align:center;text-decoration:none;width:200px;-webkit-text-size-adjust:none;">VIEW IN PORTAL →</a>
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


