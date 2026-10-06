import { baseLayout } from './base.layout';
import { WorkLocation } from '../../../employeeTimeSheet/enums/work-location.enum';
import { LeaveRequestType } from '../../../employeeTimeSheet/enums/leave-request-type.enum';
import { AttendanceStatus } from '../../../employeeTimeSheet/enums/attendance-status.enum';

export interface BatchDateRangeItem {
  fromDate: string;
  toDate: string;
  duration: string | number;
  requestType?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

export interface BatchRequestNotificationData {
  employeeName: string;
  employeeId: string;
  requestType: string;
  title: string;
  dateRanges: BatchDateRangeItem[];
  totalDuration: string | number;
  status: string;
  description?: string;
  recipientName?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

export interface BatchEmployeeReceiptData {
  employeeName: string;
  requestType: string;
  title: string;
  dateRanges: BatchDateRangeItem[];
  totalDuration: string | number;
  status: string;
  description?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

const renderDateRangesTable = (ranges: BatchDateRangeItem[], totalDuration: string | number) => {
  return `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-top: 15px; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
      <thead>
        <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
          <th style="padding: 10px 14px; font-family: sans-serif; font-size: 11px; text-align: center; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; width: 40px;">SL</th>
          <th style="padding: 10px 14px; font-family: sans-serif; font-size: 11px; text-align: left; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">From</th>
          <th style="padding: 10px 14px; font-family: sans-serif; font-size: 11px; text-align: left; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">To</th>
          <th style="padding: 10px 14px; font-family: sans-serif; font-size: 11px; text-align: right; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Duration</th>
        </tr>
      </thead>
      <tbody>
        ${ranges
          .map(
            (r, idx) => `
          <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;'}">
            <td style="padding: 10px 14px; font-family: sans-serif; font-size: 13px; text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
            <td style="padding: 10px 14px; font-family: sans-serif; font-size: 13px; color: #1e293b; font-weight: 600;">${r.fromDate}</td>
            <td style="padding: 10px 14px; font-family: sans-serif; font-size: 13px; color: #1e293b; font-weight: 600;">${r.toDate}</td>
            <td style="padding: 10px 14px; font-family: sans-serif; font-size: 13px; text-align: right; color: #1e293b; font-weight: 700;">${r.duration} Day(s)</td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr style="background-color: #f8fafc; border-top: 2px solid #e2e8f0;">
          <td colspan="3" style="padding: 12px 14px; font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
            TOTAL COMBINED DURATION:
          </td>
          <td style="padding: 12px 14px; font-family: sans-serif; font-size: 14px; text-align: right; font-weight: 800; color: #1e293b;">
            ${totalDuration} Day(s)
          </td>
        </tr>
      </tfoot>
    </table>
  `;
};

const buildDayDetailsHtml = (firstHalf?: string | null, secondHalf?: string | null) => {
  const fHalf = firstHalf || WorkLocation.OFFICE;
  const sHalf = secondHalf || WorkLocation.OFFICE;

  const hasSpecialHalves =
    (fHalf && fHalf !== WorkLocation.OFFICE) ||
    (sHalf && sHalf !== WorkLocation.OFFICE);

  if (!hasSpecialHalves) return '';

  if (fHalf === sHalf) {
    return `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
                <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
              </td>
            </tr>
          </table>
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <tr>
              <td align="left" style="padding: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1d4ed8;">
                Full Day : 
              </td>
              <td align="right" style="padding: 12px;">
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background-color: #dbeafe; border-radius: 6px; padding: 4px 12px;">
                      <span style="font-family: sans-serif; color: #1e40af; font-size: 12px; font-weight: 700; text-transform: uppercase;">${fHalf}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  }

