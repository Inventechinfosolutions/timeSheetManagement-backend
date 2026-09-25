import { baseLayout } from './base.layout';

export interface PasswordResetData {
  recipientName: string;
  resetLink: string;
  expiresInMinutes?: number;
}

export const getPasswordResetTemplate = (data: PasswordResetData) => {
  const expiresIn = data.expiresInMinutes || 5;

  const content = `
    <p style="font-family: sans-serif; font-size: 15px; color: #1f2937; line-height: 1.6; margin: 0 0 16px 0;">
      Hello <strong>${data.recipientName}</strong>,
    </p>
    <p style="font-family: sans-serif; font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
      We received a request to reset the password for your <strong>WorkSphere</strong> account. Click the button below to set a new password:
    </p>

    <!-- Action Button -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
      <tr>
        <td align="center">
          <a href="${data.resetLink}" class="btn" style="background-color: #2563eb; color: #ffffff !important; font-family: sans-serif; font-size: 15px; font-weight: 800; text-decoration: none; padding: 14px 36px; border-radius: 8px; display: inline-block; letter-spacing: 0.5px;">
            RESET MY PASSWORD →
          </a>
        </td>
      </tr>
    </table>

    <!-- Direct Link Box -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 24px 0;">
      <p style="font-family: sans-serif; font-size: 13px; color: #64748b; margin: 0 0 8px 0; font-weight: 600;">
        If the button above does not work, copy and paste the following link into your browser:
      </p>
      <p style="font-family: monospace; font-size: 12px; color: #2563eb; word-break: break-all; margin: 0;">
        <a href="${data.resetLink}" style="color: #2563eb; text-decoration: underline;">${data.resetLink}</a>
      </p>
    </div>

    <!-- Security Expiry Notice -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; margin-top: 20px;">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="font-family: sans-serif; font-size: 13px; color: #92400e; margin: 0; line-height: 1.6;">
            <span style="font-weight: 800;">⏱️ Note:</span> This password reset link will expire in <strong>${expiresIn} minutes</strong>. If you did not request a password reset, please ignore this email or contact your administrator.
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(
    content,
    'Password Reset Request — WorkSphere',
    'PASSWORD RESET REQUEST',
  );
};
