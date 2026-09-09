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
