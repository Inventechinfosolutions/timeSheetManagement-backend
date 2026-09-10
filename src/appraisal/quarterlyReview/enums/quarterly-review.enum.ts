export enum ReviewStatus {
  DRAFT = 'Draft',
  SUBMITTED = 'Submitted',
  IN_REVIEW = 'In Review',
  REVIEWED = 'Reviewed',
  APPROVED = 'Approved',
  COMPLETED = 'Completed',
  NOT_STARTED = 'Not Started',
  AUTO_SUBMITTED = 'Auto Submitted',
}

/** Filter values accepted by the manager submissions endpoint via ?status= */
export enum DisplayStatusFilter {
  ALL = 'ALL',
  ASSIGNED = 'ASSIGNED',
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  COMPLETED = 'COMPLETED',
}

/**
 * Determines whether the manager created the assignment for an individual
 * employee or broadcast it to all mapped team members at once.
 */
export enum AssignmentMode {
  INDIVIDUAL = 'INDIVIDUAL',
  ALL = 'ALL',
}

/**
 * Canonical quarter labels used as a strict enum for DTO validation.
 * At runtime the value is combined with the financial year, e.g. "Q2 FY2026-27".
 */
export enum QuarterLabel {
  Q1 = 'Q1',
  Q2 = 'Q2',
  Q3 = 'Q3',
  Q4 = 'Q4',
}
