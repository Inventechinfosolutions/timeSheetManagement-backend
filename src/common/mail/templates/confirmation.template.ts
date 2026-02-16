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

export const getRejectionConfirmationTemplate = (data: RejectionConfirmationParams) => {
  const reasonText = data.reason ? `<br><strong>Reason for Rejection:</strong> ${data.reason}` : '';

  const content = `
    <p>Dear ${data.reviewerName},</p>
    
    <p>This is a confirmation that you have <strong>Rejected</strong> the following request:</p>
    
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Employee:</strong> ${data.employeeName} (${data.employeeId})</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${data.requestType}</p>
        <p style="margin: 5px 0;"><strong>Dates:</strong> ${data.startDate} to ${data.endDate}</p>
        <p style="margin: 5px 0;"><strong>Duration:</strong> ${data.duration} Day(s)</p>
        ${reasonText}
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
    
    <p>The employee has been notified that this request was not approved. Their attendance record for these dates will remain unchanged (or marked as Absent/Upcoming).</p>
  `;

  return baseLayout(content, 'Rejection Confirmation', 'Request Rejected');
};

export const getCancellationRejectionConfirmationTemplate = (data: CancellationRejectionConfirmationParams) => {
  const content = `
    <p>Dear ${data.reviewerName},</p>
    
    <p>You have <strong>Rejected</strong> the Cancellation Request for the following:</p>
    
    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Employee:</strong> ${data.employeeName}</p>
      <p style="margin: 5px 0;"><strong>Original Request:</strong> ${data.requestType} on ${data.dates}</p>
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
    
    <p>This means the Original Approval remains in effect. The employee's attendance status for these dates will not be reverted and will stay as <strong>${data.requestType}</strong>.</p>
    <p>The employee has been notified of this decision.</p>
  `;

  return baseLayout(content, 'Cancellation Rejection Confirmation', 'Cancellation Rejected');
};

export const getApprovalConfirmationTemplate = (data: ApprovalConfirmationParams) => {
    const reasonText = data.reason ? `<br><strong>Note:</strong> ${data.reason}` : '';

    const content = `
      <p>Dear ${data.reviewerName},</p>
      
      <p>This is a confirmation that you have <strong>Approved</strong> the following ${data.requestType} request:</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Employee:</strong> ${data.employeeName} (${data.employeeId})</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${data.requestType}</p>
        <p style="margin: 5px 0;"><strong>Dates:</strong> ${data.startDate} to ${data.endDate}</p>
        <p style="margin: 5px 0;"><strong>Duration:</strong> ${data.duration} Day(s)</p>
        ${reasonText}
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
      
      <p>The employee has been notified that this request was approved. Their attendance record for these dates will be updated to reflect this approval.</p>
    `;
  
    return baseLayout(content, 'Approval Confirmation', 'Request Approved');
  };
  
export const getCancellationApprovalConfirmationTemplate = (data: CancellationApprovalConfirmationParams) => {
    const content = `
      <p>Dear ${data.reviewerName},</p>
      
      <p>You have <strong>Approved</strong> the Cancellation Request for the following:</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Employee:</strong> ${data.employeeName}</p>
        <p style="margin: 5px 0;"><strong>Original Request:</strong> ${data.requestType} on ${data.dates}</p>
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
      
      <p>This means the Original Approval has been revoked. The employee's attendance status for these dates will be reverted to its original state.</p>
      <p>The employee has been notified of this decision.</p>
    `;
  
    return baseLayout(content, 'Cancellation Approval Confirmation', 'Cancellation Approved');
};
