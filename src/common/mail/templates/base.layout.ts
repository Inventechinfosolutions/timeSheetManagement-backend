export const baseLayout = (
  content: string,
  title: string,
  headerCardTitle?: string
) => {
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
    background: linear-gradient(135deg, #3b82f6, #1e40af);
  }

  /* Main Card */
  .container {
    max-width: 620px;
    margin: 40px auto;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(0,0,0,0.18);
  }

  /* Header (Matches App Gradient) */
  .header {
    background: linear-gradient(90deg, #2563eb, #1e40af);
    padding: 35px 40px;
    color: #ffffff;
  }

  .company-name {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }

  .company-sub {
    margin: 4px 0 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.85;
  }

  .bell-icon {
    font-size: 26px;
  }

  /* Glass Header Card */
  .header-card {
    margin-top: 25px;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 14px;
    padding: 14px 20px;
    text-align: center;
  }

  .header-card h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #ffffff;
  }

  /* Main Content */
  .main-body {
    padding: 40px;
    background: #f8fafc;
  }

  /* Day Details Box */
  .day-details-container {
    background: #ffffff;
    border-radius: 14px;
    padding: 20px;
    margin: 25px 0;
    border: 1px solid #e2e8f0;
    box-shadow: 0 8px 20px rgba(0,0,0,0.06);
  }

  .day-details-header {
    font-size: 13px;
    font-weight: 800;
    color: #1e40af;
    text-transform: uppercase;
    margin-bottom: 15px;
  }

  /* Half Cards */
  .half-card-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 12px 0;
  }

  .half-card {
    background: #f1f5f9;
    border-radius: 10px;
    padding: 14px;
    border: 1px solid #e2e8f0;
    width: 50%;
  }

  .half-label {
    font-size: 10px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .half-value {
    font-size: 15px;
    font-weight: 800;
    color: #2563eb;
  }

  /* Status Badges */
  .status-badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .status-pending {
    background: #fef3c7;
    color: #b45309;
  }

  .status-approved {
    background: #dcfce7;
    color: #166534;
  }

  .status-rejected {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-cancelled {
    background: #e2e8f0;
    color: #475569;
  }

  /* Button */
  .btn {
    background: linear-gradient(90deg, #2563eb, #1e40af);
    color: #ffffff !important;
    text-decoration: none;
    padding: 14px 30px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    display: inline-block;
    text-align: center;
    letter-spacing: 0.5px;
    box-shadow: 0 6px 16px rgba(37,99,235,0.35);
  }

  /* Footer */
  .footer {
    padding: 24px 40px;
    background: #f1f5f9;
    text-align: center;
    font-size: 12px;
    color: #64748b;
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

      ${
        headerCardTitle
          ? `
        <div class="header-card">
          <h2>${headerCardTitle}</h2>
        </div>
      `
          : ""
      }
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
