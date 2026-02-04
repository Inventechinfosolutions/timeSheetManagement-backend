import { baseLayout } from './base.layout';

export interface GeneralNotificationData {
  recipientName: string;
  title: string;
  message: string;
}

export const getGeneralNotificationTemplate = (data: GeneralNotificationData) => {
  const content = `
    <div style="font-size: 15px; color: #333; line-height: 1.6;">
      <p>Dear ${data.recipientName},</p>
      
      <div style="margin: 25px 0;">
        ${data.message.replace(/\n/g, '<br>')}
      </div>

      <div style="text-align: left; margin-top: 35px;">
        <a href="https://timesheet.inventech-developer.in" class="btn">LOGIN TO PORTAL →</a>
      </div>
    </div>
  `;

  return baseLayout(content, data.title, data.title);
};
