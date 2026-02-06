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
}

export const getEmployeeReceiptTemplate = (data: EmployeeReceiptData) => {
  const statusLower = data.status.toLowerCase();
  // Amber color for pending/requesting statuses
  const statusColor = '#f59e0b'; 

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Dear ${data.employeeName},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your request for <strong>${data.requestType}</strong> titled "<strong>${data.title}</strong>" has been successfully submitted. It is now awaiting review.
    </p>

    <div class="details-box">
      <div class="detail-row">
        <span class="detail-label">Request Type:</span> ${data.requestType}
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
      Current Status: <span style="color: ${statusColor}; text-transform: uppercase;">${data.status}</span>
    </p>

    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      You will receive another update once your request has been reviewed by your manager or administrator.
    </p>

    <div style="text-align: left; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">VIEW IN PORTAL →</a>
    </div>
  `;

  return baseLayout(content, `${data.requestType} Submitted`, 'SUBMISSION SUCCESSFUL', 'white');
};
