import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { QuaterlyEnum } from '../enums/quarterly_review.enums';

export const APPRAISAL_EDIT_WINDOW_HOURS = 48;
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
  title: `Quarterly review submitted (${context.quarter} ${context.financialYear})`,
  message: `${context.employeeName} submitted the ${context.quarter} review for ${context.financialYear}.`,
});

export const buildReviewCompletedNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'>,
): AppraisalNoticeContent => ({
  title: `Quarterly review completed (${context.quarter} ${context.financialYear})`,
  message: `Your ${context.quarter} ${context.financialYear} quarterly review is complete.`,
});

const NOTICE_DATE_LOCALE = 'en-GB';

export const formatAppraisalNoticeDate = (value: Date | string | null | undefined): string => {
  if (!value) {
    return 'not set';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'not set';
  }
  return date.toLocaleDateString(NOTICE_DATE_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatAppraisalNoticeDateTime = (value: Date | string | null | undefined): string => {
  if (!value) {
    return 'not set';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
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
  title: `Quarterly review still open (${context.quarter} ${context.financialYear})`,
  message: `Your ${context.quarter} ${context.financialYear} review is still not submitted. Please submit it before ${formatAppraisalNoticeDate(context.deadlineDate)}.`,
});

export const buildAssignmentNotice = (
  context: AppraisalNoticeContext & { deadlineDate: Date | string | null },
): AppraisalNoticeContent => ({
  title: `Quarterly review assigned (${context.quarter} ${context.financialYear})`,
  message: `A ${context.quarter} review for ${context.financialYear} has been assigned to you.\nPlease fill in all the details as stated and submit it before ${formatAppraisalNoticeDate(context.deadlineDate)}.`,
});

export const buildEmployeeSubmissionNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'>,
): AppraisalNoticeContent => ({
  title: `Quarterly review submitted (${context.quarter} ${context.financialYear})`,
  message: `Your ${context.quarter} ${context.financialYear} review has been submitted.`,
});

export const buildEditRequestNotice = (
  context: AppraisalNoticeContext,
): AppraisalNoticeContent => ({
  title: `Edit access requested (${context.quarter} ${context.financialYear})`,
  message: `${context.employeeName} requested edit access for the ${context.quarter} ${context.financialYear} review.`,
});

export const buildEditGrantedNotice = (
  context: Pick<AppraisalNoticeContext, 'quarter' | 'financialYear'> & {
    editAllowedUntil: Date | string | null;
  },
): AppraisalNoticeContent => ({
  title: `Edit access approved (${context.quarter} ${context.financialYear})`,
  message: `You can edit your ${context.quarter} ${context.financialYear} review until ${formatAppraisalNoticeDateTime(context.editAllowedUntil)}.`,
});
