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
  let mailSubject = `New ${requestDisplayName} Request`;

  if (statusLower === 'cancelled' || statusLower === 'reverted') {
    actionWord = 'has REVERTED their';
    headerLabel = `${requestDisplayName.toUpperCase()} REVERTED`;
    mailSubject = `${requestDisplayName} Reverted`;
  } else if (statusLower.includes('cancellation')) {
    actionWord = 'has submitted a cancellation request for';
    headerLabel = `${requestDisplayName.toUpperCase()} CANCELLATION`;
    mailSubject = `${requestDisplayName} Cancellation Request`;
  } else if (statusLower.includes('modification')) {
    actionWord = 'has submitted a modification request for';
    headerLabel = `${requestDisplayName.toUpperCase()} MODIFICATION`;
    mailSubject = `${requestDisplayName} Modification Request`;
  }

  const displayStatus = (statusLower === 'cancelled' || statusLower === 'reverted') ? 'REVERTED' : data.status;

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Hello ${data.recipientName || 'Admin'},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) ${actionWord} <strong>${requestDisplayName}</strong> request.
    </p>

    <div class="details-box">
      <div class="detail-row">
        <span class="detail-label">Title:</span> ${data.title}
      </div>
      <div class="detail-row">
        <span class="detail-label">From:</span> ${data.fromDate}
      </div>
      <div class="detail-row">
        <span class="detail-label">To:</span> ${data.toDate}
      </div>
      <div class="detail-row">
        <span class="detail-label">Duration:</span> ${data.duration} Day(s)
      </div>
    </div>

    <div class="day-details-container">
      <div class="day-details-header">
        <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
      </div>
      <table class="half-card-table" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td class="half-card">
            <div class="half-label">FIRST HALF</div>
            <div class="half-value">${data.firstHalf || 'Office'}</div>
          </td>
          <td class="half-card">
            <div class="half-label">SECOND HALF</div>
            <div class="half-value">${data.secondHalf || 'Office'}</div>
          </td>
        </tr>
      </table>
    </div>

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${displayStatus}</span>
    </p>

    <div style="text-align: left; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
    </div>
  `;

  return baseLayout(content, mailSubject, headerLabel, 'white');
};
