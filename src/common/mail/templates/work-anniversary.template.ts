import { baseLayout } from './base.layout';
import dayjs from 'dayjs';

export interface WorkAnniversaryData {
  employeeName: string;
  employeeId?: string;
  designation?: string | null;
  department?: string | null;
  joiningDate?: string | Date;
  anniversaryDate?: string | Date;
  years?: number;
  portalUrl?: string;
}

export const getOrdinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export const getWorkAnniversarySubject = (employeeName: string, years: number = 1): string => {
  const ordinal = `${years}${getOrdinalSuffix(years)}`;
  return years === 1
    ? `🎉 Happy 1st Work Anniversary, ${employeeName}! Celebrating 1 Year of Excellence`
    : `🎉 Happy ${ordinal} Work Anniversary, ${employeeName}!`;
};

export const getWorkAnniversaryTemplate = (data: WorkAnniversaryData) => {
  const years = data.years && data.years > 0 ? data.years : 1;
  const ordinal = `${years}${getOrdinalSuffix(years)}`;
  const portalUrl = data.portalUrl || 'https://worksphere.inventech-developer.in';

  const formattedJoining = data.joiningDate
    ? dayjs(data.joiningDate).format('MMMM D, YYYY')
    : 'N/A';
  const formattedAnniversary = data.anniversaryDate
    ? dayjs(data.anniversaryDate).format('MMMM D, YYYY')
    : dayjs().format('MMMM D, YYYY');

  const milestoneTitle = years === 1 ? '1st Work Anniversary' : `${ordinal} Work Anniversary`;
  const mailSubject = getWorkAnniversarySubject(data.employeeName, years);
  const headerCardTitle = years === 1 ? '1 YEAR WORK ANNIVERSARY' : `${years} YEARS WORK ANNIVERSARY`;

  const monthsCount = years * 12;
  const daysCount = years * 365;

  const content = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      
      <!-- Celebratory Hero Card -->
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #eff6ff 0%, #fef3c7 50%, #fef9c3 100%); border: 1px solid #fde68a; border-radius: 16px; margin-bottom: 20px; overflow: hidden;">
        <tr>
          <td align="center" style="padding: 32px 24px;">
            
            <!-- Ribbon Badge -->
            <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 12px;">
              <tr>
                <td style="background: linear-gradient(90deg, #d97706, #f59e0b); border-radius: 9999px; padding: 6px 20px; text-align: center;">
                  <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #ffffff;">
                    🏆 ${milestoneTitle.toUpperCase()} MILESTONE
                  </span>
                </td>
              </tr>
            </table>

            <!-- Heading -->
            <h1 style="margin: 0 0 8px 0; font-size: 26px; font-weight: 800; color: #1e3a8a; line-height: 1.3;">
              Happy ${milestoneTitle}, ${data.employeeName}! 🎊
            </h1>
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #b45309;">
              ${years === 1 ? 'Celebrating 365 Days of Passion, Dedication & Innovation' : `Celebrating ${years} Years of Shared Growth & Excellence`}
            </p>
          </td>
        </tr>
      </table>

      <!-- Milestone Stat Badges (1 Year / 12 Months / 365 Days) -->
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
        <tr>
          <td width="32%" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="font-size: 24px; font-weight: 800; color: #4318FF; line-height: 1;">${years}</div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px;">${years === 1 ? 'Year Completed' : 'Years Completed'}</div>
          </td>
          <td width="2%">&nbsp;</td>
          <td width="32%" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="font-size: 24px; font-weight: 800; color: #d97706; line-height: 1;">${monthsCount}</div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px;">Months of Impact</div>
          </td>
          <td width="2%">&nbsp;</td>
          <td width="32%" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="font-size: 24px; font-weight: 800; color: #10b981; line-height: 1;">${daysCount}+</div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px;">Days of Dedication</div>
          </td>
        </tr>
      </table>

      <!-- Personal Congratulatory Message -->
      <p style="font-size: 15px; margin-bottom: 16px;">
        Dear <strong>${data.employeeName}</strong>,
      </p>

      <p style="font-size: 15px; margin-bottom: 16px; color: #374151;">
        Today is a momentous occasion! Exactly <strong>${years === 1 ? 'one wonderful year' : `${years} wonderful years`}</strong> ago, you joined our team. Since that first day, your hard work, creativity, and dedication have made a lasting and meaningful impact across the entire organization.
      </p>

      <p style="font-size: 15px; margin-bottom: 20px; color: #374151;">
        Your valuable contributions in the <strong>${data.department || 'our'}</strong> department as <strong>${data.designation || 'a valued team member'}</strong> have helped propel our goals forward. We are incredibly grateful for your positive energy, problem-solving mindset, and teamwork every single day.
      </p>

      <!-- Milestone Summary Card -->
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 24px 0;">
        <tr>
          <td style="padding: 20px 24px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 14px;">
              <tr>
                <td style="font-size: 13px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px;">
                  🌟 MILESTONE SUMMARY
                </td>
              </tr>
            </table>

            <table width="100%" border="0" cellspacing="0" cellpadding="8">
              <tr>
                <td width="40%" style="font-size: 13px; color: #64748b; font-weight: 600;">Employee Name:</td>
                <td width="60%" style="font-size: 13px; color: #0f172a; font-weight: 700;">${data.employeeName}</td>
              </tr>
              ${data.employeeId ? `
              <tr>
                <td style="font-size: 13px; color: #64748b; font-weight: 600;">Employee ID:</td>
                <td style="font-size: 13px; color: #0f172a; font-weight: 700;">${data.employeeId}</td>
              </tr>
              ` : ''}
              ${data.designation ? `
              <tr>
                <td style="font-size: 13px; color: #64748b; font-weight: 600;">Designation:</td>
                <td style="font-size: 13px; color: #0f172a; font-weight: 700;">${data.designation}</td>
              </tr>
              ` : ''}
              ${data.department ? `
              <tr>
                <td style="font-size: 13px; color: #64748b; font-weight: 600;">Department:</td>
                <td style="font-size: 13px; color: #0f172a; font-weight: 700;">${data.department}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="font-size: 13px; color: #64748b; font-weight: 600;">Date of Joining:</td>
                <td style="font-size: 13px; color: #0f172a; font-weight: 700;">${formattedJoining}</td>
              </tr>
              <tr>
                <td style="font-size: 13px; color: #64748b; font-weight: 600;">Anniversary Date:</td>
                <td style="font-size: 13px; color: #0f172a; font-weight: 700;">${formattedAnniversary}</td>
              </tr>
              <tr>
                <td style="font-size: 13px; color: #64748b; font-weight: 600;">Journey Milestone:</td>
                <td style="font-size: 13px; color: #d97706; font-weight: 800;">
                  ${years === 1 ? '✨ 1 Year Completed (365 Days of Excellence)' : `✨ ${years} Years Completed`}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Inspirational Quote Card -->
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 8px; margin: 24px 0;">
        <tr>
          <td style="padding: 16px 20px;">
            <p style="margin: 0 0 6px 0; font-size: 13px; font-style: italic; color: #92400e; line-height: 1.5;">
              “Success isn’t just about what you accomplish in your life, it’s about what you inspire others to do.”
            </p>
            <p style="margin: 0; font-size: 12px; font-weight: 700; color: #b45309;">
              Thank you for making our team stronger, brighter, and better every day! Here's to many more milestones together! 🚀
            </p>
          </td>
        </tr>
      </table>

      <!-- Call to Action Button -->
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0 20px 0;">
        <tr>
          <td align="center">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${portalUrl}" style="height:42px;v-text-anchor:middle;width:240px;" arcsize="20%" stroke="f" fillcolor="#4318FF">
              <w:anchorlock/>
              <center>
            <![endif]-->
            <a href="${portalUrl}" class="btn" style="background: linear-gradient(135deg, #4318FF 0%, #2563eb 100%); background-color: #4318FF; border-radius: 10px; color: #ffffff !important; display: inline-block; font-family: sans-serif; font-size: 14px; font-weight: 800; line-height: 42px; text-align: center; text-decoration: none; padding: 0 28px; box-shadow: 0 4px 14px rgba(67, 24, 255, 0.3); -webkit-text-size-adjust: none;">
              VIEW CELEBRATION IN WORKSPHERE &rarr;
            </a>
            <!--[if mso]>
              </center>
            </v:roundrect>
            <![endif]-->
          </td>
        </tr>
      </table>

      <!-- Warm Closing -->
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #4b5563;">
        <p style="margin: 0 0 4px 0;">With warmest congratulations & best wishes,</p>
        <p style="margin: 0; font-weight: 700; color: #1e3a8a;">The Management & WorkSphere Team</p>
        <p style="margin: 2px 0 0 0; font-size: 12px; color: #6b7280;">InvenTech Info Solutions Pvt. Ltd.</p>
      </div>

    </div>
  `;

  return baseLayout(content, mailSubject, headerCardTitle);
};
