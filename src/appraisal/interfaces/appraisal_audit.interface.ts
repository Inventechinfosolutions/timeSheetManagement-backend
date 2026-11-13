export interface AppraisalAuditEntry {
  employeeId: string;             // Employee ID (e.g. 'EMP001')
  managerId: string | null;       // Manager ID (e.g. 'MGR005')
  quarter: string;                // 'Q1' | 'Q2' | 'Q3' | 'Q4'
  financialYear: string;          // Financial Year (e.g. '2025-2026')
  createdBy: string;              // Creator ID (e.g. 'ADMIN' / 'MGR005')
  createdDate: string;            // Initial assignment date ('YYYY-MM-DD' or ISO)
  assignedDate?: string | null;   // Assigned start date ('YYYY-MM-DD' or ISO)
  deadlineDate: string | null;    // Due deadline date ('YYYY-MM-DD' or ISO)
  submittedDate?: string | null;  // Submission date (ISO timestamp)
  submittedBy?: string | null;    // Who performed submission
  status: string;                 // Lifecycle status at this event
  lastUpdatedDate: string;        // Exact ISO timestamp of this audit event
  lastModifiedBy: string;         // User/Actor who performed this action
  details?: string | null;        // Human-readable remarks / reason / score
}
