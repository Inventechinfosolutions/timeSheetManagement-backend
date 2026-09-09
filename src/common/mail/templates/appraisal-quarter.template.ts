import { baseLayout } from './base.layout';

export interface AppraisalQuarterAssignedParams {
  employeeName: string;
  quarter: string;
  assignedByName: string;
  assignedByRole: string;
  deadlineAt: Date;
  financialYear?: string;
  notes?: string | null;
  portalUrl?: string;
}

export const getAppraisalQuarterAssignedTemplate = (
  data: AppraisalQuarterAssignedParams,
): string => {
  const portalUrl = data.portalUrl || 'https://worksphere.inventech-developer.in';

  const deadlineDateStr = data.deadlineAt.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const deadlineTimeStr = data.deadlineAt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const assignerRoleLabel =
    data.assignedByRole === 'ADMIN'
      ? 'Administrator'
      : data.assignedByRole === 'CEO'
        ? 'CEO'
        : data.assignedByRole === 'MANAGER'
          ? 'Manager'
          : data.assignedByRole;

  const notesHtml = data.notes
    ? `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 20px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin: 0 0 6px 0;">
            <span style="margin-right: 6px;">📝</span> Additional Notes
          </p>
          <p style="font-family: sans-serif; font-size: 14px; color: #374151; line-height: 1.6; margin: 0;">${data.notes}</p>
        </td>
      </tr>
    </table>`
    : '';

  const content = `

    <!-- Congratulations Banner -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%); border: 1px solid #bfdbfe; border-radius: 14px; margin-bottom: 28px;">
      <tr>
        <td align="center" style="padding: 26px 24px;">
          <p style="font-family: sans-serif; font-size: 32px; margin: 0 0 8px 0;">🎉</p>
          <p style="font-family: sans-serif; font-size: 22px; font-weight: 800; color: #1e40af; margin: 0 0 6px 0;">Congratulations, ${data.employeeName}!</p>
          <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; margin: 0;">Your Quarterly Appraisal Review has been assigned.</p>
        </td>
      </tr>
    </table>

    <p style="font-family: sans-serif; font-size: 15px; color: #374151; line-height: 1.7; margin: 0 0 24px 0;">
      Your <strong>${data.assignedByRole === 'MANAGER' ? 'Manager' : assignerRoleLabel}</strong>,
      <strong>${data.assignedByName}</strong>, has assigned your performance appraisal review for the quarter.
      Please log in to WorkSphere and complete your self-assessment before the deadline.
    </p>

    <!-- Review Details Card -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 24px;">

          <!-- Card Header -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 18px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">
                <span style="font-size: 16px; margin-right: 8px;">📋</span> Review Details
              </td>
            </tr>
          </table>

          <!-- Details Rows -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Quarter</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1f2937; vertical-align: top;">
                <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 800;">${data.quarter}</span>
              </td>
            </tr>
            ${data.financialYear ? `
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Financial Year</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; color: #1f2937; vertical-align: top;">${data.financialYear}</td>
            </tr>` : ''}
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Assigned By</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; color: #1f2937; vertical-align: top;">${data.assignedByName} <span style="color: #6b7280; font-size: 12px;">(${assignerRoleLabel})</span></td>
            </tr>
            <tr>
              <td width="160" style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Submission Deadline</td>
              <td style="font-family: sans-serif; font-size: 14px; font-weight: 700; color: #dc2626; vertical-align: top;">
                ${deadlineDateStr} at ${deadlineTimeStr}
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>

    <!-- Deadline Warning -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="font-family: sans-serif; font-size: 13px; color: #92400e; margin: 0; line-height: 1.6;">
            <span style="font-weight: 800;">⚠️ Important:</span> You have <strong>3 days</strong> to complete and submit your self-appraisal.
            Reviews not submitted by the deadline will be <strong>auto-submitted</strong> with the progress saved up to that point.
          </p>
        </td>
      </tr>
    </table>

    ${notesHtml}

    <!-- Steps Section -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
      <tr>
        <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 14px;">
          <span style="margin-right: 8px;">🚀</span> How to Complete Your Review
        </td>
      </tr>
      <tr>
        <td>
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding-bottom: 10px;">
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background-color: #2563eb; color: #ffffff; font-family: sans-serif; font-size: 12px; font-weight: 800; width: 24px; height: 24px; border-radius: 50%; text-align: center; vertical-align: middle; padding: 0 8px;">1</td>
                    <td style="font-family: sans-serif; font-size: 14px; color: #374151; padding-left: 12px;">Log in to the <strong>WorkSphere Portal</strong></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background-color: #2563eb; color: #ffffff; font-family: sans-serif; font-size: 12px; font-weight: 800; width: 24px; height: 24px; border-radius: 50%; text-align: center; vertical-align: middle; padding: 0 8px;">2</td>
                    <td style="font-family: sans-serif; font-size: 14px; color: #374151; padding-left: 12px;">Navigate to <strong>Appraisal → Quarterly Review</strong></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background-color: #2563eb; color: #ffffff; font-family: sans-serif; font-size: 12px; font-weight: 800; width: 24px; height: 24px; border-radius: 50%; text-align: center; vertical-align: middle; padding: 0 8px;">3</td>
                    <td style="font-family: sans-serif; font-size: 14px; color: #374151; padding-left: 12px;">Fill in your self-assessment for <strong>${data.quarter}</strong></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background-color: #2563eb; color: #ffffff; font-family: sans-serif; font-size: 12px; font-weight: 800; width: 24px; height: 24px; border-radius: 50%; text-align: center; vertical-align: middle; padding: 0 8px;">4</td>
                    <td style="font-family: sans-serif; font-size: 14px; color: #374151; padding-left: 12px;">Submit before the deadline: <strong style="color: #dc2626;">${deadlineDateStr}</strong></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 32px 0 24px 0;">
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${portalUrl}"
            style="height:48px;v-text-anchor:middle;width:260px;" arcsize="10%"
            fillcolor="#2563eb" stroke="f">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">
              START MY REVIEW →
            </center>
          </v:roundrect>
          <![endif]-->
          <![if !mso]>
          <a href="${portalUrl}"
             style="background-color: #2563eb; color: #ffffff; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px;
                    font-family: sans-serif; font-size: 15px; font-weight: 800; display: inline-block;
                    letter-spacing: 0.3px;">
            START MY REVIEW →
          </a>
          <![endif]>
        </td>
      </tr>
    </table>

    <p style="font-family: sans-serif; font-size: 13px; color: #9ca3af; line-height: 1.6; margin: 0; text-align: center;">
      This review was assigned by <strong>${data.assignedByName}</strong>. If you have questions, please reach out to your ${assignerRoleLabel} directly.
    </p>
  `;

  return baseLayout(content, `Quarterly Review Assigned: ${data.quarter}`, `Quarterly Review — ${data.quarter}`);
};

