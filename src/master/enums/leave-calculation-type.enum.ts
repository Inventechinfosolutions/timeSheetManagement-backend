/** How a department's leave usage is calculated. */
export enum LeaveCalculationType {
  /** From leave requests / attendance recorded in the system. */
  AUTO = 'AUTO',
  /** Admin enters each employee's total leaves taken; system usage after that date is added on top. */
  MANUAL = 'MANUAL',
}
