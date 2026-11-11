/** Who approves a department manager's own requests. */
export enum LeaveApprovalType {
  /** The manager can approve his own requests; the General Manager can also review them. */
  AUTO = 'AUTO',
  /** Only the General Manager reviews manager requests. */
  MANUAL = 'MANUAL',
}