export interface AppraisalQuarterSubmittedEmployeeParams {
  employeeName: string;
  quarter: string;
  managerName?: string;
  submittedDate?: Date;
  portalUrl?: string;
}

export const getAppraisalQuarterSubmittedEmployeeTemplate = (
  data: AppraisalQuarterSubmittedEmployeeParams,
): string => {
  const portalUrl = data.portalUrl || process.env.FRONTEND_URL || 'https://worksphere.inventech-developer.in';
  const submitDateStr = (data.submittedDate || new Date()).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const content = `
    <!-- Success Banner -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #dcfce7 0%, #ede9fe 100%); border: 1px solid #bbf7d0; border-radius: 14px; margin-bottom: 28px;">
      <tr>
        <td align="center" style="padding: 26px 24px;">
          <p style="font-family: sans-serif; font-size: 32px; margin: 0 0 8px 0;">✅</p>
          <p style="font-family: sans-serif; font-size: 22px; font-weight: 800; color: #15803d; margin: 0 0 6px 0;">Self-Review Submitted!</p>
          <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; margin: 0;">Great job, ${data.employeeName}! Your quarterly appraisal has been submitted.</p>
        </td>
      </tr>
    </table>

    <p style="font-family: sans-serif; font-size: 15px; color: #374151; line-height: 1.7; margin: 0 0 24px 0;">
      Your self-assessment for <strong>${data.quarter}</strong> has been successfully submitted and forwarded to your manager${data.managerName ? `, <strong>${data.managerName}</strong>,` : ''} for evaluation.
    </p>

    <!-- Review Details Card -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 24px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 18px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">
                <span style="font-size: 16px; margin-right: 8px;">📋</span> Submission Summary
              </td>
            </tr>
          </table>

          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Quarter</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1f2937; vertical-align: top;">
                <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 800;">${data.quarter}</span>
              </td>
            </tr>
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Status</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #15803d; vertical-align: top;">
                <span style="background-color: #dcfce7; color: #15803d; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 800;">Submitted / Pending Evaluation</span>
              </td>
            </tr>
            ${data.managerName ? `
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Reviewer</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; color: #1f2937; vertical-align: top;">${data.managerName}</td>
            </tr>` : ''}
            <tr>
              <td width="160" style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Submitted On</td>
              <td style="font-family: sans-serif; font-size: 14px; color: #1f2937; vertical-align: top;">${submitDateStr}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Next Steps Note -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="font-family: sans-serif; font-size: 13px; color: #1e40af; margin: 0; line-height: 1.6;">
            <span style="font-weight: 800;">ℹ️ What's Next:</span> Your manager will review your submission and complete their performance evaluation and ratings. You will receive another notification once the evaluation is finalized.
          </p>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 32px 0 24px 0;">
      <tr>
        <td align="center">
          <a href="${portalUrl}"
             style="background-color: #2563eb; color: #ffffff; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px;
                    font-family: sans-serif; font-size: 15px; font-weight: 800; display: inline-block;
                    letter-spacing: 0.3px;">
            VIEW MY REVIEW →
          </a>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, `Quarterly Review Submitted: ${data.quarter}`, `Quarterly Review — ${data.quarter}`);
};

export interface AppraisalQuarterSubmittedManagerParams {
  managerName: string;
  employeeName: string;
  quarter: string;
  submittedDate?: Date;
  portalUrl?: string;
}

export const getAppraisalQuarterSubmittedManagerTemplate = (
  data: AppraisalQuarterSubmittedManagerParams,
): string => {
  const portalUrl = data.portalUrl || process.env.FRONTEND_URL || 'https://worksphere.inventech-developer.in';
  const submitDateStr = (data.submittedDate || new Date()).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const content = `
    <!-- Notification Banner -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%); border: 1px solid #bfdbfe; border-radius: 14px; margin-bottom: 28px;">
      <tr>
        <td align="center" style="padding: 26px 24px;">
          <p style="font-family: sans-serif; font-size: 32px; margin: 0 0 8px 0;">📋</p>
          <p style="font-family: sans-serif; font-size: 22px; font-weight: 800; color: #1e40af; margin: 0 0 6px 0;">Review Ready for Evaluation</p>
          <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; margin: 0;">${data.employeeName} has submitted their Quarterly Appraisal Review.</p>
        </td>
      </tr>
    </table>

    <p style="font-family: sans-serif; font-size: 15px; color: #374151; line-height: 1.7; margin: 0 0 24px 0;">
      Hello <strong>${data.managerName}</strong>,<br>
      <strong>${data.employeeName}</strong> has completed and submitted their quarterly self-appraisal for <strong>${data.quarter}</strong>. Please log in to WorkSphere to review their submission and provide your performance evaluation and ratings.
    </p>

    <!-- Details Card -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 24px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 18px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">
                <span style="font-size: 16px; margin-right: 8px;">📑</span> Submission Details
              </td>
            </tr>
          </table>

          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Employee</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1f2937; vertical-align: top;">${data.employeeName}</td>
            </tr>
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Quarter</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1f2937; vertical-align: top;">
                <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 800;">${data.quarter}</span>
              </td>
            </tr>
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Status</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #ea580c; vertical-align: top;">
                <span style="background-color: #ffedd5; color: #ea580c; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 800;">Pending Manager Evaluation</span>
              </td>
            </tr>
            <tr>
              <td width="160" style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Submitted On</td>
              <td style="font-family: sans-serif; font-size: 14px; color: #1f2937; vertical-align: top;">${submitDateStr}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 32px 0 24px 0;">
      <tr>
        <td align="center">
          <a href="${portalUrl}"
             style="background-color: #2563eb; color: #ffffff; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px;
                    font-family: sans-serif; font-size: 15px; font-weight: 800; display: inline-block;
                    letter-spacing: 0.3px;">
            EVALUATE REVIEW →
          </a>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, `Review Submitted for Evaluation: ${data.employeeName} (${data.quarter})`, `Quarterly Review — ${data.quarter}`);
};

