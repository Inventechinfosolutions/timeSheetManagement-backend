import {
  getPortalUrl,
  getSimpleEmailTemplate,
} from './simple-email.template';

export interface GeneralNotificationData {
  recipientName: string;
  title: string;
  message: string;
}

export const getGeneralNotificationTemplate = (data: GeneralNotificationData) => {
  const bodyLines = data.message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return getSimpleEmailTemplate({
    recipientName: data.recipientName,
    subject: data.title,
    bodyLines,
    actionLabel: 'Login to portal',
    actionUrl: getPortalUrl(),
  });
};
