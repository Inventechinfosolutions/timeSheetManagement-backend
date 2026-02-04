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

    <div class="details-box" style="border-left: 4px solid #f97316;">
      <div class="detail-row">
        <span class="detail-label" style="color: #f97316;">Admin Comment:</span> 
        <p style="margin-top: 8px; font-style: italic; color: #374151;">${data.comment}</p>
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

  return baseLayout(content, `${data.requestType} Returned`, `${data.requestType} RETURNED`, 'white');
};
