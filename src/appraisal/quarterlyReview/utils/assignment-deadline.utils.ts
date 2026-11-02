/** India Standard Time offset used for assignment FROM / TO windows. */
const IST_OFFSET = '+05:30';

export type DeadlineReminderKind = '2d' | '1d' | 'today';

export interface DeadlineReminderFlags {
  reminder2dSentAt: Date | null;
  reminder1dSentAt: Date | null;
  reminderTodaySentAt: Date | null;
}

/** Normalize a date-only or datetime value to YYYY-MM-DD in IST (+05:30). */
export function toDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Invalid date value: ${value}`);
    }
    const istDate = new Date(value.getTime() + (5 * 60 + 30) * 60 * 1000);
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return toDateOnly(parsed);
}

/** Start of the manager's FROM date in IST. */
export function toStartOfDayIst(value: string | Date): Date {
  return new Date(`${toDateOnly(value)}T00:00:00.000${IST_OFFSET}`);
}

/**
 * End of the manager's TO (deadline) date in IST.
 * A date-only value such as 2026-09-17 stays editable until 23:59:59 IST that day.
 */
export function toEndOfDayIst(value: string | Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = value.getHours();
    const minutes = value.getMinutes();
    const seconds = value.getSeconds();
    if (hours !== 0 || minutes !== 0 || seconds !== 0) {
      return value;
    }
  }
  return new Date(`${toDateOnly(value)}T23:59:59.999${IST_OFFSET}`);
}

export function computeAssignmentDeadline(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  now = new Date(),
): {
  assignedAt: Date;
  deadlineAt: Date;
  totalHours: number;
  days: number;
} {
  const todayStr = toDateOnly(now);
  const startStr = startDate ? toDateOnly(startDate) : todayStr;
  const endStr = endDate ? toDateOnly(endDate) : startStr;

  const startMidnight = new Date(`${startStr}T00:00:00.000${IST_OFFSET}`);
  const endMidnight = new Date(`${endStr}T00:00:00.000${IST_OFFSET}`);

  const diffDays = Math.round((endMidnight.getTime() - startMidnight.getTime()) / (24 * 60 * 60 * 1000));
  const days = Math.max(1, diffDays);
  const totalHours = days * 24;

  let assignedAt: Date;
  if (startStr <= todayStr) {
    // Starting today or in the past: window starts NOW so full 24h per day is given
    assignedAt = now;
  } else {
    // Starting in the future: window starts at 00:00:00 IST of startDate
    assignedAt = startMidnight;
  }

  const deadlineAt = new Date(assignedAt.getTime() + totalHours * 60 * 60 * 1000);

  return {
    assignedAt,
    deadlineAt,
    totalHours,
    days,
  };
}

export function assertAssignmentDateRange(startDate: string, endDate: string): void {
  const startStr = toDateOnly(startDate);
  const endStr = toDateOnly(endDate);

  if (endStr < startStr) {
    throw new Error('End date (deadline) cannot be earlier than the start date.');
  }

  if (endStr === startStr) {
    throw new Error('Please provide at least 24 hours of time. From Date and To Date cannot be the same.');
  }
}

export function isBeforeAssignmentWindow(startDate: string | Date | null | undefined, now = new Date()): boolean {
  if (!startDate) return false;
  return now.getTime() < toStartOfDayIst(startDate).getTime();
}

export function isAfterAssignmentDeadline(deadlineAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!deadlineAt) return false;
  return now.getTime() > new Date(deadlineAt).getTime();
}

/**
 * Pick the single most relevant approaching reminder that has not been sent yet.
 * Windows: 48–72h → 2d, 24–48h → 1d, 0–24h → today.
 */
export function resolveApproachingReminder(
  deadlineAt: Date,
  flags: DeadlineReminderFlags,
  now = new Date(),
): DeadlineReminderKind | null {
  const msLeft = new Date(deadlineAt).getTime() - now.getTime();
  if (msLeft <= 0) return null;

  const hoursLeft = msLeft / (1000 * 60 * 60);

  if (hoursLeft <= 24 && !flags.reminderTodaySentAt) {
    return 'today';
  }
  if (hoursLeft <= 48 && hoursLeft > 24 && !flags.reminder1dSentAt) {
    return '1d';
  }
  if (hoursLeft <= 72 && hoursLeft > 48 && !flags.reminder2dSentAt) {
    return '2d';
  }
  return null;
}

export function reminderCopy(kind: DeadlineReminderKind): {
  titleSuffix: string;
  urgencyLabel: string;
  remainingLabel: string;
} {
  if (kind === 'today') {
    return {
      titleSuffix: 'Deadline Completing Today',
      urgencyLabel: 'today',
      remainingLabel: 'today',
    };
  }
  if (kind === '1d') {
    return {
      titleSuffix: 'Deadline Completing in 1 Day',
      urgencyLabel: 'in 1 day',
      remainingLabel: '1 day',
    };
  }
  return {
    titleSuffix: 'Deadline Completing in 2 Days',
    urgencyLabel: 'in 2 days',
    remainingLabel: '2 days',
  };
}
