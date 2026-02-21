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
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
                <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
              </td>
            </tr>
          </table>
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <tr>
              <td align="left" style="padding: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1d4ed8;">
                Full Day : 
              </td>
              <td align="right" style="padding: 12px;">
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background-color: #f1f5f9; border-radius: 6px; padding: 4px 12px;">
                      <span style="font-family: sans-serif; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase;">${fHalf}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  } else {
    return `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
                <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
              </td>
            </tr>
          </table>
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="48%" style="background-color: #f1f5f9; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr><td style="font-family: sans-serif; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; padding-bottom: 4px;">FIRST HALF</td></tr>
                  <tr><td style="font-family: sans-serif; font-size: 15px; font-weight: 800; color: #2563eb;">${fHalf}</td></tr>
                </table>
              </td>
              <td width="4%">&nbsp;</td>
              <td width="48%" style="background-color: #f1f5f9; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr><td style="font-family: sans-serif; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; padding-bottom: 4px;">SECOND HALF</td></tr>
                  <tr><td style="font-family: sans-serif; font-size: 15px; font-weight: 800; color: #2563eb;">${sHalf}</td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  }
};

export const getRejectionConfirmationTemplate = (data: RejectionConfirmationParams) => {
  const reasonText = data.reason ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 15px;"><tr><td style="font-family: sans-serif; font-size: 14px; color: #1f2937;"><strong>Reason for Rejection:</strong> ${data.reason}</td></tr></table>` : '';
  const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Dear ${data.reviewerName},</p>
    
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">This is a confirmation that you have <strong>Rejected</strong> the following request:</p>
    
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
        <tr>
          <td style="padding: 20px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td width="120" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Employee:</td>
                <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.employeeName} (${data.employeeId})</td>
              </tr>
              <tr>
                <td width="120" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Type:</td>
                <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.requestType}</td>
              </tr>
              <tr>
                <td width="120" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Dates:</td>
                <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.startDate} to ${data.endDate}</td>
              </tr>
              <tr>
                <td width="120" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Duration:</td>
                <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.duration} Day(s)</td>
              </tr>
            </table>
            ${reasonText}
          </td>
        </tr>
      </table>

      ${dayDetailsHtml}
    
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">The employee has been notified that this request was not approved. Their attendance record for these dates will remain unchanged (or marked as Absent/Upcoming).</p>
  `;

  return baseLayout(content, 'Rejection Confirmation', 'Request Rejected');
};

export const getCancellationRejectionConfirmationTemplate = (data: CancellationRejectionConfirmationParams) => {
  const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Dear ${data.reviewerName},</p>
    
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">You have <strong>Rejected</strong> the Cancellation Request for the following:</p>
    
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Employee:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.employeeName}</td>
            </tr>
            <tr>
              <td width="140" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Original Request:</td>
              <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.requestType} on ${data.dates}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${dayDetailsHtml}
    
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">This means the Original Approval remains in effect. The employee's attendance status for these dates will not be reverted and will stay as <strong>${data.requestType}</strong>.</p>
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">The employee has been notified of this decision.</p>
  `;

  return baseLayout(content, 'Cancellation Rejection Confirmation', 'Cancellation Rejected');
};

export const getApprovalConfirmationTemplate = (data: ApprovalConfirmationParams) => {
  const reasonText = data.reason ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 15px;"><tr><td style="font-family: sans-serif; font-size: 14px; color: #1f2937;"><strong>Note:</strong> ${data.reason}</td></tr></table>` : '';
  const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
      <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Dear ${data.reviewerName},</p>
      
      <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">This is a confirmation that you have <strong>Approved</strong> the following ${data.requestType} request:</p>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
        <tr>
          <td style="padding: 20px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td width="120" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Employee:</td>
                <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.employeeName} (${data.employeeId})</td>
              </tr>
              <tr>
                <td width="120" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Type:</td>
                <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.requestType}</td>
              </tr>
              <tr>
                <td width="120" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Dates:</td>
                <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.startDate} to ${data.endDate}</td>
              </tr>
              <tr>
                <td width="120" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Duration:</td>
                <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.duration} Day(s)</td>
              </tr>
            </table>
            ${reasonText}
          </td>
        </tr>
      </table>

      ${dayDetailsHtml}
      
      <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">The employee has been notified that this request was approved. Their attendance record for these dates will be updated to reflect this approval.</p>
    `;

  return baseLayout(content, 'Approval Confirmation', 'Request Approved');
};

export const getCancellationApprovalConfirmationTemplate = (data: CancellationApprovalConfirmationParams) => {
  const dayDetailsHtml = getDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
      <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Dear ${data.reviewerName},</p>
      
      <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">You have <strong>Approved</strong> the Cancellation Request for the following:</p>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
        <tr>
          <td style="padding: 20px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Employee:</td>
                <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.employeeName}</td>
              </tr>
              <tr>
                <td width="140" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Original Request:</td>
                <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.requestType} on ${data.dates}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${dayDetailsHtml}
      
      <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">This means the Original Approval has been revoked. The employee's attendance status for these dates will be reverted to its original state.</p>
      <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">The employee has been notified of this decision.</p>
    `;

  return baseLayout(content, 'Cancellation Approval Confirmation', 'Cancellation Approved');
};


