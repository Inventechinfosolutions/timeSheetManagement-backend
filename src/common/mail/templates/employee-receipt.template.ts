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

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Dear ${data.employeeName},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your request for <strong>${requestDisplayName}</strong> titled "<strong>${data.title}</strong>" has been successfully submitted. It is now awaiting review.
    </p>

    ${dayDetailsSection}

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Current Status: <span style="color: ${statusColor}; text-transform: uppercase;">${data.status}</span>
    </p>

    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      You will receive another update once your request has been reviewed by your manager or administrator.
    </p>

    <div style="text-align: center; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">VIEW IN PORTAL →</a>
    </div>
  `;

  return baseLayout(content, `${requestDisplayName} Submitted`, 'SUBMISSION SUCCESSFUL');
};