  return `
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin: 25px 0;">
    <tr>
      <td style="padding: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
          <tr>
            <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
              <span style="font-size: 16px; margin-right: 8px;">🕒</span> DAY DETAILS
            </td>
          </tr>
        </table>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td width="48%" style="background-color: #f1f5f9; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr><td style="font-family: sans-serif; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; padding-bottom: 4px;">FIRST HALF</td></tr>
                <tr><td style="font-family: sans-serif; font-size: 15px; font-weight: 800; color: #2563eb;">${fHalf}</td></tr>
              </table>
            </td>
            <td width="4%">&nbsp;</td>
            <td width="48%" style="background-color: #f1f5f9; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr><td style="font-family: sans-serif; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; padding-bottom: 4px;">SECOND HALF</td></tr>
                <tr><td style="font-family: sans-serif; font-size: 15px; font-weight: 800; color: #2563eb;">${sHalf}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
};

const resolveRequestDisplayName = (
  rawType: string,
  firstHalf?: string | null,
  secondHalf?: string | null,
) => {
  let displayName = rawType;
  const fHalf = firstHalf || WorkLocation.OFFICE;
  const sHalf = secondHalf || WorkLocation.OFFICE;

  if (fHalf !== WorkLocation.OFFICE || sHalf !== WorkLocation.OFFICE) {
    if (fHalf === sHalf) {
      displayName =
        fHalf === LeaveRequestType.APPLY_LEAVE ||
        fHalf === AttendanceStatus.LEAVE
          ? 'Leave'
          : fHalf;
    } else if (
      (fHalf === AttendanceStatus.LEAVE ||
        fHalf === LeaveRequestType.APPLY_LEAVE) &&
      sHalf === WorkLocation.OFFICE
    ) {
      displayName = 'Half Day Leave';
    } else if (
      fHalf === WorkLocation.OFFICE &&
      (sHalf === AttendanceStatus.LEAVE ||
        sHalf === LeaveRequestType.APPLY_LEAVE)
    ) {
      displayName = 'Half Day Leave';
    } else {
      const parts = [fHalf, sHalf]
        .map((h) =>
          h === LeaveRequestType.APPLY_LEAVE || h === AttendanceStatus.LEAVE
            ? 'Leave'
            : h,
        )
        .filter((h) => h && h !== WorkLocation.OFFICE);
      displayName = parts.join(' + ');
    }
  }
  return displayName;
};

/**
 * Single combined notification email sent to Manager, HR, and CCs for multiple date ranges.
 * Matches exact opening, closing, and DAY DETAILS of the original request notification template.
 */
export const getBatchRequestNotificationTemplate = (data: BatchRequestNotificationData) => {
  const statusLower = (data.status || 'pending').toLowerCase();
  const statusColor = statusLower === 'pending' ? '#f97316' : '#6b7280';
  const requestDisplayName = resolveRequestDisplayName(
    data.requestType,
    data.firstHalf,
    data.secondHalf,
  );
  const headerLabel = `NEW ${requestDisplayName.toUpperCase()} REQUEST`;
  const mailSubject = `New Request: ${requestDisplayName} - ${data.employeeName}`;
  const dayDetailsSection = buildDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">${data.recipientName ? `Hello ${data.recipientName},` : 'Hello,'}</p>
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>${data.employeeName}</strong> (EMP-${data.employeeId}) has submitted a new <strong>${requestDisplayName}</strong>.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Subject:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.title}</td>
            </tr>
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Request Type:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${requestDisplayName}</td>
            </tr>
            <tr>
              <td width="140" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Total Duration:</td>
              <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.totalDuration} Day(s)</td>
            </tr>
          </table>

          <div style="margin-top: 15px;">
            <p style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin: 0 0 5px 0;">Selected Date Ranges:</p>
            ${renderDateRangesTable(data.dateRanges, data.totalDuration)}
          </div>

          ${data.description ? `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px dashed #e2e8f0; margin-top: 15px;">
              <tr>
                <td style="padding-top: 15px;">
                  <p style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin: 0 0 5px 0;">Description:</p>
                  <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">${data.description}</p>
                </td>
              </tr>
            </table>
          ` : ''}
        </td>
      </tr>
    </table>

    ${dayDetailsSection}

    <p style="font-family: sans-serif; font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${data.status}</span>
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 12px;">
      <tr>
        <td align="left">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://worksphere.inventech-developer.in" style="height:35px;v-text-anchor:middle;width:160px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
            <w:anchorlock/>
            <center>
          <![endif]-->
          <a href="https://worksphere.inventech-developer.in" class="btn" style="background-color:#2563eb;border-radius:8px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:13px;font-weight:bold;line-height:35px;text-align:left;text-decoration:none;padding:0 14px;-webkit-text-size-adjust:none;">LOGIN TO PORTAL →</a>
          <!--[if mso]>
            </center>
          </v:roundrect>
          <![endif]-->
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, mailSubject, headerLabel);
};

/**
 * Single combined receipt email sent to Employee for multiple date ranges.
 * Matches exact opening, closing, and DAY DETAILS of the original employee receipt template.
 */
export const getBatchEmployeeReceiptTemplate = (data: BatchEmployeeReceiptData) => {
  const headerLabel = 'SUBMISSION SUCCESSFUL';
  const requestDisplayName = resolveRequestDisplayName(
    data.requestType,
    data.firstHalf,
    data.secondHalf,
  );
  const mailSubject = `Submission Received: ${requestDisplayName} - ${data.title}`;
  const statusColor = '#f59e0b'; // Amber for pending
  const dayDetailsSection = buildDayDetailsHtml(data.firstHalf, data.secondHalf);

  const content = `
    <p style="font-family: sans-serif; font-size: 16px; color: #1f2937;">Dear ${data.employeeName},</p>
    <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your request for <strong>${requestDisplayName}</strong> has been successfully submitted and is now awaiting review.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 25px 0;">
      <tr>
        <td style="padding: 20px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Subject:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.title}</td>
            </tr>
            <tr>
              <td width="140" style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Request Type:</td>
              <td style="padding-bottom: 12px; font-family: sans-serif; font-size: 14px; color: #1f2937;">${requestDisplayName}</td>
            </tr>
            <tr>
              <td width="140" style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1e40af;">Total Duration:</td>
              <td style="font-family: sans-serif; font-size: 14px; color: #1f2937;">${data.totalDuration} Day(s)</td>
            </tr>
          </table>

          <div style="margin-top: 15px;">
            <p style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin: 0 0 5px 0;">Selected Date Ranges:</p>
            ${renderDateRangesTable(data.dateRanges, data.totalDuration)}
          </div>

          ${data.description ? `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px dashed #e2e8f0; margin-top: 15px;">
              <tr>
                <td style="padding-top: 15px;">
                  <p style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin: 0 0 5px 0;">Description:</p>
                  <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">${data.description}</p>
                </td>
              </tr>
            </table>
          ` : ''}
        </td>
      </tr>
    </table>

    ${dayDetailsSection}

    <p style="font-family: sans-serif; font-size: 16px; font-weight: 700; margin-top: 20px;">
      Status: <span style="color: ${statusColor}; text-transform: uppercase;">${data.status}</span>
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 12px;">
      <tr>
        <td align="left">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://worksphere.inventech-developer.in" style="height:35px;v-text-anchor:middle;width:160px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
            <w:anchorlock/>
            <center>
          <![endif]-->
          <a href="https://worksphere.inventech-developer.in" class="btn" style="background-color:#2563eb;border-radius:8px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:13px;font-weight:bold;line-height:35px;text-align:left;text-decoration:none;padding:0 14px;-webkit-text-size-adjust:none;">LOGIN TO PORTAL →</a>
          <!--[if mso]>
            </center>
          </v:roundrect>
          <![endif]-->
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, mailSubject, headerLabel);
};
