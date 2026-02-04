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
}

export const getRequestNotificationTemplate = (data: RequestNotificationData) => {
  const statusLower = data.status.toLowerCase();
  const statusColor = statusLower === 'pending' ? '#f97316' : '#6b7280';

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Hello Admin,</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) has submitted a new <strong>${data.requestType}</strong> request.
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
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${data.status}</span>
    </p>

    <div style="text-align: left; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
    </div>
  `;

  return baseLayout(content, `New ${data.requestType} Request`, `NEW ${data.requestType} REQUEST`, 'white');
};
