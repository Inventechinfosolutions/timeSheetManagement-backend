import { baseLayout } from './base.layout';

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
}

export const getStatusUpdateTemplate = (data: StatusUpdateData) => {
  const statusLower = data.status.toLowerCase();
  const isApproved = statusLower.includes('approved') && !statusLower.includes('restored');
  const isRestored = statusLower.includes('restored') || statusLower.includes('reverted') || statusLower === 'cancelled';
  const isRejected = statusLower.includes('rejected');
  const isCancelled = statusLower === 'cancelled';
  const isCancellation = data.isCancellation || (statusLower.includes('cancel') && statusLower !== 'cancelled');
  
  const statusColor = isApproved ? '#22c55e' : isRestored ? '#8b5cf6' : isRejected ? '#ef4444' : (isCancelled || statusLower.includes('requesting')) ? '#f97316' : '#6b7280';
  
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
    <div class="day-details-container" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
      <div class="day-details-header">
        <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
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
        <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
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

  const reviewedByText = (data.reviewedBy && data.reviewedBy.trim()) ? ` reviewed by <strong>${data.reviewedBy}</strong> and` : "";

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Dear ${data.employeeName},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your request for ${requestText} titled "<strong>${data.title}</strong>" has been${reviewedByText} <strong>${displayStatus}</strong>.
    </p>

    <div class="details-box">
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

    ${dayDetailsSection}

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${displayStatus}</span>
    </p>

    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      Please log in to the portal for more details.
    </p>

    <div style="text-align: center; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
    </div>
  `;

  return baseLayout(content, `${requestDisplayName} Update`, headerLabel);
};