export interface AppraisalQuarterEvaluatedParams {
  employeeName: string;
  quarter: string;
  managerName: string;
  finalRating?: string | number;
  strengths?: string;
  improvements?: string;
  remarks?: string;
  portalUrl?: string;
}

export const getAppraisalQuarterEvaluatedTemplate = (
  data: AppraisalQuarterEvaluatedParams,
): string => {
  const portalUrl = data.portalUrl || process.env.FRONTEND_URL || 'https://worksphere.inventech-developer.in';
  const finalRating = data.finalRating != null ? String(data.finalRating) : 'N/A';

  const strengthsHtml = data.strengths && data.strengths !== 'N/A'
    ? `
    <tr>
      <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Strengths</td>
      <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; color: #334155; line-height: 1.5; vertical-align: top;">${data.strengths.replace(/\n/g, '<br>')}</td>
    </tr>` : '';

  const improvementsHtml = data.improvements && data.improvements !== 'N/A'
    ? `
    <tr>
      <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Areas to Improve</td>
      <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; color: #334155; line-height: 1.5; vertical-align: top;">${data.improvements.replace(/\n/g, '<br>')}</td>
    </tr>` : '';

  const remarksHtml = data.remarks && data.remarks !== 'N/A'
    ? `
    <tr>
      <td width="160" style="font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Manager Remarks</td>
      <td style="font-family: sans-serif; font-size: 14px; color: #334155; line-height: 1.5; vertical-align: top;">${data.remarks.replace(/\n/g, '<br>')}</td>
    </tr>` : '';

  const content = `
    <!-- Congratulations / Completion Banner -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%); border: 1px solid #bfdbfe; border-radius: 14px; margin-bottom: 28px;">
      <tr>
        <td align="center" style="padding: 26px 24px;">
          <p style="font-family: sans-serif; font-size: 32px; margin: 0 0 8px 0;">🌟</p>
          <p style="font-family: sans-serif; font-size: 22px; font-weight: 800; color: #1e40af; margin: 0 0 6px 0;">Evaluation Completed!</p>
          <p style="font-family: sans-serif; font-size: 14px; color: #4b5563; margin: 0;">Your manager has completed your Quarterly Review evaluation for ${data.quarter}.</p>
        </td>
      </tr>
    </table>

    <p style="font-family: sans-serif; font-size: 15px; color: #374151; line-height: 1.7; margin: 0 0 24px 0;">
      Dear <strong>${data.employeeName}</strong>,<br>
      Your manager, <strong>${data.managerName}</strong>, has finalized and submitted your performance evaluation for <strong>${data.quarter}</strong>.
    </p>

    <!-- Details Card -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 24px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 18px;">
            <tr>
              <td style="font-family: sans-serif; font-size: 13px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">
                <span style="font-size: 16px; margin-right: 8px;">📊</span> Evaluation Summary
              </td>
            </tr>
          </table>

          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Quarter</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; font-weight: 700; color: #1f2937; vertical-align: top;">
                <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 800;">${data.quarter}</span>
              </td>
            </tr>
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Final Rating</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 16px; font-weight: 800; color: #4f46e5; vertical-align: top;">
                <span style="background-color: #ede9fe; color: #4338ca; padding: 4px 14px; border-radius: 999px; font-size: 15px; font-weight: 800;">${finalRating}</span>
              </td>
            </tr>
            <tr>
              <td width="160" style="padding-bottom: 14px; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: top;">Evaluator</td>
              <td style="padding-bottom: 14px; font-family: sans-serif; font-size: 14px; color: #1f2937; vertical-align: top;">${data.managerName}</td>
            </tr>
            ${strengthsHtml}
            ${improvementsHtml}
            ${remarksHtml}
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 32px 0 24px 0;">
      <tr>
        <td align="center">
          <a href="${portalUrl}"
             style="background-color: #2563eb; color: #ffffff; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px;
                    font-family: sans-serif; font-size: 15px; font-weight: 800; display: inline-block;
                    letter-spacing: 0.3px;">
            VIEW FULL EVALUATION →
          </a>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, `Quarterly Review Evaluation Completed: ${data.quarter}`, `Quarterly Review — ${data.quarter}`);
};

