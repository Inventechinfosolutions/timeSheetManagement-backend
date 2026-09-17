export enum ReviewStatus {
  INITIAL = 'INITIAL',
  DRAFT = 'DRAFT',
  ASSIGNED = 'Assigned',
  AWAITING_REVIEW = 'Awaiting Review',
  UNDER_REVIEW = 'Under Review',
  REVIEWED = 'Reviewed',
  // Pre-submission review aliases
  Initial = 'Initial',
  Draft = 'Draft',
  SUBMITTED = 'Submitted',
  SUBMITTED_ALIAS = 'SUBMITTED',
  AUTO_SUBMITTED = 'Auto Submitted',
  AUTO_SUBMITTED_ALIAS = 'AUTO_SUBMITTED',
  NOT_STARTED = 'Assigned',
  IN_REVIEW = 'Under Review',
  COMPLETED = 'Reviewed',
  APPROVED = 'Reviewed',
}

export enum AppraisalReviewStatus {
  ASSIGNED = 'Assigned',
  AWAITING_REVIEW = 'Awaiting Review',
  UNDER_REVIEW = 'Under Review',
  REVIEWED = 'Reviewed',
}

export enum AssignmentStatus {
  ASSIGNED = 'ASSIGNED',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REVIEWED = 'REVIEWED',
  // Legacy aliases mapped to canonical values
  IN_PROGRESS = 'ASSIGNED',
  DRAFT = 'ASSIGNED',
  SUBMITTED = 'AWAITING_REVIEW',
  AUTO_SUBMITTED = 'AWAITING_REVIEW',
  COMPLETED = 'REVIEWED',
}

/** Filter values accepted by the manager submissions endpoint via ?status= */
export enum DisplayStatusFilter {
  ALL = 'ALL',
  ASSIGNED = 'ASSIGNED',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REVIEWED = 'REVIEWED',
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

