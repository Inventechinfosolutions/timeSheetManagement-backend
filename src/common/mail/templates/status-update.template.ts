import { baseLayout } from './base.layout';

export interface StatusUpdateData {
  employeeName: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  status: 'Approved' | 'Rejected' | 'Cancellation Approved' | 'Cancelled' | 'Cancellation Rejected' | 'Restored to Approved' | 'Reverted';
  isCancellation?: boolean;
  reviewedBy?: string;
}

export const getStatusUpdateTemplate = (data: StatusUpdateData) => {
  const statusLower = data.status.toLowerCase();
  const isApproved = statusLower.includes('approved') && !statusLower.includes('restored');
  const isRestored = statusLower.includes('restored') || statusLower.includes('reverted') || statusLower === 'cancelled';
  const isRejected = statusLower.includes('rejected');
  const isCancelled = statusLower === 'cancelled';
  const isCancellation = data.isCancellation || (statusLower.includes('cancel') && statusLower !== 'cancelled');
  
  const statusColor = isApproved ? '#22c55e' : isRestored ? '#8b5cf6' : isRejected ? '#ef4444' : (isCancelled || statusLower.includes('requesting')) ? '#f97316' : '#6b7280';
  
  
  // If status is 'Cancelled' and isCancellation is true, it's a revert -> show 'REVERTED'
  // If status is 'Cancelled' and isCancellation is false/undefined, it's a pending cancellation -> show 'CANCELLED'
  const displayStatus = statusLower === 'cancelled' 
    ? (isCancellation ? 'REVERTED' : 'CANCELLED')
    : data.status;

  const requestText = isCancellation ? `cancellation of <strong>${data.requestType}</strong>` : `<strong>${data.requestType}</strong>`;
  
  // Header label logic: 
  // - If isCancellation is true -> it's about a cancellation action (either requesting or reverting)
  // - If isCancelled is true but isCancellation is false -> it's a fresh pending request being cancelled
  const headerLabel = isCancellation 
    ? (statusLower === 'cancelled' ? `${data.requestType} REVERTED` : `${data.requestType} CANCELLATION`)
    : isCancelled 
      ? `${data.requestType} CANCELLED`
      : `${data.requestType} UPDATE`;

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

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${displayStatus}</span>
    </p>

    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      Please log in to the portal for more details.
    </p>

    <div style="text-align: left; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
    </div>
  `;

  return baseLayout(content, `${data.requestType} Update`, headerLabel, 'white');
};
