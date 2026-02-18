import { baseLayout } from './base.layout';

export interface ReturnData {
  employeeName: string;
  requestType: string;
  title: string;
  comment: string;
}

export const getReturnTemplate = (data: ReturnData) => {
  const content = `
    <p style="font-size: 16px; color: #1f2937;">Dear ${data.employeeName},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your request for <strong>${data.requestType}</strong> titled "<strong>${data.title}</strong>" has been <strong>Returned</strong> for corrections.
    </p>

    <div class="details-box" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0; border-left: 4px solid #f97316;">
      <div class="detail-row">
        <span class="detail-label" style="font-weight: 700; color: #f97316; min-width: 140px; display: inline-block;">Admin Comment:</span> 
        <p style="margin-top: 8px; font-style: italic; color: #374151; margin-bottom: 0;">${data.comment}</p>
      </div>
    </div>

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: #f97316; text-transform: uppercase;">Returned</span>
    </p>

    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      Please update the request information and resubmit.
    </p>

    <div style="text-align: left; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">UPDATE REQUEST →</a>
    </div>
  `;

  return baseLayout(content, `${data.requestType} Returned`, `${data.requestType} RETURNED`);
};
