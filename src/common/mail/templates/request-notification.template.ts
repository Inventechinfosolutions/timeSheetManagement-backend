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
    <div class="day-details-container" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
      <div class="day-details-header">
        <span style="font-size: 16px; margin-right: 8px;">🕒</span> ${isModification ? 'MODIFIED ' : ''}DAY DETAILS
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 14px; font-weight: 700; color: #1d4ed8;">Full Day : </span>
          <span style="background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 6px;">
              ${fHalf}
          </span>
      </div>
    </div>`
    : `
    <div class="day-details-container" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
      <div class="day-details-header">
        <span style="font-size: 16px; margin-right: 8px;">🕒</span> ${isModification ? 'MODIFIED ' : ''}DAY DETAILS
      </div>
      <table class="half-card-table" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td class="half-card">
            <div class="half-label">FIRST HALF</div>
            <div class="half-value">${fHalf}</div>
          </td>
          <td class="half-card">
            <div class="half-label">SECOND HALF</div>
            <div class="half-value">${sHalf}</div>
          </td>
        </tr>
      </table>
    </div>`;

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Hello ${data.recipientName || 'Admin'},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) ${actionWord} <strong>${requestDisplayName}</strong>.
    </p>

    <div class="details-box" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
      <div class="detail-row" style="margin-bottom: 12px; font-size: 14px;">
        <span class="detail-label" style="font-weight: 700; color: #1e40af; min-width: 140px; display: inline-block;">Title:</span> ${data.title}
      </div>
      <div class="detail-row" style="margin-bottom: 12px; font-size: 14px;">
        <span class="detail-label" style="font-weight: 700; color: #1e40af; min-width: 140px; display: inline-block;">${labelPrefix}From:</span> ${data.fromDate}
      </div>
      <div class="detail-row" style="margin-bottom: 12px; font-size: 14px;">
        <span class="detail-label" style="font-weight: 700; color: #1e40af; min-width: 140px; display: inline-block;">${labelPrefix}To:</span> ${data.toDate}
      </div>
      <div class="detail-row" style="margin-bottom: 0; font-size: 14px;">
        <span class="detail-label" style="font-weight: 700; color: #1e40af; min-width: 140px; display: inline-block;">${labelPrefix}Duration:</span> ${data.duration} Day(s)
      </div>
    </div>

    ${dayDetailsSection}

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${displayStatus}</span>
    </p>

    <div style="text-align: center; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
    </div>
  `;

  return baseLayout(content, mailSubject, headerLabel);
};
