import { QuarterlyReviewStatus } from '../enums/quarterly_review.enums';

const UNSUBMITTED_STATUSES: readonly string[] = [
  QuarterlyReviewStatus.NOT_STARTED,
  QuarterlyReviewStatus.DRAFT,
  QuarterlyReviewStatus.ASSIGNED,
  QuarterlyReviewStatus.PENDING,
  QuarterlyReviewStatus.IN_PROGRESS,
  QuarterlyReviewStatus.ALLOWED_TO_EDIT,
  QuarterlyReviewStatus.APPROVED_FOR_EDITING,
];

const FINISHED_STATUSES: readonly string[] = [
  QuarterlyReviewStatus.COMPLETED,
  QuarterlyReviewStatus.REVIEWED,
  QuarterlyReviewStatus.APPROVED,
];

export const dateOnlyValue = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (match) {
      return match[1];
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const deadlineHasArrived = (deadline: Date | string | null | undefined, now = new Date()): boolean => {
  const deadlineDay = dateOnlyValue(deadline);
  const today = dateOnlyValue(now);
  if (!deadlineDay || !today) {
    return false;
  }
  return deadlineDay <= today;
};

export const isUnsubmittedStatus = (status: string | null | undefined): boolean =>
  UNSUBMITTED_STATUSES.includes(String(status || ''));

export const isLockedReviewStatus = (status: string | null | undefined): boolean => {
  const value = String(status || '');
  return value === QuarterlyReviewStatus.LOCKED || value === QuarterlyReviewStatus.NOT_UPDATED;
};

export const shouldCloseRenewedAccess = (
  reassignCount: number,
  deadline: Date | string | null | undefined,
  status: string | null | undefined,
  now = new Date(),
): boolean =>
  reassignCount >= 1 &&
  deadlineHasArrived(deadline, now) &&
  isUnsubmittedStatus(status) &&
  !FINISHED_STATUSES.includes(String(status || ''));

export interface ReviewAccessFlags {
  canEdit: boolean;
  canRequestEdit: boolean;
  remainingRequestHours: number;
  isEditWindowActive: boolean;
  accessClosed: boolean;
}

export const reviewAccessFlags = (input: {
  status: string | null | undefined;
  deadlineDate: Date | string | null | undefined;
  submittedAt: Date | string | null | undefined;
  editAllowedUntil: Date | string | null | undefined;
  reassignCount: number;
  requestWindowMs: number;
  lockedAt?: Date | string | null;
  now?: Date;
}): ReviewAccessFlags => {
  const now = input.now || new Date();
  const status = String(input.status || '');
  const closed: ReviewAccessFlags = {
    canEdit: false,
    canRequestEdit: false,
    remainingRequestHours: 0,
    isEditWindowActive: false,
    accessClosed: false,
  };

  if (isLockedReviewStatus(status)) {
    if (input.reassignCount >= 1) {
      return { ...closed, accessClosed: true };
    }
    // First lock: 42h runs from the deadline day, not the last row update.
    return requestWindowFlags(
      deadlineDayStart(input.deadlineDate) || input.lockedAt,
      input.requestWindowMs,
      now,
      closed,
    );
  }

  if (FINISHED_STATUSES.includes(status)) {
    return closed;
  }

  if (status === QuarterlyReviewStatus.REQUESTED_FOR_EDIT) {
    return closed;
  }

  if (
    status === QuarterlyReviewStatus.SUBMITTED ||
    status === QuarterlyReviewStatus.RE_SUBMITTED ||
    status === QuarterlyReviewStatus.PERFORMANCE_RECEIVED ||
    status === QuarterlyReviewStatus.UNDER_REVIEW
  ) {
    if (!input.submittedAt) {
      return closed;
    }
    const diffMs = now.getTime() - new Date(input.submittedAt).getTime();
    const canRequestEdit = diffMs <= input.requestWindowMs;
    return {
      ...closed,
      canRequestEdit,
      remainingRequestHours: canRequestEdit
        ? Math.max(1, Math.round((input.requestWindowMs - diffMs) / (3600 * 1000)))
        : 0,
    };
  }

  if (status === QuarterlyReviewStatus.EDIT_GRANTED && input.editAllowedUntil) {
    const open = now.getTime() <= new Date(input.editAllowedUntil).getTime();
    return {
      ...closed,
      canEdit: open,
      isEditWindowActive: open,
    };
  }

  if (!isUnsubmittedStatus(status)) {
    return closed;
  }

  if (!deadlineHasArrived(input.deadlineDate, now)) {
    return { ...closed, canEdit: true };
  }

  if (input.reassignCount >= 1) {
    return { ...closed, accessClosed: true };
  }

  return requestWindowFlags(
    deadlineDayStart(input.deadlineDate) || input.lockedAt,
    input.requestWindowMs,
    now,
    closed,
  );
};

const deadlineDayStart = (deadline: Date | string | null | undefined): Date | null => {
  const day = dateOnlyValue(deadline);
  if (!day) {
    return null;
  }
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 0, 0, 0, 0);
};

const requestWindowFlags = (
  windowStart: Date | string | null | undefined,
  requestWindowMs: number,
  now: Date,
  closed: ReviewAccessFlags,
): ReviewAccessFlags => {
  if (!windowStart) {
    return closed;
  }
  const startedAt = new Date(windowStart).getTime();
  if (Number.isNaN(startedAt)) {
    return closed;
  }
  const elapsed = now.getTime() - startedAt;
  const stillOpen = elapsed <= requestWindowMs;
  if (!stillOpen) {
    return closed;
  }
  return {
    ...closed,
    canRequestEdit: true,
    remainingRequestHours: Math.max(1, Math.round((requestWindowMs - elapsed) / (3600 * 1000))),
  };
};
