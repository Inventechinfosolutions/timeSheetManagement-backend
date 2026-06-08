export interface SimpleEmailData {
  recipientName: string;
  subject: string;
  bodyLines: string[];
  actionLabel?: string;
  actionUrl?: string;
  greeting?: string;
  signOffPrefix?: string;
  signOff?: string;
}

const DEFAULT_PORTAL_URL =
  process.env.FRONTEND_URL || 'https://worksphere.inventech-developer.in';

const FOOTER_TEXT =
  'Worksphere powered by InvenTech Info Solutions';

export const getPortalUrl = (): string => DEFAULT_PORTAL_URL;

export const getSimpleEmailTemplate = (data: SimpleEmailData): string => {
  const greeting = data.greeting ?? `Hi ${data.recipientName},`;
  const signOffPrefix = data.signOffPrefix ?? 'Regards,';
  const signOff = data.signOff ?? 'InvenTech HR Team';

  const bodyHtml = data.bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333;">${line}</p>`,
    )
    .join('');

  const actionHtml =
    data.actionLabel && data.actionUrl
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333;">
           <a href="${data.actionUrl}" style="color:#2563eb;text-decoration:underline;">${data.actionLabel}</a>
         </p>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.subject}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333;">${greeting}</p>
    ${bodyHtml}
    ${actionHtml}
    <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#333333;">${signOffPrefix}</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#333333;">${signOff}</p>
    <p style="margin:0;font-size:11px;line-height:1.5;color:#999999;">${FOOTER_TEXT}</p>
  </div>
</body>
</html>`;
};
