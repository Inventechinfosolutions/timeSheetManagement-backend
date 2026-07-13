import { BadRequestException } from '@nestjs/common';

export const STANDARD_CHECKIN = { hour: 9, minute: 30 };
export const EARLY_ARRIVAL_CUTOFF = { hour: 11, minute: 0 };
export const CHECKOUT_LOCK_HOUR = 12;
export const CHECKOUT_LOCK_MINUTE = 0;
export const HALF_DAY_MAX_HOURS = 6;
export const DAY_HALF_SPLIT = { hour: 13, minute: 0 };

export type DayLeaveKind = 'none' | 'full' | 'first' | 'second';
export type DayHalf = 'first' | 'second';

/** Face checkout allowed until 12:00 PM on the working date (same day). */
export function isCheckoutEditable(workingDate: Date, now: Date = new Date()): boolean {
  const lockAt = new Date(workingDate);
  lockAt.setHours(CHECKOUT_LOCK_HOUR, CHECKOUT_LOCK_MINUTE, 0, 0);
  return now < lockAt;
}

/** Normalize DB TIME values (string | Date) into a Date for hour math. */
export function parseTimeValue(time: Date | string): Date {
  if (time instanceof Date) {
    return time;
  }
  if (typeof time === 'string') {
    const [hours = 0, minutes = 0, seconds = 0] = time.split(':').map(Number);
    const result = new Date(1970, 0, 1);
    result.setHours(hours, minutes, seconds, 0);
    return result;
  }
  throw new Error('Invalid time value');
}

export function toTimeOnly(date: Date): Date {
  const parsed = parseTimeValue(date);
  const result = new Date(1970, 0, 1);
  result.setHours(
    parsed.getHours(),
    parsed.getMinutes(),
    parsed.getSeconds(),
    0,
  );
  return result;
}

export function standardCheckInTime(workingDate: Date): Date {
  const d = new Date(workingDate);
  d.setHours(STANDARD_CHECKIN.hour, STANDARD_CHECKIN.minute, 0, 0);
  return toTimeOnly(d);
}

export function normalizeCheckInTime(actual: Date, workingDate: Date): Date {
  const cutoff = new Date(workingDate);
  cutoff.setHours(
    EARLY_ARRIVAL_CUTOFF.hour,
    EARLY_ARRIVAL_CUTOFF.minute,
    0,
    0,
  );

  const actualOnDate = new Date(workingDate);
  actualOnDate.setHours(
    actual.getHours(),
    actual.getMinutes(),
    actual.getSeconds(),
    0,
  );

  if (actualOnDate < cutoff) {
    return standardCheckInTime(workingDate);
  }

  return toTimeOnly(actualOnDate);
}

export function computeCheckoutFromHours(hours: number, workingDate: Date): Date {
  const checkIn = new Date(workingDate);
  checkIn.setHours(STANDARD_CHECKIN.hour, STANDARD_CHECKIN.minute, 0, 0);
  const checkout = new Date(checkIn.getTime() + hours * 60 * 60 * 1000);
  return toTimeOnly(checkout);
}

export function combineDateAndTime(
  workingDate: Date,
  time: Date | string,
): Date {
  const parsed = parseTimeValue(time);
  const result = new Date(workingDate);
  result.setHours(
    parsed.getHours(),
    parsed.getMinutes(),
    parsed.getSeconds(),
    0,
  );
  return result;
}

export function computeTotalHoursFromTimes(
  checkIn: Date | string,
  checkOut: Date | string,
  workingDate: Date,
): number {
  const start = combineDateAndTime(workingDate, checkIn);
  const end = combineDateAndTime(workingDate, checkOut);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

export function assertCheckoutAfterCheckIn(
  checkIn: Date | string,
  checkOut: Date | string,
  workingDate: Date,
): void {
  const start = combineDateAndTime(workingDate, checkIn);
  const end = combineDateAndTime(workingDate, checkOut);
  if (end.getTime() <= start.getTime()) {
    throw new BadRequestException(
      'Check-out time must be after check-in time.',
    );
  }
}

export function isLeaveHalf(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v.includes('leave') || v === 'on leave';
}

export function classifyDayLeave(
  firstHalf: string | null | undefined,
  secondHalf: string | null | undefined,
): DayLeaveKind {
  const firstLeave = isLeaveHalf(firstHalf);
  const secondLeave = isLeaveHalf(secondHalf);
  if (firstLeave && secondLeave) return 'full';
  if (firstLeave) return 'first';
  if (secondLeave) return 'second';
  return 'none';
}

export function whichHalf(time: Date | string, workingDate: Date): DayHalf {
  const actual = combineDateAndTime(workingDate, time);
  const split = new Date(workingDate);
  split.setHours(DAY_HALF_SPLIT.hour, DAY_HALF_SPLIT.minute, 0, 0);
  return actual < split ? 'first' : 'second';
}

export function halfDaySplitTime(workingDate: Date): Date {
  const d = new Date(workingDate);
  d.setHours(DAY_HALF_SPLIT.hour, DAY_HALF_SPLIT.minute, 0, 0);
  return toTimeOnly(d);
}

/**
 * Validates Request Change times against leave halves.
 * - full leave: blocked
 * - half leave: span <= HALF_DAY_MAX_HOURS and times in worked half
 * - no leave: checkout after check-in only
 */
export function assertCorrectionTimesAllowed(
  leaveKind: DayLeaveKind,
  checkIn: Date | string,
  checkOut: Date | string,
  workingDate: Date,
): void {
  assertCheckoutAfterCheckIn(checkIn, checkOut, workingDate);

  if (leaveKind === 'full') {
    throw new BadRequestException(
      'Request Change is not allowed for full-day leave.',
    );
  }

  if (leaveKind === 'none') {
    return;
  }

  const hours = computeTotalHoursFromTimes(checkIn, checkOut, workingDate);
  if (hours > HALF_DAY_MAX_HOURS) {
    throw new BadRequestException(
      `Request Change on a half-leave day cannot exceed ${HALF_DAY_MAX_HOURS} hours.`,
    );
  }

  const split = combineDateAndTime(workingDate, halfDaySplitTime(workingDate));
  const start = combineDateAndTime(workingDate, checkIn);
  const end = combineDateAndTime(workingDate, checkOut);

  if (leaveKind === 'first') {
    // Worked half is second — check-in must be at/after 13:00
    if (start < split) {
      throw new BadRequestException(
        'First-half leave is protected. Check-in must be at or after 1:00 PM.',
      );
    }
  }

  if (leaveKind === 'second') {
    // Worked half is first — checkout must be at/before 13:00
    if (end > split) {
      throw new BadRequestException(
        'Second-half leave is protected. Check-out must be at or before 1:00 PM.',
      );
    }
  }
}
