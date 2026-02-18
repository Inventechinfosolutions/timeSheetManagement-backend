import { baseLayout } from './base.layout';

export interface CancellationData {
  employeeName: string;
  employeeId: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  reason?: string;
  actionType?: 'request' | 'revert' | 'revert_back';
}

export const getCancellationTemplate = (data: CancellationData) => {
  const isRevert = data.actionType === 'revert';
  const isRevertBack = data.actionType === 'revert_back';
  
  let actionText = 'has submitted a cancellation request for';
  let statusText = 'Pending';
  let statusColor = '#f97316'; // Orange

  if (isRevert || isRevertBack) {
    actionText = isRevert ? 'has REVERTED their cancellation request for' : 'has REVERTED BACK their pending request for';
    statusText = 'REVERTED';
    statusColor = '#8b5cf6'; // Purple
  }

  const content = `
    <p style="font-size: 16px; color: #1f2937;">Hello Admin,</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) ${actionText} <strong>${data.requestType}</strong> titled "<strong>${data.title}</strong>".
    </p>

    <div class="details-box" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
      <div class="detail-row" style="margin-bottom: 12px; font-size: 14px;">
        <span class="detail-label" style="font-weight: 700; color: #1e40af; min-width: 140px; display: inline-block;">From:</span> ${data.fromDate}
      </div>
      <div class="detail-row" style="margin-bottom: 12px; font-size: 14px;">
        <span class="detail-label" style="font-weight: 700; color: #1e40af; min-width: 140px; display: inline-block;">To:</span> ${data.toDate}
      </div>
      <div class="detail-row" style="margin-bottom: 0; font-size: 14px;">
        <span class="detail-label" style="font-weight: 700; color: #1e40af; min-width: 140px; display: inline-block;">Duration:</span> ${data.duration} Day(s)
      </div>
    </div>

    <p style="font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${statusText}</span>
    </p>

    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-top: 20px;">
      Please log in to the portal for more details.
    </p>

    <div style="text-align: center; margin-top: 40px;">
      <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
    </div>
  `;

  const headerLabel = isRevert ? 'CANCELLATION REVERTED' : isRevertBack ? `${data.requestType} REVERTED` : `${data.requestType} CANCELLATION`;

  return baseLayout(content, `${data.requestType} Update`, headerLabel);
};
