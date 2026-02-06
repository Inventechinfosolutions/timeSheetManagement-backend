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
}

export const getRequestNotificationTemplate = (data: RequestNotificationData) => {
  const statusLower = data.status.toLowerCase();
  const statusColor = statusLower === 'pending' ? '#f97316' : (statusLower === 'cancelled' || statusLower === 'reverted' || statusLower === 'restored') ? '#8b5cf6' : '#6b7280';

  let actionWord = 'has submitted a new';
  let headerLabel = `NEW ${data.requestType} REQUEST`;
  let mailSubject = `New ${data.requestType} Request`;

  if (statusLower === 'cancelled' || statusLower === 'reverted') {
    actionWord = 'has REVERTED their';
    headerLabel = `${data.requestType} REVERTED`;
    mailSubject = `${data.requestType} Reverted`;
  } else if (statusLower.includes('cancellation')) {
    actionWord = 'has submitted a cancellation request for';
    headerLabel = `${data.requestType} CANCELLATION`;
    mailSubject = `${data.requestType} Cancellation Request`;
  }

  const displayStatus = (statusLower === 'cancelled' || statusLower === 'reverted') ? 'REVERTED' : data.status;

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Hello ${data.recipientName || 'Admin'},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) ${actionWord} <strong>${data.requestType}</strong> request.
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

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${displayStatus}</span>
    </p>

    <div style="text-align: left; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
    </div>
  `;

  return baseLayout(content, mailSubject, headerLabel, 'white');
};
