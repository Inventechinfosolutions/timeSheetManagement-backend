import { baseLayout } from './base.layout';

interface RejectionConfirmationParams {
  reviewerName: string;
  employeeName: string;
  employeeId: string;
  requestType: string;
  startDate: string;
  endDate: string;
  duration: number;
  reason?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

interface CancellationRejectionConfirmationParams {
  reviewerName: string;
  employeeName: string;
  requestType: string;
  dates: string;
  reason?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

interface ApprovalConfirmationParams {
  reviewerName: string;
  employeeName: string;
  employeeId: string;
  requestType: string;
  startDate: string;
  endDate: string;
  duration: number;
  reason?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

interface CancellationApprovalConfirmationParams {
  reviewerName: string;
  employeeName: string;
  requestType: string;
  dates: string;
  reason?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

// Helper to generate consistent Day Details HTML
const getDayDetailsHtml = (firstHalf?: string | null, secondHalf?: string | null) => {
  const fHalf = firstHalf || 'Office';
  const sHalf = secondHalf || 'Office';

  if (fHalf === sHalf) {
    return `
    <div class="day-details-container" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
      <div class="day-details-header">
        <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
      </div>
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 14px; font-weight: 700; color: #1d4ed8;">Full Day : </span>
          <span style="background-color: #f1f5f9; color: #475569; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 6px;">
              ${fHalf}
          </span>
      </div>
    </div>`;
  } else {
    return `
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
  }
};

export const getRejectionConfirmationTemplate = (data: RejectionConfirmationParams) => {
  const reasonText = data.reason ? `<br><strong>Reason for Rejection:</strong> ${data.reason}` : '';
  const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
    <p>Dear ${data.reviewerName},</p>
    
    <p>This is a confirmation that you have <strong>Rejected</strong> the following request:</p>
    
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
        <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Employee:</strong> ${data.employeeName} (${data.employeeId})</p>
        <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Type:</strong> ${data.requestType}</p>
        <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Dates:</strong> ${data.startDate} to ${data.endDate}</p>
        <p style="margin: 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Duration:</strong> ${data.duration} Day(s)</p>
        ${reasonText}
      </div>

      ${dayDetailsHtml}
    
    <p>The employee has been notified that this request was not approved. Their attendance record for these dates will remain unchanged (or marked as Absent/Upcoming).</p>
  `;

  return baseLayout(content, 'Rejection Confirmation', 'Request Rejected');
};

export const getCancellationRejectionConfirmationTemplate = (data: CancellationRejectionConfirmationParams) => {
  const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
    <p>Dear ${data.reviewerName},</p>
    
    <p>You have <strong>Rejected</strong> the Cancellation Request for the following:</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
      <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 140px; display: inline-block;">Employee:</strong> ${data.employeeName}</p>
      <p style="margin: 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 140px; display: inline-block;">Original Request:</strong> ${data.requestType} on ${data.dates}</p>
    </div>

    ${dayDetailsHtml}
    
    <p>This means the Original Approval remains in effect. The employee's attendance status for these dates will not be reverted and will stay as <strong>${data.requestType}</strong>.</p>
    <p>The employee has been notified of this decision.</p>
  `;

  return baseLayout(content, 'Cancellation Rejection Confirmation', 'Cancellation Rejected');
};

export const getApprovalConfirmationTemplate = (data: ApprovalConfirmationParams) => {
    const reasonText = data.reason ? `<br><strong>Note:</strong> ${data.reason}` : '';
    const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

    const content = `
      <p>Dear ${data.reviewerName},</p>
      
      <p>This is a confirmation that you have <strong>Approved</strong> the following ${data.requestType} request:</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
        <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Employee:</strong> ${data.employeeName} (${data.employeeId})</p>
        <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Type:</strong> ${data.requestType}</p>
        <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Dates:</strong> ${data.startDate} to ${data.endDate}</p>
        <p style="margin: 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 100px; display: inline-block;">Duration:</strong> ${data.duration} Day(s)</p>
        ${reasonText}
      </div>

      ${dayDetailsHtml}
      
      <p>The employee has been notified that this request was approved. Their attendance record for these dates will be updated to reflect this approval.</p>
    `;
  
    return baseLayout(content, 'Approval Confirmation', 'Request Approved');
  };
  
export const getCancellationApprovalConfirmationTemplate = (data: CancellationApprovalConfirmationParams) => {
    const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

    const content = `
      <p>Dear ${data.reviewerName},</p>
      
      <p>You have <strong>Approved</strong> the Cancellation Request for the following:</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
        <p style="margin: 0 0 12px 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 140px; display: inline-block;">Employee:</strong> ${data.employeeName}</p>
        <p style="margin: 0; font-size: 14px;"><strong style="color: #1e40af; min-width: 140px; display: inline-block;">Original Request:</strong> ${data.requestType} on ${data.dates}</p>
      </div>

      ${dayDetailsHtml}
      
      <p>This means the Original Approval has been revoked. The employee's attendance status for these dates will be reverted to its original state.</p>
      <p>The employee has been notified of this decision.</p>
    `;
  
    return baseLayout(content, 'Cancellation Approval Confirmation', 'Cancellation Approved');
};
