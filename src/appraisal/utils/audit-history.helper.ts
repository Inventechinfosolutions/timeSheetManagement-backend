import { AppraisalAuditEntry } from '../interfaces/appraisal_audit.interface';

/**
 * Appends a new audit record to an existing history array.
 * Safely handles null, undefined, or string-parsed JSON arrays.
 */
export function appendAuditEntry(
  existingHistory: AppraisalAuditEntry[] | string | null | undefined,
  entry: AppraisalAuditEntry,
): AppraisalAuditEntry[] {
  let list: AppraisalAuditEntry[] = [];

  if (Array.isArray(existingHistory)) {
    list = [...existingHistory];
  } else if (typeof existingHistory === 'string') {
    try {
      const parsed = JSON.parse(existingHistory);
      if (Array.isArray(parsed)) {
        list = [...parsed];
      }
    } catch {
      list = [];
    }
  }

  list.push(entry);
  return list;
}

/**
 * Helper to construct an AppraisalAuditEntry with defaults for dates and timestamps.
 */
export function createAuditEntry(
  base: {
    employeeId: string;
    managerId?: string | null;
    quarter: string;
    financialYear: string;
    createdBy?: string | null;
    createdDate?: string | Date | null;
    assignedDate?: string | Date | null;
    deadlineDate?: string | Date | null;
    submittedDate?: string | Date | null;
    submittedBy?: string | null;
    status: string;
    lastModifiedBy: string;
    details?: string | null;
  },
): AppraisalAuditEntry {
  const toDateString = (d?: string | Date | null): string | null => {
    if (!d) return null;
    if (d instanceof Date) {
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const str = String(d).trim();
    return str.length >= 10 ? str.slice(0, 10) : str;
  };

  const toIsoString = (d?: string | Date | null): string | null => {
    if (!d) return null;
    if (d instanceof Date) {
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const str = String(d).trim();
    return str ? new Date(str).toISOString() : null;
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return {
    employeeId: base.employeeId,
    managerId: base.managerId || null,
    quarter: base.quarter,
    financialYear: base.financialYear,
    createdBy: base.createdBy || 'ADMIN',
    createdDate: toDateString(base.createdDate) || todayStr,
    assignedDate: toDateString(base.assignedDate) || todayStr,
    deadlineDate: toDateString(base.deadlineDate),
    submittedDate: toIsoString(base.submittedDate),
    submittedBy: base.submittedBy || null,
    status: base.status,
    lastUpdatedDate: new Date().toISOString(),
    lastModifiedBy: base.lastModifiedBy || 'SYSTEM',
    details: base.details || null,
  };
}
