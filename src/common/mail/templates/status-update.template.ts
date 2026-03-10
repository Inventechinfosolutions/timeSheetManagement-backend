import { baseLayout } from './base.layout';
import { WorkLocation } from '../../../employeeTimeSheet/enums/work-location.enum';
import { LeaveRequestType } from '../../../employeeTimeSheet/enums/leave-request-type.enum';
import { AttendanceStatus } from '../../../employeeTimeSheet/enums/attendance-status.enum';

export interface StatusUpdateData {
  employeeName: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  status: 'Approved' | 'Rejected' | 'Cancellation Approved' | 'Cancelled' | 'Cancellation Rejected' | 'Restored to Approved' | 'Reverted' | 'Modification Approved' | 'Modification Rejected';
  isCancellation?: boolean;
  reviewedBy?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
  employeeId?: string;
  recipientName?: string;
  isSelf?: boolean;
  description?: string;
}

export const getStatusUpdateTemplate = (data: StatusUpdateData) => {
  const statusLower = data.status.toLowerCase();
  const isApproved = statusLower.includes('approved') && !statusLower.includes('restored');
  const isRestored = false; // We are moving these to orange
  const isRejected = statusLower.includes('rejected');
  const isCancelled = statusLower.includes('cancelled') || statusLower.includes('reverted') || statusLower.includes('restored');
  const isCancellation = data.isCancellation || (statusLower.includes('cancel') && statusLower !== 'cancelled');

  const statusColor = isApproved ? '#22c55e' : isRejected ? '#ef4444' : (isCancelled || isRestored || statusLower.includes('requesting') || statusLower.includes('pending')) ? '#f97316' : '#6b7280';

  // Custom Header/Subject Logic
  let requestDisplayName = data.requestType;
  const fHalf = data.firstHalf || WorkLocation.OFFICE;
  const sHalf = data.secondHalf || WorkLocation.OFFICE;

  if (fHalf !== WorkLocation.OFFICE || sHalf !== WorkLocation.OFFICE) {
    if (fHalf === sHalf) {
      requestDisplayName = fHalf === LeaveRequestType.APPLY_LEAVE || fHalf === AttendanceStatus.LEAVE ? 'Leave' : fHalf;
    } else if ((fHalf === AttendanceStatus.LEAVE || fHalf === LeaveRequestType.APPLY_LEAVE) && sHalf === WorkLocation.OFFICE) {
      requestDisplayName = 'Half Day Leave';
    } else if (fHalf === WorkLocation.OFFICE && (sHalf === AttendanceStatus.LEAVE || sHalf === LeaveRequestType.APPLY_LEAVE)) {
      requestDisplayName = 'Half Day Leave';
    } else {
      const parts = [fHalf, sHalf]
        .map(h => (h === LeaveRequestType.APPLY_LEAVE || h === AttendanceStatus.LEAVE) ? 'Leave' : h)
        .filter(h => h && h !== WorkLocation.OFFICE);
      requestDisplayName = parts.join(' + ');
    }
  }

  // If status is 'Cancelled' and isCancellation is true, it's a revert -> show 'REVERTED'
  // If status is 'Cancelled' and isCancellation is false/undefined, it's a pending cancellation -> show 'CANCELLED'
  const displayStatus = statusLower === 'cancelled'
    ? (isCancellation ? 'REVERTED' : 'CANCELLED')
    : data.status;

  const requestText = isCancellation ? `cancellation of <strong>${requestDisplayName}</strong>` : `<strong>${requestDisplayName}</strong>`;

  // Header label logic: 
  // - If isCancellation is true -> it's about a cancellation action (either requesting or reverting)
  // - If isCancelled is true but isCancellation is false -> it's a fresh pending request being cancelled
  const headerLabel = isCancellation
    ? (statusLower === 'cancelled' ? `${requestDisplayName.toUpperCase()} REVERTED` : `${requestDisplayName.toUpperCase()} CANCELLATION`)
    : isCancelled
      ? `${requestDisplayName.toUpperCase()} CANCELLED`
      : `${requestDisplayName.toUpperCase()} UPDATE`;

  const dayDetailsSection = (fHalf === sHalf)
    ? `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
                <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
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
                <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
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
  let reviewedByText = "";
  if (data.reviewedBy && data.reviewedBy.trim()) {
    if (data.recipientName && data.recipientName.trim().toLowerCase() === data.reviewedBy.trim().toLowerCase()) {
      reviewedByText = ` reviewed by <strong>you</strong> and`;
    } else {
      reviewedByText = ` reviewed by <strong>${data.reviewedBy}</strong> and`;
    }
  }
  const greeting = data.isSelf 
    ? `Dear ${data.employeeName},`
    : (data.recipientName ? `Hello ${data.recipientName},` : `Hello,`);

  const introText = data.isSelf
    ? `Your request for ${requestText} titled "<strong>${data.title}</strong>" has been${reviewedByText} <strong>${displayStatus}</strong>.`
    : `<strong>${data.employeeName}</strong> ${data.employeeId ? `(EMP-${data.employeeId})` : ''} has a request for ${requestText} titled "<strong>${data.title}</strong>" which has been${reviewedByText} <strong>${displayStatus}</strong>.`;

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

          ${data.description ? `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px dashed #e2e8f0; margin-top: 15px;">
              <tr>
                <td style="padding-top: 15px;">
                  <p style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin: 0 0 5px 0;">Description:</p>
                  <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">${data.description}</p>
                </td>
              </tr>
            </table>
          ` : ''}
        </td>
      </tr>
    </table>

    ${dayDetailsSection}

    <p style="font-family: sans-serif; font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${displayStatus}</span>
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

  return baseLayout(content, `${requestDisplayName} Update`, headerLabel);
};


