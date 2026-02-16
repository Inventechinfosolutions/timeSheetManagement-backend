export const baseLayout = (content: string, title: string, headerCardTitle?: string, headerTheme: 'white' | 'indigo' = 'white') => {
  const isIndigo = headerTheme === 'indigo';
  const headerCardBg = isIndigo ? '#6366f1' : '#ffffff';
  const headerCardColor = isIndigo ? '#ffffff' : '#0a8fe7';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body, table, td, p, a {
      font-family: 'Inter', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .header {
      background-color: #0a8fe7;
      padding: 30px 40px;
      color: #ffffff;
    }
    .company-name {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .company-sub {
      margin: 2px 0 0;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.9;
    }
    .bell-icon {
      font-size: 28px;
    }
    .main-body {
      padding: 40px;
    }
    .card-title-bar {
      background-color: #6366f1; /* Vibrant Indigo from Img 2 */
      color: #ffffff;
      padding: 16px 20px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 30px;
    }
    .card-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .details-box {
      background-color: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .detail-row {
      margin-bottom: 12px;
      font-size: 14px;
      color: #4b5563;
    }
    .detail-label {
      font-weight: 700;
      color: #1f2937;
      width: 100px;
      display: inline-block;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .status-pending { background-color: #fef3c7; color: #92400e; }
    .status-approved { background-color: #d1fae5; color: #065f46; }
    .status-rejected { background-color: #fee2e2; color: #991b1b; }
    .status-cancelled { background-color: #f3f4f6; color: #374151; }
    
    .btn {
      background-color: #0a8fe7;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 700;
      display: inline-block;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .footer {
      padding: 24px 40px;
      background-color: #f9fafb;
      border-top: 1px solid #edf2f7;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
    }
    .day-details-container {
      background-color: #eff6ff;
      border: 1px solid #dbeafe;
      border-radius: 12px;
      padding: 16px;
      margin: 20px 0;
    }
    .day-details-header {
      font-size: 13px;
      font-weight: 800;
      color: #1e3a8a;
      text-transform: uppercase;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
    }
    .half-card-table { width: 100%; border-collapse: separate; border-spacing: 10px 0; margin: 0 -10px; }
    .half-card {
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      width: 50%;
    }
    .half-label {
      font-size: 10px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .half-value {
      font-size: 15px;
      font-weight: 800;
      color: #4f46e5;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="left">
            <h1 class="company-name">INVENTECH</h1>
            <p class="company-sub">INFO SOLUTIONS PVT. LTD.</p>
          </td>
          <td align="right">
            <span class="bell-icon">🔔</span>
          </td>
        </tr>
      </table>
      ${headerCardTitle ? `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 25px;">
        <tr>
          <td style="background-color: ${headerCardBg}; padding: 16px 20px; border-radius: 8px; text-align: center;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${headerCardColor};">
              ${headerCardTitle}
            </h2>
          </td>
        </tr>
      </table>
      ` : ''}
    </div>

    <!-- Main Content -->
    <div class="main-body">
      ${content}
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>This is an automated message. Please do not reply directly.</p>
      <p>© ${new Date().getFullYear()} InvenTech Info Solutions Pvt. Ltd.</p>
    </div>
  </div>
</body>
</html>
`;
};
