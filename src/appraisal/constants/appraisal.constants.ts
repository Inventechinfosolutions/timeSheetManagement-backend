import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { QuaterlyEnum } from '../enums/quarterly_review.enums';

export const APPRAISAL_EDIT_WINDOW_HOURS = 42;
export const EDIT_REQUEST_DEFAULT_REASON = 'Edit requested after submission';
export const PASSWORD_MISMATCH_MESSAGE = 'Wrong password.';
export const ANNUAL_SUMMARY_EMPTY_MESSAGE =
  'No annual rating is stored for this financial year yet.';
export const RATING_NOT_READY_MESSAGE = 'This review does not have a final rating yet.';
export const EMPLOYEE_NOT_FOUND_MESSAGE = 'That employee was not found.';
export const QUARTER_WINDOW_UNAVAILABLE_MESSAGE =
  'No quarter has started yet, so this review cannot be assigned.';
export const DEADLINE_AFTER_ASSIGNED_MESSAGE = 'Deadline must be after the assigned date.';

export const quarterNotAssignableMessage = (quarterLabel: string): string =>
  `${quarterLabel} has not started, so this review cannot be assigned yet.`;

export const duplicateAssignmentMessage = (
  employeeId: string,
  quarter: string,
  financialYear: string,
): string =>
  `${employeeId} already has a review for ${quarter} ${financialYear}. A different quarter or a different year can still be assigned.`;
export const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export const appraisalWindowMs = (hours: number): number =>
  hours * MILLISECONDS_PER_HOUR;

export const LOCKED_PERFORMANCE_STATUSES: readonly EmployeePerformanceStatus[] = [
  EmployeePerformanceStatus.SUBMITTED,
  EmployeePerformanceStatus.RE_SUBMITTED,
  EmployeePerformanceStatus.REQUESTED_FOR_EDIT,
  EmployeePerformanceStatus.COMPLETED,
  EmployeePerformanceStatus.NOT_UPDATED,
  EmployeePerformanceStatus.LOCKED,
  EmployeePerformanceStatus.REVIEWED,
  EmployeePerformanceStatus.PERFORMANCE_RECEIVED,
];

export const SUBMITTABLE_PERFORMANCE_STATUSES: readonly EmployeePerformanceStatus[] = [
  EmployeePerformanceStatus.NOT_STARTED,
  EmployeePerformanceStatus.DRAFT,
  EmployeePerformanceStatus.PENDING,
  EmployeePerformanceStatus.IN_PROGRESS,
  EmployeePerformanceStatus.EDIT_GRANTED,
  EmployeePerformanceStatus.APPROVED_FOR_EDITING,
  EmployeePerformanceStatus.ALLOWED_TO_EDIT,
  EmployeePerformanceStatus.DEADLINE_REMINDER,
  EmployeePerformanceStatus.ONE_DAY_DEADLINE_REMINDER,
];

export const DRAFT_ON_SAVE_STATUSES: readonly EmployeePerformanceStatus[] = [
  EmployeePerformanceStatus.NOT_STARTED,
  EmployeePerformanceStatus.PENDING,
  EmployeePerformanceStatus.IN_PROGRESS,
];

export interface AppraisalNoticeContent {
  title: string;
  message: string;
}

export interface AppraisalNoticeContext {
  employeeName: string;
  quarter: QuaterlyEnum;
  financialYear: string;
}

export const buildSubmissionNotice = (
  context: AppraisalNoticeContext,
): AppraisalNoticeContent => ({
  title: `Appraisal submitted (${context.quarter} ${context.financialYear})`,
  message: `${context.employeeName} submitted the appraisal for ${context.quarter} ${context.financialYear}.`,
});

export const buildReviewCompletedNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'>,
): AppraisalNoticeContent => ({
  title: `Appraisal review completed (${context.quarter} ${context.financialYear})`,
  message: `Your ${context.quarter} ${context.financialYear} appraisal review is complete. You can log in and view your ratings and feedback.`,
});

const NOTICE_DATE_LOCALE = 'en-GB';

const parseNoticeDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(trimmed);
    if (dmy) {
      const d = new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}`);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const formatAppraisalNoticeDate = (value: Date | string | null | undefined): string => {
  const date = parseNoticeDate(value);
  if (!date) {
    return 'not set';
  }
  return date.toLocaleDateString(NOTICE_DATE_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatAppraisalNoticeDateTime = (value: Date | string | null | undefined): string => {
  const date = parseNoticeDate(value);
  if (!date) {
    return 'not set';
  }
  return date.toLocaleString(NOTICE_DATE_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const buildDeadlineReminderNotice = (
  context: AppraisalNoticeContext & { deadlineDate: Date | string | null },
): AppraisalNoticeContent => ({
  title: `Appraisal deadline reminder (${context.quarter} ${context.financialYear})`,
  message: `Your ${context.quarter} ${context.financialYear} appraisal is still not submitted. Please submit it before ${formatAppraisalNoticeDate(context.deadlineDate)}.`,
});

export const buildOneDayDeadlineReminderNotice = (
  context: AppraisalNoticeContext & { deadlineDate: Date | string | null },
): AppraisalNoticeContent => ({
  title: `Appraisal deadline reminder (1 day left) (${context.quarter} ${context.financialYear})`,
  message: `Only 1 day left! Your ${context.quarter} ${context.financialYear} appraisal is due tomorrow (${formatAppraisalNoticeDate(context.deadlineDate)}).\nPlease submit it before the deadline to avoid access being locked.`,
});

export const buildAssignmentNotice = (
  context: AppraisalNoticeContext & { deadlineDate: Date | string | null },
): AppraisalNoticeContent => ({
  title: `Appraisal assigned (${context.quarter} ${context.financialYear})`,
  message: `A ${context.quarter} appraisal for ${context.financialYear} has been assigned to you.\nPlease fill in all the details and submit it before ${formatAppraisalNoticeDate(context.deadlineDate)}.`,
});

export const buildReassignmentNotice = (
  context: AppraisalNoticeContext & { deadlineDate: Date | string | null },
): AppraisalNoticeContent => ({
  title: `Appraisal re-assigned (${context.quarter} ${context.financialYear})`,
  message: `Your ${context.quarter} appraisal for ${context.financialYear} has been re-assigned with a new deadline: ${formatAppraisalNoticeDate(context.deadlineDate)}.\nPlease update and submit your appraisal before the deadline.`,
});

export const buildEmployeeSubmissionNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'>,
): AppraisalNoticeContent => ({
  title: `Appraisal submitted (${context.quarter} ${context.financialYear})`,
  message: `Your ${context.quarter} ${context.financialYear} appraisal has been submitted successfully.`,
});

export const buildEditRequestNotice = (
  context: AppraisalNoticeContext,
): AppraisalNoticeContent => ({
  title: `Appraisal edit access requested (${context.quarter} ${context.financialYear})`,
  message: `${context.employeeName} requested edit access for the ${context.quarter} ${context.financialYear} appraisal.`,
});

export const buildEmployeeEditRequestSentNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'>,
): AppraisalNoticeContent => ({
  title: `Appraisal edit request sent (${context.quarter} ${context.financialYear})`,
  message: `Your request for edit access to the ${context.quarter} ${context.financialYear} appraisal has been submitted to your manager.`,
});

export const buildEditGrantedNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'> & {
    editAllowedUntil: Date | string | null;
  },
): AppraisalNoticeContent => ({
  title: `Appraisal edit access approved (${context.quarter} ${context.financialYear})`,
  message: `You can edit your ${context.quarter} ${context.financialYear} appraisal until ${formatAppraisalNoticeDateTime(context.editAllowedUntil)}.`,
});

export const buildEditRejectedNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'> & {
    reason?: string | null;
  },
): AppraisalNoticeContent => ({
  title: `Appraisal edit request rejected (${context.quarter} ${context.financialYear})`,
  message: context.reason?.trim()
    ? `Your request for edit access to the ${context.quarter} ${context.financialYear} appraisal was rejected by your manager.\nReason: ${context.reason.trim()}`
    : `Your request for edit access to the ${context.quarter} ${context.financialYear} appraisal was rejected by your manager.`,
});
