import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { QuarterlyReview } from '../../quarterlyReview/entities/quarterly-review.entity';
import { QuarterlyReviewAccessRequest, AccessRequestStatus } from '../../quarterlyReview/entities/quarterly-review-access-request.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../../managerMapping/entities/managerMapping.entity';
import { EmployeeDetails } from '../../../employeeTimeSheet/entities/employeeDetails.entity';
import { User } from '../../../users/entities/user.entity';
import { UserType } from '../../../users/enums/user-type.enum';
import { ManagerEvaluationDto } from '../dto/manager-evaluation.dto';
import { ReviewStatus, AssignmentMode, AppraisalReviewStatus } from '../../quarterlyReview/enums/quarterly-review.enum';
import { EmailService } from '../../../email/email.service';
import { NotificationsService } from '../../../notifications/Services/notifications.service';
import {
  getAppraisalQuarterEvaluatedTemplate,
  getAppraisalQuarterAssignedTemplate,
  getAppraisalQuarterAssignedManagerTemplate,
} from '../../../common/mail/templates';
import { CreateReviewAssignmentDto } from '../dto/create-review-assignment.dto';

import { ReviewAssignment } from '../../quarterlyReview/entities/review-assignment.entity';
import { AssignmentStatus } from '../../quarterlyReview/enums/quarterly-review.enum';

import { isRevealTokenValid } from '../../quarterlyReview/utils/rating-reveal.utils';
import { assertAssignmentDateRange, toStartOfDayIst, toEndOfDayIst, computeAssignmentDeadline } from '../../quarterlyReview/utils/assignment-deadline.utils';
import { getDynamicCurrentFinancialYear } from '../../../master/service/master-financial-year.service';
import { runQuarterlyReviewSchemaMigration } from '../../quarterlyReview/utils/quarterly-review-schema.migration';

/** Filters + pagination params accepted by getTeamSubmissions */
export interface TeamSubmissionsFilters {
  quarter?: string;
  status?: string;
  quarterCard?: string;
  year?: string;
  search?: string;
  role?: string;
  employeeId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class ManagerQuarterlyReviewService implements OnModuleInit {
  private readonly logger = new Logger(ManagerQuarterlyReviewService.name);

  constructor(
    @InjectRepository(QuarterlyReview)
    private readonly quarterlyReviewRepository: Repository<QuarterlyReview>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentRepository: Repository<ReviewAssignment>,
    @InjectRepository(QuarterlyReviewAccessRequest)
    private readonly accessRequestRepository: Repository<QuarterlyReviewAccessRequest>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async onModuleInit() {
    await runQuarterlyReviewSchemaMigration(
      this.quarterlyReviewRepository.manager.connection,
    );
  }


  /** Check if the user has privileged access (Admin or CEO). */
  private isPrivilegedUser(user: any): boolean {
    const userRole = (user?.userType || user?.role || '')?.toString().toUpperCase();
    return userRole === 'ADMIN' || userRole === 'CEO' || user?.userType === UserType.ADMIN || user?.userType === UserType.CEO;
  }

  /** Get list of employee IDs mapped to the manager */
  private async getMappedEmployeeIds(managerUser: any): Promise<{ employeeIds: string[]; managerNames: string[] }> {
    const managerLoginId = managerUser?.loginId || '';
    const managerFullName = managerUser?.aliasLoginName || managerUser?.fullName || managerUser?.name || managerLoginId;

    this.logger.log(
      `[getMappedEmployeeIds] manager loginId='${managerLoginId}', fullName='${managerFullName}'`,
    );

    try {
      const mappings = await this.managerMappingRepository.find({
        where: [
          { managerName: managerFullName, status: ManagerMappingStatus.ACTIVE },
          { managerName: managerLoginId, status: ManagerMappingStatus.ACTIVE },
          { managerId: managerLoginId, status: ManagerMappingStatus.ACTIVE },
        ],
      });

      // De-duplicate and exclude the manager's own loginId from the employee list.
      const employeeIds = Array.from(
        new Set(
          mappings
            .map((mappingItem) => mappingItem.employeeId)
            .filter((id) => Boolean(id) && id !== managerLoginId),
        ),
      );

      const managerNames = Array.from(
        new Set(
          [managerFullName, managerLoginId, ...mappings.map((mappingItem) => mappingItem.managerName)].filter(Boolean),
        ),
      );

      this.logger.log(
        `[getMappedEmployeeIds] Found ${mappings.length} mapping row(s), ${employeeIds.length} unique employee(s): [${employeeIds.join(', ')}]`,
      );

      return { employeeIds, managerNames };
    } catch (error: any) {
      this.logger.error(`[getMappedEmployeeIds] Error: ${error.message}`, error.stack);
      return { employeeIds: [], managerNames: [managerFullName, managerLoginId].filter(Boolean) };
    }
  }

  /** Helper to parse JSON fields safely */
  private parseJsonIfNeeded(val: any): any {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }

  /** Normalize quarter string to uppercase with no spaces/hyphens for comparison (e.g. "Q1FY202627") */
  private normalizeQ(q: string | null | undefined): string {
    return (q || '').toUpperCase().replace(/[\s_-]/g, '');
  }

  /** Format a quarter string to canonical hyphen format, e.g. "Q1 FY2026-27" -> "Q1-FY2026-27" */
  public formatQuarterHyphen(quarter: string | null | undefined): string {
    if (!quarter) return '';
    const trimmed = String(quarter).trim();
    return trimmed.replace(/^([Qq][1-4])[\s_]+(FY\d{4}-\d{2})/i, '$1-$2');
  }

  /** Return common variants of a quarter string for database querying (both hyphen, space, and code formats) */
  public normalizeQuarterVariants(quarter: string | null | undefined): string[] {
    if (!quarter) return [];
    const q = String(quarter).trim();
    const hyphen = this.formatQuarterHyphen(q);
    const space = q.replace(/^([Qq][1-4])[\s_-]+(FY\d{4}-\d{2})/i, '$1 $2');
    const spaceWithFy = q.replace(/^([Qq][1-4])[\s_-]+FY\s*(\d{4}-\d{2})/i, '$1 FY $2');
    const qMatch = q.match(/Q[1-4]/i)?.[0]?.toUpperCase();
    const fyMatch = q.match(/(\d{4}-\d{2})/i)?.[1];
    const variants = [q, hyphen, space, spaceWithFy];
    if (qMatch) {
      variants.push(qMatch);
      if (fyMatch) {
        variants.push(`${qMatch} FY${fyMatch}`);
        variants.push(`${qMatch} FY ${fyMatch}`);
        variants.push(`${qMatch}-FY${fyMatch}`);
        variants.push(`${qMatch}-FY ${fyMatch}`);
      }
    }
    return Array.from(new Set(variants.filter(Boolean) as string[]));
  }

  /** Resolve canonical Financial Year string, e.g. "FY 2026-27" */
  public resolveFinancialYear(val?: string | null): string {
    if (!val) return getDynamicCurrentFinancialYear().financialYear;
    const str = String(val).trim();
    const match = str.match(/(?:FY\s*)?(\d{4}-\d{2})/i);
    if (match) {
      return `FY ${match[1]}`;
    }
    return str.toUpperCase().startsWith('FY') ? str : `FY ${str}`;
  }

  /** Resolve standard quarter date range (fromDate & toDate) */
  public resolveQuarterDateRange(
    quarterStr?: string | null,
    financialYearStr?: string | null,
    customStart?: any,
    customEnd?: any,
  ): { fromDate: string | null; toDate: string | null } {
    let fromDate: string | null = null;
    let toDate: string | null = null;

    if (customStart) {
      fromDate = customStart instanceof Date ? customStart.toISOString().split('T')[0] : String(customStart).split('T')[0];
    }
    if (customEnd) {
      toDate = customEnd instanceof Date ? customEnd.toISOString().split('T')[0] : String(customEnd).split('T')[0];
    }

    if (fromDate && toDate) {
      return { fromDate, toDate };
    }

    // Default dates for Indian Fiscal Year (Apr 1 - Mar 31)
    const qMatch = (quarterStr || '').match(/Q([1-4])/i);
    const fyMatch = (financialYearStr || quarterStr || '').match(/(\d{4})-(\d{2})/);
    if (qMatch && fyMatch) {
      const qNum = parseInt(qMatch[1], 10);
      const startYr = parseInt(fyMatch[1], 10);
      if (qNum === 1) {
        if (!fromDate) fromDate = `${startYr}-04-01`;
        if (!toDate) toDate = `${startYr}-06-30`;
      } else if (qNum === 2) {
        if (!fromDate) fromDate = `${startYr}-07-01`;
        if (!toDate) toDate = `${startYr}-09-30`;
      } else if (qNum === 3) {
        if (!fromDate) fromDate = `${startYr}-10-01`;
        if (!toDate) toDate = `${startYr}-12-31`;
      } else if (qNum === 4) {
        if (!fromDate) fromDate = `${startYr + 1}-01-01`;
        if (!toDate) toDate = `${startYr + 1}-03-31`;
      }
    }

    return {
      fromDate: fromDate || '2026-04-01',
      toDate: toDate || '2026-06-30',
    };
  }

  private sanitizeReview(review: QuarterlyReview | null): any {
    if (!review) return null;
    return {
      ...review,
      quarter: this.formatQuarterHyphen(review.quarter),
      projects: this.parseJsonIfNeeded(review.projects) ?? [],
      achievements: this.parseJsonIfNeeded((review as any).achievements) ?? [],
      challenges: this.parseJsonIfNeeded((review as any).challenges) ?? [],
      learningGoals: this.parseJsonIfNeeded(review.learningGoals) ?? [],
      teamContribution: this.parseJsonIfNeeded(review.teamContribution) ?? [],
      companyEnvironment: this.parseJsonIfNeeded(review.companyEnvironment) ?? null,
      ratings: this.parseJsonIfNeeded(review.ratings) ?? null,
    };
  }

  /** Build initials from a full name, e.g. "Aditi Sharma" -> "AS" */
  private getInitials(name: string): string {
    if (!name) return '--';
    const parts = name.trim().split(/\s+/);
    const firstInitial = parts[0]?.[0] || '';
    const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (firstInitial + lastInitial).toUpperCase();
  }

  private getDisplayStatus(review: QuarterlyReview, assignment?: ReviewAssignment | null): string {
    const revStatus = (review.reviewStatus || '').trim().toLowerCase();
    const st = (review.status || '').trim().toLowerCase();

    // 1. Completed / Reviewed by Manager/Admin/CEO -> Reviewed
    if (
      st === 'completed' ||
      st === 'approved' ||
      st === 'reviewed' ||
      revStatus === 'reviewed' ||
      revStatus === 'approved' ||
      revStatus === 'completed'
    ) {
      return 'Reviewed';
    }

    // 2. Saved as Draft by Manager/Admin/CEO during evaluation -> Under Review
    if (
      revStatus === 'in review' ||
      revStatus === 'under review' ||
      revStatus === 'draft' ||
      st === 'in review' ||
      st === 'under review'
    ) {
      return 'Under Review';
    }

    // 3. Submitted by Employee or Manager -> Awaiting Review
    if (
      st === 'submitted' ||
      st === 'auto submitted' ||
      st === 'pending' ||
      st === 'awaiting review' ||
      st === 'awaiting_review' ||
      revStatus === 'pending' ||
      revStatus === 'awaiting review' ||
      revStatus === 'awaiting_review' ||
      Boolean(review.submittedDate)
    ) {
      return 'Awaiting Review';
    }

    // 4. Assigned to employee -> Assigned
    return 'Assigned';
  }

  /** Categorize a raw review or row into standard buckets strictly matching the 4 canonical statuses. */
  private getStatusBucket(reviewRecord: any): 'assigned' | 'awaiting-review' | 'under-review' | 'reviewed' {
    const revStatus = (reviewRecord.reviewStatus || '').trim().toLowerCase();
    const st = (reviewRecord.status || '').trim().toLowerCase();

    if (
      ['reviewed', 'approved', 'completed'].includes(revStatus) ||
      ['reviewed', 'approved', 'completed'].includes(st)
    ) {
      return 'reviewed';
    }
    if (
      revStatus === 'in review' ||
      revStatus === 'under review' ||
      revStatus === 'draft' ||
      st === 'in review' ||
      st === 'under review'
    ) {
      return 'under-review';
    }
    if (
      revStatus === 'pending' ||
      revStatus === 'awaiting review' ||
      revStatus === 'awaiting_review' ||
      st === 'pending' ||
      st === 'awaiting review' ||
      st === 'awaiting_review' ||
      st === 'submitted' ||
      st === ReviewStatus.SUBMITTED.toLowerCase() ||
      st === 'auto submitted' ||
      st === ReviewStatus.AUTO_SUBMITTED.toLowerCase()
    ) {
      return 'awaiting-review';
    }
    return 'assigned';
  }

  private normalizeStatusFilter(statusValue: string): string {
    const val = (statusValue || '').toLowerCase().replace(/[\s_-]/g, '');
    if (val === 'underreview' || val === 'inreview') return 'under-review';
    if (val === 'reviewed' || val === 'completed' || val === 'approved') return 'reviewed';
    if (val === 'awaitingreview' || val === 'pending' || val === 'submitted') return 'awaiting-review';
    if (val === 'assigned' || val === 'notstarted' || val === 'draft') return 'assigned';
    return val;
  }

  private normalizeYear(yearStr: string): string {
    if (!yearStr) return '';
    const match = yearStr.match(/(\d{4}-\d{2})/);
    return match ? match[1] : yearStr.replace(/[^0-9-]/g, '').trim();
  }

  /** Known rating band labels mapped to representative numeric scores. */
  private static readonly RATING_LABEL_MAP: Record<string, number> = {
    outstanding: 5.0,
    'exceeds expectations': 4.5,
    'meets expectations': 3.5,
    'needs improvement': 2.5,
    unsatisfactory: 1.5,
  };

  private extractRatingValue(finalRating: string | null): number | null {
    if (!finalRating) return null;

    const normalized = finalRating.trim().toLowerCase();
    if (normalized in ManagerQuarterlyReviewService.RATING_LABEL_MAP) {
      return ManagerQuarterlyReviewService.RATING_LABEL_MAP[normalized];
    }

    const directNumber = parseFloat(finalRating);
    if (!isNaN(directNumber) && /^\s*[\d.]+\s*$/.test(finalRating)) return directNumber;

    const rangeMatch = finalRating.match(/(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/);
    if (rangeMatch) {
      const lowerBound = parseFloat(rangeMatch[1]);
      const upperBound = parseFloat(rangeMatch[3]);
      return Math.round(((lowerBound + upperBound) / 2) * 10) / 10;
    }

    const singleMatch = finalRating.match(/\d+(\.\d+)?/);
    return singleMatch ? parseFloat(singleMatch[0]) : null;
  }

  /**
   * Compute average score across the standard 6 rating categories.
   * Returns a 1-decimal number, or null if no ratings exist.
   */
  private computeAverageRatingScore(ratings: any): number | null {
    if (!ratings) return null;
    let parsed = ratings;
    if (typeof ratings === 'string') {
      try {
        parsed = JSON.parse(ratings);
      } catch {
        return null;
      }
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const numericValues = Object.values(parsed).filter(
      (v): v is number => typeof v === 'number' && !isNaN(v),
    );
    if (numericValues.length === 0) return null;
    const sum = numericValues.reduce((acc, curr) => acc + curr, 0);
    if (sum === 0) return null;
    const totalCategories = Math.max(numericValues.length, 6);
    return Math.round((sum / totalCategories) * 10) / 10;
  }

  /**
   * Determine employee's role (MANAGER, EMPLOYEE, etc.)
   * Primary source of truth: employee_details table 'role' column.
   */
  private resolveEmployeeRole(
    empDetail?: EmployeeDetails,
    userRecord?: User,
    review?: QuarterlyReview,
  ): string {
    // 1. Primary: employee_details table 'role' column
    const empRoleRaw = empDetail?.role ? String(empDetail.role).trim().toLowerCase() : '';
    if (empRoleRaw) {
      if (empRoleRaw === 'manager') return 'MANAGER';
      if (empRoleRaw === 'employee') return 'EMPLOYEE';
      if (empRoleRaw === 'admin') return 'ADMIN';
      if (empRoleRaw === 'team_lead' || empRoleRaw === 'team lead') return 'TEAM LEAD';
      return empRoleRaw.toUpperCase();
    }

    // 2. Secondary fallback: users table role or userType
    const userRoleRaw = (userRecord?.role || userRecord?.userType
      ? String(userRecord?.role || userRecord?.userType).trim().toLowerCase()
      : '');
    if (userRoleRaw) {
      if (userRoleRaw === 'manager') return 'MANAGER';
      if (userRoleRaw === 'employee') return 'EMPLOYEE';
      if (userRoleRaw === 'admin') return 'ADMIN';
      if (userRoleRaw === 'team_lead' || userRoleRaw === 'team lead') return 'TEAM LEAD';
      return userRoleRaw.toUpperCase();
    }

    // 3. Tertiary fallback: designation contains manager
    if (empDetail?.designation && empDetail.designation.toLowerCase().includes('manager')) {
      return 'MANAGER';
    }

    // 4. Fallback based on review manager name
    if (review?.managerName === 'CEO & Admin') {
      return 'MANAGER';
    }

    return 'EMPLOYEE';
  }

  /** Shape a single review row to what the review table UI expects */
  private toTableRow(
    review: QuarterlyReview,
    empDetail?: EmployeeDetails,
    userRecord?: User,
    assignment?: ReviewAssignment | null,
    revealToken?: string,
    managerUser?: any,
  ) {
    const sanitized = this.sanitizeReview(review);
    const employeeName = empDetail?.fullName || assignment?.employeeName || review.employeeId;
    const displayStatus = this.getDisplayStatus(review, assignment);
    const isEvaluated = displayStatus === 'Reviewed';
    const unsubmittedStatuses = ['draft', 'assigned', 'not started', 'not_started', 'in progress', 'in_progress'];
    const revStatusLower = (review.reviewStatus || '').trim().toLowerCase();
    const statusLower = (review.status || '').trim().toLowerCase();

    const isSubmitted = Boolean(
      review.submittedDate ||
      (statusLower && !unsubmittedStatuses.includes(statusLower)) ||
      (revStatusLower && !unsubmittedStatuses.includes(revStatusLower))
    );

    const submissionDetails = isSubmitted
      ? {
        overview: sanitized.overview || null,
        projects: sanitized.projects || [],
        achievements: sanitized.achievements || [],
        challenges: sanitized.challenges || [],
        learningGoals: sanitized.learningGoals || [],
        teamContribution: sanitized.teamContribution || [],
        companyEnvironment: sanitized.companyEnvironment || null,
      }
      : {
        overview: null,
        projects: [],
        achievements: [],
        challenges: [],
        learningGoals: [],
        teamContribution: [],
        companyEnvironment: null,
      };

    const averageScore = this.computeAverageRatingScore(review.ratings);
    const parsedRating = averageScore !== null ? averageScore : this.extractRatingValue(review.finalRating);
    const hasFinalRating = parsedRating !== null || review.finalRating !== null;

    // Evaluator who evaluated the review can see what they gave
    const isEvaluator = Boolean(
      managerUser &&
      (this.isPrivilegedUser(managerUser) ||
        review.evaluatorId === managerUser.loginId ||
        review.managerName === managerUser.loginId ||
        (managerUser.aliasLoginName && review.managerName === managerUser.aliasLoginName) ||
        (managerUser.fullName && review.managerName === managerUser.fullName) ||
        (review.evaluatorName && (review.evaluatorName === managerUser.aliasLoginName || review.evaluatorName === managerUser.fullName)))
    );

    const isTokenValid = Boolean(
      revealToken && review.id && isRevealTokenValid(revealToken, review.id, review.employeeId),
    );
    const shouldHideRating = hasFinalRating && !isEvaluator && !isTokenValid;

    const employeeRole = (assignment && assignment.role) ? assignment.role : this.resolveEmployeeRole(empDetail, userRecord, review);
    const isManagerEmployee = employeeRole === 'MANAGER';

    const rawQuarter = review.quarter || assignment?.quarter || '';
    const quarterCode = rawQuarter.match(/Q[1-4]/i)?.[0]?.toUpperCase() || rawQuarter || 'Q1';
    const resolvedFy = review.financialYear || assignment?.financialYear || this.resolveFinancialYear(rawQuarter);

    const assignedDateStr = review.assignedAt
      ? new Date(review.assignedAt).toISOString().slice(0, 10)
      : assignment?.assignedAt
        ? new Date(assignment.assignedAt).toISOString().slice(0, 10)
        : null;

    const deadlineDateStr = review.deadlineAt
      ? new Date(review.deadlineAt).toISOString().slice(0, 10)
      : assignment?.deadlineAt
        ? new Date(assignment.deadlineAt).toISOString().slice(0, 10)
        : null;

    const { fromDate: defaultFromDate, toDate: defaultToDate } = this.resolveQuarterDateRange(
      rawQuarter,
      resolvedFy,
      assignedDateStr,
      deadlineDateStr,
    );
    const fromDate = assignedDateStr || defaultFromDate;
    const toDate = deadlineDateStr || defaultToDate;
    const fullQuarter = `${quarterCode}-${resolvedFy.replace(/\s+/g, '')}`;

    return {
      ...sanitized,
      ...submissionDetails,
      isSubmitted,
      isReviewSubmitted: isSubmitted,
      submittedDate: isSubmitted ? review.submittedDate : null,
      id: review.id || assignment?.id,
      assignmentId: assignment?.id || review.assignmentId || null,
      employeeId: review.employeeId,
      employeeName,
      employeeInitials: this.getInitials(employeeName),
      employeeRole,
      role: employeeRole,
      department: empDetail?.department || 'Engineering',
      designation: empDetail?.designation || (isManagerEmployee ? 'Manager' : 'Employee'),
      quarter: quarterCode,
      quarterCode,
      fullQuarter,
      financialYear: resolvedFy,
      fromDate,
      toDate,
      startDate: fromDate,
      endDate: toDate,
      status: displayStatus,
      reviewStatus: displayStatus,
      finalRating: shouldHideRating ? null : parsedRating,
      averageRatingScore: shouldHideRating ? null : parsedRating,
      ratings: shouldHideRating ? null : sanitized.ratings,
      isFinalRatingHidden: shouldHideRating,
      hasFinalRating,
      lastModified: review.reviewedOn || (review as any).updatedAt || review.submittedDate || assignment?.assignedAt || null,
      deadlineAt: assignment?.deadlineAt || review.deadlineAt || toDate || null,
      assignedAt: assignment?.assignedAt || assignment?.createdAt || null,
      assignedByName: assignment?.assignedByName || null,
      actionType: isEvaluated ? 'view' : (isSubmitted ? 'evaluate' : 'view'),
      actionLabel: isEvaluated ? 'View Review' : (isSubmitted ? 'Evaluate Now' : 'Assigned'),
      managerName: review.managerName || assignment?.assignedByName,
      evaluatorName: review.evaluatorName || (isEvaluated ? review.managerName : null),
      evaluatorRole: review.evaluatorRole || (isEvaluated ? (review.managerName === 'CEO & Admin' ? 'CEO' : 'MANAGER') : null),
      evaluatorId: review.evaluatorId || null,
      notes: review.notes || assignment?.notes || null,
      description: review.notes || assignment?.notes || null,
      assignmentNotes: review.notes || assignment?.notes || null,
    };
  }

  /** Shape a ReviewAssignment (with no corresponding QuarterlyReview) into a table row */
  private toAssignmentOnlyRow(
    assignment: ReviewAssignment,
    empDetail?: EmployeeDetails,
    userRecord?: User,
  ) {
    const employeeName = empDetail?.fullName || assignment.employeeName || assignment.employeeId;
    const employeeRole = assignment.role || this.resolveEmployeeRole(empDetail, userRecord);
    const isManagerEmployee = employeeRole === 'MANAGER';

    const rawQuarter = assignment.quarter || '';
    const quarterCode = rawQuarter.match(/Q[1-4]/i)?.[0]?.toUpperCase() || rawQuarter || 'Q1';
    const resolvedFy = assignment.financialYear || this.resolveFinancialYear(rawQuarter);

    const assignedDateStr = assignment.assignedAt
      ? new Date(assignment.assignedAt).toISOString().slice(0, 10)
      : null;

    const deadlineDateStr = assignment.deadlineAt
      ? new Date(assignment.deadlineAt).toISOString().slice(0, 10)
      : null;

    const { fromDate: defaultFromDate, toDate: defaultToDate } = this.resolveQuarterDateRange(
      rawQuarter,
      resolvedFy,
      assignedDateStr,
      deadlineDateStr,
    );
    const fromDate = assignedDateStr || defaultFromDate;
    const toDate = deadlineDateStr || defaultToDate;
    const fullQuarter = `${quarterCode}-${resolvedFy.replace(/\s+/g, '')}`;

    return {
      id: assignment.id,
      assignmentId: assignment.id,
      employeeId: assignment.employeeId,
      employeeName,
      employeeInitials: this.getInitials(employeeName),
      employeeRole,
      role: employeeRole,
      department: empDetail?.department || 'Engineering',
      designation: empDetail?.designation || (isManagerEmployee ? 'Manager' : 'Employee'),
      quarter: quarterCode,
      quarterCode,
      fullQuarter,
      financialYear: resolvedFy,
      fromDate,
      toDate,
      startDate: fromDate,
      endDate: toDate,
      status: 'Assigned',
      reviewStatus: 'Assigned',
      finalRating: null,
      ratings: null,
      isFinalRatingHidden: false,
      hasFinalRating: false,
      lastModified: assignment.assignedAt || (assignment as any).createdAt || null,
      deadlineAt: assignment.deadlineAt || toDate || null,
      assignedAt: assignment.assignedAt || (assignment as any).createdAt || null,
      assignedByName: assignment.assignedByName || null,
      actionType: 'view',
      actionLabel: 'Assigned',
      managerName: assignment.assignedByName || null,
      evaluatorName: null,
      evaluatorRole: null,
      evaluatorId: null,
      projects: [],
      achievements: [],
      challenges: [],
      learningGoals: [],
      teamContribution: [],
      companyEnvironment: null,
      submittedDate: null,
      reviewedOn: null,
      notes: assignment.notes || null,
      description: assignment.notes || null,
      assignmentNotes: assignment.notes || null,
    };
  }

  /** Fiscal-year label for a table row, e.g. "2026-27" */
  private getRowFiscalYear(row: any): string {
    const financialYearMatch = (row.quarter || '').match(/FY\s*(\d{4}-\d{2})/i);
    if (financialYearMatch) return financialYearMatch[1];
    if (row.financialYear) {
      const fyMatch = String(row.financialYear).match(/(\d{4}-\d{2})/);
      if (fyMatch) return fyMatch[1];
    }
    if (row.lastModified || row.createdAt || row.assignedAt) {
      const d = new Date(row.lastModified || row.createdAt || row.assignedAt);
      if (!isNaN(d.getTime())) {
        const yearNumber = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
        return `${yearNumber}-${String(yearNumber + 1).slice(-2)}`;
      }
    }
    return '';
  }

  /**
   * Fetch, enrich, and filter rows based on logged-in user role and filters.
   * Includes both submitted reviews and active review assignments.
   */
  private async getFilteredRows(managerUser: any, filters: TeamSubmissionsFilters = {}, revealToken?: string): Promise<any[]> {
    const isPrivileged = this.isPrivilegedUser(managerUser);
    let reviews: QuarterlyReview[] = [];
    let assignments: ReviewAssignment[] = [];

    if (isPrivileged) {
      this.logger.log(`Admin/CEO ${managerUser?.loginId} fetching organization-wide quarterly reviews`);
      [reviews, assignments] = await Promise.all([
        this.quarterlyReviewRepository.find({ order: { id: 'DESC' } }),
        this.assignmentRepository.find({ order: { id: 'DESC' } }),
      ]);
    } else {
      const { employeeIds, managerNames } = await this.getMappedEmployeeIds(managerUser);
      const managerLoginId = managerUser?.loginId || '';
      const managerFullName = managerUser?.aliasLoginName || managerUser?.fullName || managerUser?.name || managerLoginId;

      this.logger.log(`Found ${employeeIds.length} mapped employees for manager ${managerUser?.loginId}`);

      const whereConditions: any[] = [];
      if (employeeIds.length > 0) {
        whereConditions.push({ employeeId: In(employeeIds) });
      }
      if (managerNames.length > 0) {
        managerNames.forEach((nameItem) => {
          whereConditions.push({ managerName: nameItem });
        });
      }
      if (managerLoginId) {
        whereConditions.push({ createdBy: managerLoginId });
      }

      // Assignment conditions for manager
      const assignConditions: any[] = [
        { assignedById: managerLoginId },
        { assignedByName: managerFullName },
      ];
      if (employeeIds.length > 0) {
        assignConditions.push({ employeeId: In(employeeIds) });
      }

      const [foundReviews, foundAssignments] = await Promise.all([
        whereConditions.length > 0
          ? this.quarterlyReviewRepository.find({ where: whereConditions, order: { id: 'DESC' } })
          : [],
        this.assignmentRepository.find({ where: assignConditions, order: { id: 'DESC' } }),
      ]);

      reviews = foundReviews;
      assignments = foundAssignments;
    }

    const normalizeQ = (q: string) => (q || '').toUpperCase().replace(/[\s_-]/g, '');

    // Map reviews by employeeId + normalized quarter
    const reviewMap = new Map<string, QuarterlyReview>();
    for (const r of reviews) {
      reviewMap.set(`${r.employeeId}_${normalizeQ(r.quarter)}`, r);
    }

    // Map assignments by employeeId + normalized quarter
    const assignmentMap = new Map<string, ReviewAssignment>();
    for (const a of assignments) {
      const key = `${a.employeeId}_${normalizeQ(a.quarter)}`;
      if (!assignmentMap.has(key)) {
        assignmentMap.set(key, a);
      }
    }

    // For any assignment that was AUTO_SUBMITTED and does not yet have a record in reviews, synthesize a review entry
    for (const a of assignments) {
      const key = `${a.employeeId}_${normalizeQ(a.quarter)}`;
      if (!reviewMap.has(key) && a.status === AssignmentStatus.AUTO_SUBMITTED) {
        const synth = this.quarterlyReviewRepository.create({
          id: a.id,
          employeeId: a.employeeId,
          quarter: a.quarter,
          status: ReviewStatus.AUTO_SUBMITTED,
          reviewStatus: 'Awaiting Review',
          assignmentId: a.id,
          deadlineAt: a.deadlineAt,
          managerName: a.assignedByName,
          createdBy: a.assignedByName,
          updatedBy: a.assignedByName,
        } as any) as unknown as QuarterlyReview;
        (synth as any).createdAt = a.assignedAt || a.createdAt;
        (synth as any).updatedAt = a.updatedAt || a.createdAt;
        reviews.push(synth);
        reviewMap.set(key, synth);
      }
    }

    // Filter by quarter if provided
    if (filters.quarter && filters.quarter.toUpperCase() !== 'ALL') {
      const normFilterQuarter = normalizeQ(filters.quarter);
      reviews = reviews.filter((reviewItem) =>
        normalizeQ(reviewItem.quarter).includes(normFilterQuarter),
      );
    }

    // Fetch employee details and user accounts for enrichment and role detection
    const allEmployeeIds = Array.from(new Set(reviews.map((reviewItem) => reviewItem.employeeId)));
    let employeeDetailsMap: Record<string, EmployeeDetails> = {};
    let usersMap: Record<string, User> = {};

    if (allEmployeeIds.length > 0) {
      const [employeeDetailsList, usersList] = await Promise.all([
        this.employeeDetailsRepository.find({
          where: { employeeId: In(allEmployeeIds) },
        }),
        this.userRepository.find({
          where: { loginId: In(allEmployeeIds) },
        }),
      ]);

      employeeDetailsMap = employeeDetailsList.reduce((accumulator, currentItem) => {
        accumulator[currentItem.employeeId] = currentItem;
        return accumulator;
      }, {} as Record<string, EmployeeDetails>);

      usersMap = usersList.reduce((accumulator, currentUserItem) => {
        if (currentUserItem.loginId) {
          accumulator[currentUserItem.loginId] = currentUserItem;
        }
        return accumulator;
      }, {} as Record<string, User>);
    }

    let rows = reviews.map((reviewItem) => {
      const matchingAssignment = assignmentMap.get(
        `${reviewItem.employeeId}_${normalizeQ(reviewItem.quarter)}`,
      );
      return this.toTableRow(
        reviewItem,
        employeeDetailsMap[reviewItem.employeeId],
        usersMap[reviewItem.employeeId],
        matchingAssignment,
        revealToken,
        managerUser,
      );
    });

    // Include assignments that have NO corresponding review record (status = 'Assigned')
    const assignmentOnlyEmployeeIds = Array.from(
      new Set(
        assignments
          .filter((a) => {
            const key = `${a.employeeId}_${normalizeQ(a.quarter)}`;
            return !reviewMap.has(key);
          })
          .map((a) => a.employeeId),
      ),
    );

    if (assignmentOnlyEmployeeIds.length > 0) {
      const [assignOnlyEmpDetails, assignOnlyUsers] = await Promise.all([
        this.employeeDetailsRepository.find({
          where: { employeeId: In(assignmentOnlyEmployeeIds) },
        }),
        this.userRepository.find({
          where: { loginId: In(assignmentOnlyEmployeeIds) },
        }),
      ]);

      const assignOnlyEmpMap: Record<string, EmployeeDetails> = {};
      for (const e of assignOnlyEmpDetails) assignOnlyEmpMap[e.employeeId] = e;

      const assignOnlyUserMap: Record<string, User> = {};
      for (const u of assignOnlyUsers) { if (u.loginId) assignOnlyUserMap[u.loginId] = u; }

      // De-duplicate: one row per employeeId + quarter combination
      const seenAssignmentKeys = new Set<string>();
      for (const a of assignments) {
        const key = `${a.employeeId}_${normalizeQ(a.quarter)}`;
        if (!reviewMap.has(key) && !seenAssignmentKeys.has(key)) {
          seenAssignmentKeys.add(key);
          rows.push(
            this.toAssignmentOnlyRow(
              a,
              assignOnlyEmpMap[a.employeeId],
              assignOnlyUserMap[a.employeeId],
            ),
          );
        }
      }
    }

    // Filter by status tab if requested
    if (filters.status && filters.status.toUpperCase() !== 'ALL') {
      const targetStatus = this.normalizeStatusFilter(filters.status);
      rows = rows.filter(
        (rowItem) => this.normalizeStatusFilter(this.getStatusBucket(rowItem)) === targetStatus,
      );
    }

    // Filter by role if requested (e.g. 'MANAGER' or 'EMPLOYEE')
    if (filters.role && filters.role.toUpperCase() !== 'ALL') {
      const targetRole = filters.role.toUpperCase();
      rows = rows.filter((rowItem) => (rowItem.employeeRole || rowItem.role || '').toUpperCase() === targetRole);
    }

    // Quarter filter (supports both filters.quarter and filters.quarterCard)
    const effectiveQuarter = (filters.quarter && filters.quarter.toUpperCase() !== 'ALL')
      ? filters.quarter
      : (filters.quarterCard && filters.quarterCard.toUpperCase() !== 'ALL')
        ? filters.quarterCard
        : null;

    if (effectiveQuarter) {
      const qUpper = effectiveQuarter.toUpperCase().trim();
      const qCode = qUpper.match(/Q[1-4]/i)?.[0]?.toUpperCase() || qUpper;
      const qHyphen = this.formatQuarterHyphen(qUpper).toUpperCase();
      const normTarget = this.normalizeQ(qUpper);
      rows = rows.filter((rowItem) => {
        const rowQ = (rowItem.quarter || '').toUpperCase().trim();
        const rowCode = (rowItem.quarterCode || rowQ).toUpperCase().trim();
        const rowFull = (rowItem.fullQuarter || '').toUpperCase().trim();
        const normRow = this.normalizeQ(rowFull || rowQ);
        return (
          rowCode === qCode ||
          rowQ === qUpper ||
          rowFull === qUpper ||
          rowFull === qHyphen ||
          normRow === normTarget ||
          rowFull.includes(qUpper) ||
          rowFull.includes(qHyphen)
        );
      });
    }

    // Filter by year if requested
    if (filters.year && filters.year.toUpperCase() !== 'ALL') {
      const targetYear = this.normalizeYear(filters.year);
      rows = rows.filter((rowItem) => this.normalizeYear(this.getRowFiscalYear(rowItem)) === targetYear);
    }

    // Filter by search query
    if (filters.search?.trim()) {
      const searchQueryLower = filters.search.trim().toLowerCase();
      rows = rows.filter((rowItem) => {
        const matchesName = rowItem.employeeName?.toLowerCase().includes(searchQueryLower);
        const matchesId = rowItem.employeeId?.toLowerCase().includes(searchQueryLower);
        const matchesDepartment = rowItem.department?.toLowerCase().includes(searchQueryLower);
        const matchesDesignation = rowItem.designation?.toLowerCase().includes(searchQueryLower);
        return matchesName || matchesId || matchesDepartment || matchesDesignation;
      });
    }

    // Filter by employeeId if requested
    if (filters.employeeId && filters.employeeId.toUpperCase() !== 'ALL') {
      const targetEmpId = filters.employeeId.trim().toLowerCase();
      rows = rows.filter(
        (rowItem) => (rowItem.employeeId || '').trim().toLowerCase() === targetEmpId,
      );
    }

    return rows;
  }

  /**
   * Fetch submissions, paginated server-side.
   */
  async getTeamSubmissions(
    managerUser: any,
    filters: TeamSubmissionsFilters = {},
    revealToken?: string,
  ): Promise<PaginatedResult<any>> {
    try {
      let rows = await this.getFilteredRows(managerUser, filters, revealToken);

      try {
        const pendingAccessReqs = await this.accessRequestRepository.find({
          where: { status: AccessRequestStatus.PENDING },
        });
        if (pendingAccessReqs.length > 0) {
          rows = rows.map((row) => {
            const req = pendingAccessReqs.find((ar) => {
              if (String(ar.employeeId).trim().toLowerCase() !== String(row.employeeId).trim().toLowerCase()) return false;
              const arQ = this.normalizeQ(ar.quarter || '');
              const rowQ = this.normalizeQ(row.quarter || row.fullQuarter || '');
              return !arQ || !rowQ || arQ === rowQ || arQ.includes(rowQ) || rowQ.includes(arQ);
            });
            return {
              ...row,
              hasPendingAccessRequest: Boolean(req),
              pendingAccessRequestId: req ? req.id : null,
              pendingAccessRequest: req || null,
            };
          });
        }
      } catch (reqError: any) {
        this.logger.warn(`Failed to attach pending access requests: ${reqError.message}`);
      }

      const total = rows.length;
      const page = filters.page && filters.page > 0 ? filters.page : 1;
      const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 10;
      const start = (page - 1) * pageSize;

      return {
        data: rows.slice(start, start + pageSize),
        total,
        page,
        pageSize,
      };
    } catch (error: any) {
      this.logger.error(`[getTeamSubmissions] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch team submissions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Distinct quarter values available for this manager/admin team */
  async getQuarterOptions(managerUser: any): Promise<string[]> {
    try {
      const rows = await this.getFilteredRows(managerUser);
      return Array.from(new Set(rows.map((rowItem) => this.formatQuarterHyphen(rowItem.quarter)).filter(Boolean)));
    } catch (error: any) {
      this.logger.error(`[getQuarterOptions] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch quarter options',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Master financial years around current fiscal year */
  getFinancialYearOptions(): {
    financialYears: Array<{ label: string; value: string; code: string; isCurrent: boolean }>;
    currentAcademicYear: string;
    currentFinancialYear: string;
    currentAcademicYearCode: string;
  } {
    const now = new Date();
    const month = now.getMonth();
    const calendarYear = now.getFullYear();
    const currentStartYear = month >= 3 ? calendarYear : calendarYear - 1;
    const currentCode = `${currentStartYear}-${String(currentStartYear + 1).slice(2)}`;
    const currentAcademicYear = `FY ${currentCode}`;

    const items: Array<{ label: string; value: string; code: string; isCurrent: boolean }> = [];
    for (let yr = currentStartYear + 2; yr >= currentStartYear - 5; yr--) {
      const code = `${yr}-${String(yr + 1).slice(2)}`;
      items.push({
        label: `FY ${code}`,
        value: code,
        code,
        isCurrent: yr === currentStartYear,
      });
    }

    return {
      financialYears: items,
      currentAcademicYear,
      currentFinancialYear: currentAcademicYear,
      currentAcademicYearCode: currentCode,
    };
  }


  /** Get all employees associated with this manager/admin for the employee filter dropdown */
  async getTeamEmployees(managerUser: any): Promise<Array<{ employeeId: string; employeeName: string; designation?: string; role?: string; employeeRole?: string }>> {
    try {
      const isPrivileged = this.isPrivilegedUser(managerUser);
      if (isPrivileged) {
        const emps = await this.employeeDetailsRepository.find({
          order: { fullName: 'ASC' },
        });
        return emps
          .filter((e) => e.employeeId)
          .map((e) => {
            const role = this.resolveEmployeeRole(e);
            return {
              employeeId: e.employeeId,
              employeeName: e.fullName || e.employeeId,
              designation: e.designation || 'Employee',
              role,
              employeeRole: role,
            };
          });
      } else {
        const { employeeIds } = await this.getMappedEmployeeIds(managerUser);
        const managerLoginId = managerUser?.loginId || '';
        const [extraReviews, extraAssignments] = await Promise.all([
          this.quarterlyReviewRepository.find({
            where: [
              { managerName: managerUser?.aliasLoginName || managerUser?.fullName },
              { createdBy: managerLoginId },
            ],
            select: ['employeeId'],
          }),
          this.assignmentRepository.find({
            where: [{ assignedById: managerLoginId }],
            select: ['employeeId'],
          }),
        ]);
        const allIds = Array.from(
          new Set([
            ...employeeIds,
            ...extraReviews.map((r) => r.employeeId),
            ...extraAssignments.map((a) => a.employeeId),
          ]),
        ).filter(Boolean);

        if (allIds.length === 0) return [];
        const emps = await this.employeeDetailsRepository.find({
          where: { employeeId: In(allIds) },
          order: { fullName: 'ASC' },
        });
        return emps.map((e) => {
          const role = this.resolveEmployeeRole(e);
          return {
            employeeId: e.employeeId,
            employeeName: e.fullName || e.employeeId,
            designation: e.designation || 'Employee',
            role,
            employeeRole: role,
          };
        });
      }
    } catch (error: any) {
      this.logger.error(`[getTeamEmployees] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch team employees',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Return every active employee mapped to this manager for the reminder modal. */
  async getNotificationCandidates(managerUser: any) {
    try {
      const { employeeIds } = await this.getMappedEmployeeIds(managerUser);
      if (employeeIds.length === 0) return [];

      const [employees, reviews] = await Promise.all([
        this.employeeDetailsRepository.find({ where: { employeeId: In(employeeIds) } }),
        this.quarterlyReviewRepository.find({
          where: { employeeId: In(employeeIds) },
          order: { id: 'DESC' },
        }),
      ]);

      const latestReviewByEmployee = new Map<string, QuarterlyReview>();
      for (const review of reviews) {
        if (!latestReviewByEmployee.has(review.employeeId)) {
          latestReviewByEmployee.set(review.employeeId, review);
        }
      }

      return employeeIds.map((employeeId) => {
        const employee = employees.find((item) => item.employeeId === employeeId);
        const review = latestReviewByEmployee.get(employeeId);
        const isCompleted = Boolean(
          review &&
          ([ReviewStatus.APPROVED, ReviewStatus.COMPLETED].includes(review.status) ||
            review.reviewStatus === ReviewStatus.REVIEWED),
        );
        const hasFinalRating = isCompleted && Boolean(review?.finalRating);

        return {
          employeeId,
          employeeName: employee?.fullName || employeeId,
          designation: employee?.designation || 'Employee',
          department: employee?.department || '—',
          email: employee?.email || null,
          joiningDate: employee?.joiningDate || null,
          employmentType: employee?.employmentType || null,
          gender: employee?.gender || null,
          userStatus: employee?.userStatus || null,
          quarter: review?.quarter || null,
          reviewStatus: review?.reviewStatus || review?.status || null,
          submittedDate: review?.submittedDate || null,
          averageRating: review?.averageRating != null
            ? parseFloat(String(review.averageRating))
            : null,
          finalRating: hasFinalRating ? null : (review?.finalRating || null),
          isFinalRatingHidden: hasFinalRating,
          hasFinalRating,
          managerName: review?.managerName || null,
          isCompleted,
        };
      });
    } catch (error: any) {
      this.logger.error(`[getNotificationCandidates] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch notification candidates',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Send in-app reminders to mapped employees who have not completed a review. */
  async sendReviewNotifications(managerUser: any, employeeIds: string[]) {
    try {
      if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
        throw new BadRequestException('At least one employee must be selected.');
      }

      const { employeeIds: mappedEmployeeIds } = await this.getMappedEmployeeIds(managerUser);
      const mappedIds = new Set(mappedEmployeeIds);
      const requestedIds = Array.from(new Set(employeeIds.map((id) => String(id).trim()).filter(Boolean)));
      const eligibleIds = requestedIds.filter((employeeId) => mappedIds.has(employeeId));

      if (eligibleIds.length === 0) {
        throw new ForbiddenException('None of the selected employees are mapped to this manager.');
      }

      const reviews = await this.quarterlyReviewRepository.find({
        where: { employeeId: In(eligibleIds) },
        order: { id: 'DESC' },
      });
      const latestReviewByEmployee = new Map<string, QuarterlyReview>();
      for (const review of reviews) {
        if (!latestReviewByEmployee.has(review.employeeId)) {
          latestReviewByEmployee.set(review.employeeId, review);
        }
      }

      const pendingIds = eligibleIds.filter((employeeId) => {
        const review = latestReviewByEmployee.get(employeeId);
        return !review || ![ReviewStatus.APPROVED, ReviewStatus.COMPLETED].includes(review.status) && review.reviewStatus !== ReviewStatus.REVIEWED;
      });

      if (pendingIds.length === 0) {
        return { sent: 0, skipped: eligibleIds.length, employeeIds: [] };
      }

      const title = 'Quarterly Review Reminder';
      const message = 'Please complete your quarterly review submission. Your manager has requested that you update it as soon as possible.';
      for (const employeeId of pendingIds) {
        await this.notificationsService.createNotification({
          employeeId,
          title,
          message,
          type: 'alert',
        });
      }

      this.logger.log(`Sent quarterly review reminders to ${pendingIds.length} employees.`);
      return {
        sent: pendingIds.length,
        skipped: eligibleIds.length - pendingIds.length,
        employeeIds: pendingIds,
      };
    } catch (error: any) {
      this.logger.error(`[sendReviewNotifications] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to send review reminders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Calculate stats for manager dashboard — submissions summary and quarter-specific employee assignment summary. */
  async getStats(
    managerUser: any,
    queryFilters: { quarter?: string; financialYear?: string; year?: string } = {},
  ) {
    try {
      const isPrivileged = this.isPrivilegedUser(managerUser);

      // Determine requested quarter & financial year
      const rawQuarterString = (queryFilters.quarter || '').trim();
      const isAllQuartersSelected = !rawQuarterString || rawQuarterString.toUpperCase() === 'ALL';
      const selectedQuarter = isAllQuartersSelected ? '' : rawQuarterString;

      const rawYearString = (queryFilters.financialYear || queryFilters.year || '').trim();
      const isAllYearsSelected = !rawYearString || rawYearString.toUpperCase() === 'ALL';
      const normalizedYearDigits = rawYearString ? this.normalizeYear(rawYearString) : '';
      const selectedFinancialYear = isAllYearsSelected ? '' : (normalizedYearDigits ? `FY${normalizedYearDigits}` : '');

      // ── 1. Fetch eligible employees for this manager/admin ──
      let eligibleEmployees: Array<{
        employeeId: string;
        employeeName: string;
        designation: string;
        department: string;
        email?: string;
      }> = [];

      if (isPrivileged) {
        const allEmployeesList = await this.employeeDetailsRepository.find({ order: { fullName: 'ASC' } });
        eligibleEmployees = allEmployeesList
          .filter((employee) => employee.employeeId && employee.employeeId !== managerUser?.loginId)
          .map((employee) => ({
            employeeId: employee.employeeId,
            employeeName: employee.fullName || employee.employeeId,
            designation: employee.designation || 'Employee',
            department: employee.department || 'General',
            email: employee.email || '',
          }));
      } else {
        const { employeeIds: mappedEmployeeIds } = await this.getMappedEmployeeIds(managerUser);
        if (mappedEmployeeIds.length > 0) {
          const allEmployeesList = await this.employeeDetailsRepository.find({
            where: { employeeId: In(mappedEmployeeIds) },
            order: { fullName: 'ASC' },
          });
          eligibleEmployees = mappedEmployeeIds.map((targetEmployeeId) => {
            const matchedEmployee = allEmployeesList.find(
              (employeeDetail) => employeeDetail.employeeId === targetEmployeeId,
            );
            return {
              employeeId: targetEmployeeId,
              employeeName: matchedEmployee?.fullName || targetEmployeeId,
              designation: matchedEmployee?.designation || 'Team Member',
              department: matchedEmployee?.department || 'General',
              email: matchedEmployee?.email || '',
            };
          });
        }
      }

      // ── 2. Employee Assignment Summary for the selected Quarter & Year ──
      const eligibleEmployeeIds = eligibleEmployees.map((employee) => employee.employeeId);
      let assignedReviewList: ReviewAssignment[] = [];

      let displayQuarterLabel = selectedQuarter;
      if (!displayQuarterLabel) {
        displayQuarterLabel = 'Q1';
      }
      let targetQuarterCanonical = displayQuarterLabel;
      if (/^Q[1-4]$/i.test(displayQuarterLabel)) {
        targetQuarterCanonical = selectedFinancialYear ? `${displayQuarterLabel.toUpperCase()} ${selectedFinancialYear}` : displayQuarterLabel.toUpperCase();
      }

      if (eligibleEmployeeIds.length > 0) {
        const assignmentQueryBuilder = this.assignmentRepository
          .createQueryBuilder('assignment')
          .where('assignment.employeeId IN (:...eligibleEmployeeIds)', { eligibleEmployeeIds });

        if (selectedQuarter) {
          const quarterPrefixMatch = selectedQuarter.match(/^Q[1-4]/i)?.[0]?.toUpperCase() || selectedQuarter;
          assignmentQueryBuilder.andWhere(
            '(assignment.quarter = :targetQuarterCanonical OR assignment.quarter LIKE :quarterPrefixPattern)',
            {
              targetQuarterCanonical,
              quarterPrefixPattern: `${quarterPrefixMatch}%`,
            },
          );
        }

        if (selectedFinancialYear) {
          const rawFiscalYearNumber = selectedFinancialYear.replace(/^FY/i, '').trim();
          assignmentQueryBuilder.andWhere(
            '(assignment.financialYear = :selectedFinancialYear OR assignment.financialYear LIKE :rawFiscalYearPattern OR assignment.quarter LIKE :yearMatchPattern)',
            {
              selectedFinancialYear,
              rawFiscalYearPattern: `%${rawFiscalYearNumber}%`,
              yearMatchPattern: `%${rawFiscalYearNumber}%`,
            },
          );
        }

        assignedReviewList = await assignmentQueryBuilder.orderBy('assignment.id', 'DESC').getMany();
      }

      const assignmentMap = new Map<string, ReviewAssignment>();
      for (const assignmentRecord of assignedReviewList) {
        if (!assignmentMap.has(assignmentRecord.employeeId)) {
          assignmentMap.set(assignmentRecord.employeeId, assignmentRecord);
        }
      }

      // ── 2b. Query all assignments for the financial year to find employees with only 1 quarter assigned & pending quarters ──
      let allFyAssignments: ReviewAssignment[] = [];
      if (eligibleEmployeeIds.length > 0) {
        const fyAssignmentQueryBuilder = this.assignmentRepository
          .createQueryBuilder('assignment')
          .where('assignment.employeeId IN (:...eligibleEmployeeIds)', { eligibleEmployeeIds });

        if (selectedFinancialYear) {
          const rawFiscalYearNumber = selectedFinancialYear.replace(/^FY/i, '').trim();
          fyAssignmentQueryBuilder.andWhere(
            '(assignment.financialYear = :selectedFinancialYear OR assignment.financialYear LIKE :rawFiscalYearPattern OR assignment.quarter LIKE :yearMatchPattern)',
            {
              selectedFinancialYear,
              rawFiscalYearPattern: `%${rawFiscalYearNumber}%`,
              yearMatchPattern: `%${rawFiscalYearNumber}%`,
            },
          );
        }

        allFyAssignments = await fyAssignmentQueryBuilder.orderBy('assignment.id', 'DESC').getMany();
      }

      const getQuarterCode = (qStr: string): string => {
        const m = (qStr || '').match(/Q[1-4]/i);
        return m ? m[0].toUpperCase() : (qStr || '').trim();
      };

      const employeeFyAssignmentsMap = new Map<string, ReviewAssignment[]>();
      for (const a of allFyAssignments) {
        const list = employeeFyAssignmentsMap.get(a.employeeId) || [];
        list.push(a);
        employeeFyAssignmentsMap.set(a.employeeId, list);
      }

      const allQuarterCodes = ['Q1', 'Q2', 'Q3', 'Q4'];
      const now = new Date();
      const currentMonth = now.getMonth();
      let currentQuarterCode = 'Q1';
      if (currentMonth >= 3 && currentMonth <= 5) currentQuarterCode = 'Q1';
      else if (currentMonth >= 6 && currentMonth <= 8) currentQuarterCode = 'Q2';
      else if (currentMonth >= 9 && currentMonth <= 11) currentQuarterCode = 'Q3';
      else currentQuarterCode = 'Q4';

      const assignedEmployees: any[] = [];
      const notAssignedEmployees: any[] = [];
      const singleQuarterEmployees: any[] = [];

      for (const currentEmployee of eligibleEmployees) {
        const existingAssignment = assignmentMap.get(currentEmployee.employeeId);
        const empAssignments = employeeFyAssignmentsMap.get(currentEmployee.employeeId) || (existingAssignment ? [existingAssignment] : []);
        const uniqueAssignedCodes = Array.from(
          new Set(empAssignments.map((a) => getQuarterCode(a.quarter)).filter(Boolean)),
        );
        const pendingCodes = allQuarterCodes.filter((q) => !uniqueAssignedCodes.includes(q));
        let primaryPending = pendingCodes.find((q) => q === currentQuarterCode) || pendingCodes[0] || '';
        if (uniqueAssignedCodes.includes(currentQuarterCode)) {
          primaryPending = pendingCodes.includes('Q1') ? 'Q1' : (pendingCodes[0] || '');
        }

        if (existingAssignment) {
          assignedEmployees.push({
            employeeId: currentEmployee.employeeId,
            employeeName: currentEmployee.employeeName,
            designation: currentEmployee.designation,
            department: currentEmployee.department,
            email: currentEmployee.email,
            quarter: existingAssignment.quarter,
            assignedQuarter: existingAssignment.quarter,
            assignedQuarters: uniqueAssignedCodes.length > 0 ? uniqueAssignedCodes : [getQuarterCode(existingAssignment.quarter)],
            pendingQuarter: primaryPending,
            pendingQuarters: pendingCodes,
            financialYear: existingAssignment.financialYear || selectedFinancialYear,
            status: existingAssignment.status || 'Assigned',
            assignedAt: existingAssignment.assignedAt,
            deadlineAt: existingAssignment.deadlineAt,
            assignedByName: existingAssignment.assignedByName,
          });
        } else {
          notAssignedEmployees.push({
            employeeId: currentEmployee.employeeId,
            employeeName: currentEmployee.employeeName,
            designation: currentEmployee.designation,
            department: currentEmployee.department,
            email: currentEmployee.email,
          });
        }

        if (uniqueAssignedCodes.length === 1) {
          const assignedCode = uniqueAssignedCodes[0];
          const matchedAssignment = empAssignments[0] || existingAssignment;

          singleQuarterEmployees.push({
            employeeId: currentEmployee.employeeId,
            employeeName: currentEmployee.employeeName,
            designation: currentEmployee.designation,
            department: currentEmployee.department,
            email: currentEmployee.email,
            assignedQuarter: assignedCode,
            assignedQuarters: uniqueAssignedCodes,
            pendingQuarter: primaryPending || 'Q2',
            pendingQuarters: pendingCodes,
            financialYear: selectedFinancialYear,
            status: matchedAssignment?.status || 'Assigned',
            assignedAt: matchedAssignment?.assignedAt || null,
            deadlineAt: matchedAssignment?.deadlineAt || null,
            assignedByName: matchedAssignment?.assignedByName || null,
          });
        }
      }

      // ── 3. Review Submissions Summary (Strictly actual submissions only) ──
      // Exclude unsubmitted 'Assigned' and 'Draft' records so assignment counts are NOT mixed with submissions
      const filteredReviewRows = await this.getFilteredRows(managerUser, {
        quarter: selectedQuarter || undefined,
        year: isAllYearsSelected ? undefined : rawYearString,
      });

      const isActualSubmission = (reviewRow: any) => {
        const reviewStatusLower = (reviewRow.status || '').toLowerCase();
        const evaluationStatusLower = (reviewRow.reviewStatus || '').toLowerCase();
        const hasSubmittedReviewStatus = [
          'submitted',
          'auto submitted',
          'in review',
          'under review',
          'reviewed',
          'completed',
          'approved',
        ].includes(reviewStatusLower) || [
          'pending',
          'in review',
          'under review',
          'reviewed',
          'completed',
          'approved',
        ].includes(evaluationStatusLower);

        return hasSubmittedReviewStatus && reviewStatusLower !== 'assigned' && reviewStatusLower !== 'draft';
      };

      const actualSubmissionRows = filteredReviewRows.filter(isActualSubmission);
      const pendingReviewsCount = actualSubmissionRows.filter(
        (reviewItem) => this.getStatusBucket(reviewItem) === 'awaiting-review',
      ).length;
      const inReviewCount = actualSubmissionRows.filter(
        (reviewItem) => this.getStatusBucket(reviewItem) === 'under-review',
      ).length;
      const completedCount = actualSubmissionRows.filter(
        (reviewItem) => this.getStatusBucket(reviewItem) === 'reviewed',
      ).length;
      const totalSubmissionsCount = pendingReviewsCount + inReviewCount + completedCount;

      return {
        totalTeamMembers: eligibleEmployees.length,
        totalSubmissions: totalSubmissionsCount,
        awaitingReview: pendingReviewsCount,
        pendingReviews: pendingReviewsCount,
        inReview: inReviewCount,
        completed: completedCount,
        assignmentSummary: {
          quarter: selectedQuarter || displayQuarterLabel,
          financialYear: selectedFinancialYear,
          canonicalQuarter: targetQuarterCanonical,
          totalEmployees: eligibleEmployees.length,
          totalSubmissions: totalSubmissionsCount,
          awaitingReview: pendingReviewsCount,
          pendingReviews: pendingReviewsCount,
          inReview: inReviewCount,
          completed: completedCount,
          assignedCount: assignedEmployees.length,
          notAssignedCount: notAssignedEmployees.length,
          singleQuarterCount: singleQuarterEmployees.length,
          assignedEmployees,
          notAssignedEmployees,
          singleQuarterEmployees,
        },
      };
    } catch (error: any) {
      this.logger.error(`[getStats] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to compute manager review stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Get single submission details */
  async getSubmissionById(managerUser: any, id: number) {
    try {
      const review = await this.quarterlyReviewRepository.findOne({ where: { id } });
      if (!review) {
        throw new NotFoundException(`Quarterly review with ID ${id} not found.`);
      }

      const isPrivileged = this.isPrivilegedUser(managerUser);

      if (!isPrivileged) {
        const { employeeIds, managerNames } = await this.getMappedEmployeeIds(managerUser);
        const isMappedByEmployeeId = employeeIds.includes(review.employeeId);
        const isMappedByManagerName = managerNames.some(
          (mName) =>
            mName &&
            review.managerName &&
            (mName.toLowerCase() === review.managerName.toLowerCase() ||
              review.managerName.toLowerCase().includes(mName.toLowerCase())),
        );
        const isDirectEvaluator =
          review.evaluatorId === managerUser?.loginId ||
          review.managerName === managerUser?.loginId ||
          review.managerName === (managerUser?.aliasLoginName || managerUser?.fullName);

        if (!isMappedByEmployeeId && !isMappedByManagerName && !isDirectEvaluator) {
          throw new ForbiddenException("You do not have access to this employee's review.");
        }
      }

      const sanitized = this.sanitizeReview(review);
      const [empDetail, userRecord] = await Promise.all([
        this.employeeDetailsRepository.findOne({ where: { employeeId: review.employeeId } }),
        this.userRepository.findOne({ where: { loginId: review.employeeId } }),
      ]);

      let assignment: ReviewAssignment | null = null;
      if (review.assignmentId) {
        assignment = await this.assignmentRepository.findOne({ where: { id: review.assignmentId } });
      }
      if (!assignment) {
        const variants = this.normalizeQuarterVariants(review.quarter);
        assignment = await this.assignmentRepository.findOne({
          where: { employeeId: review.employeeId, quarter: In(variants) },
          order: { id: 'DESC' },
        });
      }

      const employeeRole = this.resolveEmployeeRole(empDetail || undefined, userRecord || undefined, review);
      const isManagerEmployee = employeeRole === 'MANAGER';

      const rawQuarter = review.quarter || assignment?.quarter || '';
      const quarterCode = rawQuarter.match(/Q[1-4]/i)?.[0]?.toUpperCase() || rawQuarter || 'Q1';
      const resolvedFy = review.financialYear || assignment?.financialYear || this.resolveFinancialYear(rawQuarter);

      const assignedDateStr = review.assignedAt
        ? new Date(review.assignedAt).toISOString().slice(0, 10)
        : assignment?.assignedAt
          ? new Date(assignment.assignedAt).toISOString().slice(0, 10)
          : null;

      const deadlineDateStr = review.deadlineAt
        ? new Date(review.deadlineAt).toISOString().slice(0, 10)
        : assignment?.deadlineAt
          ? new Date(assignment.deadlineAt).toISOString().slice(0, 10)
          : null;

      const { fromDate: defaultFromDate, toDate: defaultToDate } = this.resolveQuarterDateRange(
        rawQuarter,
        resolvedFy,
        assignedDateStr,
        deadlineDateStr,
      );
      const fromDate = assignedDateStr || defaultFromDate;
      const toDate = deadlineDateStr || defaultToDate;
      const fullQuarter = `${quarterCode}-${resolvedFy.replace(/\s+/g, '')}`;
      const assignmentNotes = review.notes || assignment?.notes || null;

      return {
        ...sanitized,
        quarter: quarterCode,
        quarterCode,
        fullQuarter,
        financialYear: resolvedFy,
        fromDate,
        toDate,
        startDate: fromDate,
        endDate: toDate,
        assignedAt: review.assignedAt || assignment?.assignedAt || fromDate,
        deadlineAt: review.deadlineAt || assignment?.deadlineAt || toDate,
        notes: assignmentNotes,
        description: assignmentNotes,
        assignmentNotes,
        employeeName: empDetail?.fullName || review.employeeId,
        employeeRole,
        role: employeeRole,
        department: empDetail?.department || 'Engineering',
        designation: empDetail?.designation || (isManagerEmployee ? 'Manager' : 'Employee'),
        evaluatorName: review.evaluatorName || (review.reviewStatus ? review.managerName : null),
        evaluatorRole: review.evaluatorRole || (review.reviewStatus ? (review.managerName === 'CEO & Admin' ? 'CEO' : 'MANAGER') : null),
        evaluatorId: review.evaluatorId || null,
      };
    } catch (error: any) {
      this.logger.error(`[getSubmissionById] Error for id=${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch submission details',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get single submission details by employeeId.
   */
  async getSubmissionByEmployeeId(managerUser: any, employeeId: string, quarter?: string, revealToken?: string) {
    try {
      const isPrivileged = this.isPrivilegedUser(managerUser);

      let whereConditions: any;
      if (quarter) {
        const variants = this.normalizeQuarterVariants(quarter);
        whereConditions = { employeeId, quarter: In(variants) };
      } else {
        whereConditions = { employeeId };
      }

      let review = await this.quarterlyReviewRepository.findOne({
        where: whereConditions,
        order: { id: 'DESC' },
      });

      if (!review && quarter) {
        const allReviews = await this.quarterlyReviewRepository.find({
          where: { employeeId },
          order: { id: 'DESC' },
        });
        const normQ = this.normalizeQ(quarter);
        const qCode = quarter.match(/Q[1-4]/i)?.[0]?.toUpperCase();
        review = allReviews.find((r) => {
          const rNorm = this.normalizeQ(r.quarter);
          const rCode = r.quarter?.match(/Q[1-4]/i)?.[0]?.toUpperCase();
          return rNorm === normQ || rNorm.startsWith(normQ) || (qCode && rCode === qCode);
        }) || null;
      }

      // If a review was found but quarter was explicitly specified, verify that the review matches the requested quarter
      if (review && quarter) {
        const normQ = this.normalizeQ(quarter);
        const rNorm = this.normalizeQ(review.quarter);
        const qCode = quarter.match(/Q[1-4]/i)?.[0]?.toUpperCase();
        const rCode = review.quarter?.match(/Q[1-4]/i)?.[0]?.toUpperCase();
        const matches = rNorm === normQ || rNorm.startsWith(normQ) || normQ.startsWith(rNorm) || (qCode && rCode === qCode);
        if (!matches) {
          review = null;
        }
      }

      // Only fall back to review primary key id lookup if no quarter parameter was provided at all
      if (!review && !quarter && !isNaN(Number(employeeId))) {
        review = await this.quarterlyReviewRepository.findOne({
          where: { id: Number(employeeId) },
        });
      }

      if (!review) {
        let assignment = await this.assignmentRepository.findOne({
          where: whereConditions,
          order: { id: 'DESC' },
        });

        if (!assignment && quarter) {
          const allAssignments = await this.assignmentRepository.find({
            where: { employeeId },
            order: { id: 'DESC' },
          });
          const normQ = this.normalizeQ(quarter);
          const qCode = quarter.match(/Q[1-4]/i)?.[0]?.toUpperCase();
          assignment = allAssignments.find((a) => {
            const aNorm = this.normalizeQ(a.quarter);
            const aCode = a.quarter?.match(/Q[1-4]/i)?.[0]?.toUpperCase();
            return aNorm === normQ || aNorm.startsWith(normQ) || (qCode && aCode === qCode);
          }) || null;
        }

        if (assignment) {
          const empDetail = await this.employeeDetailsRepository.findOne({
            where: { employeeId },
          });

          const rawQuarter = assignment.quarter || '';
          const quarterCode = rawQuarter.match(/Q[1-4]/i)?.[0]?.toUpperCase() || rawQuarter || 'Q1';
          const resolvedFy = assignment.financialYear || this.resolveFinancialYear(rawQuarter);
          const assignedDateStr = assignment.assignedAt
            ? new Date(assignment.assignedAt).toISOString().slice(0, 10)
            : null;
          const deadlineDateStr = assignment.deadlineAt
            ? new Date(assignment.deadlineAt).toISOString().slice(0, 10)
            : null;
          const { fromDate: defaultFromDate, toDate: defaultToDate } = this.resolveQuarterDateRange(
            rawQuarter,
            resolvedFy,
            assignedDateStr,
            deadlineDateStr,
          );
          const fromDate = assignedDateStr || defaultFromDate;
          const toDate = deadlineDateStr || defaultToDate;
          const fullQuarter = `${quarterCode}-${resolvedFy.replace(/\s+/g, '')}`;

          return {
            id: assignment.id,
            assignmentId: assignment.id,
            employeeId: assignment.employeeId,
            employeeName: empDetail?.fullName || assignment.employeeName,
            department: empDetail?.department || 'Engineering',
            designation: empDetail?.designation || 'Employee',
            quarter: quarterCode,
            quarterCode,
            fullQuarter,
            financialYear: resolvedFy,
            fromDate,
            toDate,
            startDate: fromDate,
            endDate: toDate,
            status: 'Assigned',
            reviewStatus: 'Assigned',
            overview: null,
            achievements: [],
            challenges: [],
            learningGoals: [],
            projects: [],
            teamContribution: [],
            companyEnvironment: null,
            submittedDate: null,
            reviewedOn: null,
            lastModified: assignment.assignedAt,
            finalRating: null,
            actionType: 'view',
            actionLabel: 'Assigned',
            managerName: assignment.assignedByName,
            deadlineAt: assignment.deadlineAt || toDate,
            assignedAt: assignment.assignedAt,
            notes: assignment.notes || null,
            description: assignment.notes || null,
            assignmentNotes: assignment.notes || null,
          };
        }

        throw new NotFoundException(`Quarterly review for employee ID ${employeeId} not found.`);
      }

      if (!isPrivileged) {
        const { employeeIds, managerNames } = await this.getMappedEmployeeIds(managerUser);
        const isMappedByEmployeeId = employeeIds.includes(review.employeeId);
        const isMappedByManagerName = managerNames.some(
          (mName) =>
            mName &&
            review.managerName &&
            (mName.toLowerCase() === review.managerName.toLowerCase() ||
              review.managerName.toLowerCase().includes(mName.toLowerCase())),
        );
        const isDirectEvaluator =
          review.evaluatorId === managerUser?.loginId ||
          review.managerName === managerUser?.loginId ||
          review.managerName === (managerUser?.aliasLoginName || managerUser?.fullName);

        if (!isMappedByEmployeeId && !isMappedByManagerName && !isDirectEvaluator) {
          throw new ForbiddenException("You do not have access to this employee's review.");
        }
      }

      const sanitized = this.sanitizeReview(review);
      const displayStatus = this.getDisplayStatus(review);
      const isEvaluated = displayStatus === 'Reviewed';
      const averageScore = this.computeAverageRatingScore(review.ratings);
      const parsedRating = averageScore !== null ? averageScore : this.extractRatingValue(review.finalRating);
      const hasFinalRating = parsedRating !== null || Boolean(review.finalRating);
      const isTokenValid = Boolean(
        revealToken && review.id && isRevealTokenValid(revealToken, review.id, review.employeeId),
      );
      const isEvaluator = Boolean(
        managerUser &&
        (isPrivileged ||
          review.evaluatorId === managerUser.loginId ||
          review.managerName === managerUser.loginId ||
          (managerUser.aliasLoginName && review.managerName === managerUser.aliasLoginName) ||
          (managerUser.fullName && review.managerName === managerUser.fullName) ||
          (review.evaluatorName && (review.evaluatorName === managerUser.aliasLoginName || review.evaluatorName === managerUser.fullName)))
      );
      const shouldHideRating = hasFinalRating && !isEvaluator && !isTokenValid;

      const [empDetail, userRecord] = await Promise.all([
        this.employeeDetailsRepository.findOne({ where: { employeeId: review.employeeId } }),
        this.userRepository.findOne({ where: { loginId: review.employeeId } }),
      ]);

      let assignment: ReviewAssignment | null = null;
      if (review.assignmentId) {
        assignment = await this.assignmentRepository.findOne({ where: { id: review.assignmentId } });
      }
      if (!assignment) {
        const variants = this.normalizeQuarterVariants(review.quarter);
        assignment = await this.assignmentRepository.findOne({
          where: { employeeId: review.employeeId, quarter: In(variants) },
          order: { id: 'DESC' },
        });
      }

      const employeeRole = this.resolveEmployeeRole(empDetail || undefined, userRecord || undefined, review);
      const isManagerEmployee = employeeRole === 'MANAGER';

      const rawQuarter = review.quarter || assignment?.quarter || '';
      const quarterCode = rawQuarter.match(/Q[1-4]/i)?.[0]?.toUpperCase() || rawQuarter || 'Q1';
      const resolvedFy = review.financialYear || assignment?.financialYear || this.resolveFinancialYear(rawQuarter);
      const assignedDateStr = review.assignedAt
        ? new Date(review.assignedAt).toISOString().slice(0, 10)
        : assignment?.assignedAt
          ? new Date(assignment.assignedAt).toISOString().slice(0, 10)
          : null;
      const deadlineDateStr = review.deadlineAt
        ? new Date(review.deadlineAt).toISOString().slice(0, 10)
        : assignment?.deadlineAt
          ? new Date(assignment.deadlineAt).toISOString().slice(0, 10)
          : null;
      const { fromDate: defaultFromDate, toDate: defaultToDate } = this.resolveQuarterDateRange(
        rawQuarter,
        resolvedFy,
        assignedDateStr,
        deadlineDateStr,
      );
      const fromDate = assignedDateStr || defaultFromDate;
      const toDate = deadlineDateStr || defaultToDate;
      const fullQuarter = `${quarterCode}-${resolvedFy.replace(/\s+/g, '')}`;
      const assignmentNotes = review.notes || assignment?.notes || null;

      const unsubmittedStatuses = ['draft', 'assigned', 'not started', 'not_started', 'in progress', 'in_progress'];
      const revStatusLower = (review.reviewStatus || '').trim().toLowerCase();
      const statusLower = (review.status || '').trim().toLowerCase();

      const isSubmitted = Boolean(
        review.submittedDate ||
        (statusLower && !unsubmittedStatuses.includes(statusLower)) ||
        (revStatusLower && !unsubmittedStatuses.includes(revStatusLower))
      );

      const submissionDetails = isSubmitted
        ? {
          overview: sanitized.overview || null,
          projects: sanitized.projects || [],
          achievements: sanitized.achievements || [],
          challenges: sanitized.challenges || [],
          learningGoals: sanitized.learningGoals || [],
          teamContribution: sanitized.teamContribution || [],
          companyEnvironment: sanitized.companyEnvironment || null,
        }
        : {
          overview: null,
          projects: [],
          achievements: [],
          challenges: [],
          learningGoals: [],
          teamContribution: [],
          companyEnvironment: null,
        };

      return {
        ...sanitized,
        ...submissionDetails,
        isSubmitted,
        isReviewSubmitted: isSubmitted,
        submittedDate: isSubmitted ? review.submittedDate : null,
        quarter: quarterCode,
        quarterCode,
        fullQuarter,
        financialYear: resolvedFy,
        fromDate,
        toDate,
        startDate: fromDate,
        endDate: toDate,
        assignedAt: review.assignedAt || assignment?.assignedAt || fromDate,
        deadlineAt: review.deadlineAt || assignment?.deadlineAt || toDate,
        notes: assignmentNotes,
        description: assignmentNotes,
        assignmentNotes,
        status: displayStatus,
        reviewStatus: displayStatus,
        reviewedOn: isEvaluated ? review.reviewedOn : null,
        actionType: isEvaluated ? 'view' : (isSubmitted ? 'evaluate' : 'view'),
        actionLabel: isEvaluated ? 'View Review' : (isSubmitted ? 'Evaluate Now' : 'Assigned'),
        finalRating: shouldHideRating ? null : parsedRating,
        averageRatingScore: shouldHideRating ? null : parsedRating,
        ratings: shouldHideRating ? null : sanitized.ratings,
        isFinalRatingHidden: shouldHideRating,
        hasFinalRating,
        employeeName: empDetail?.fullName || review.employeeId,
        employeeRole,
        role: employeeRole,
        department: empDetail?.department || 'Engineering',
        designation: empDetail?.designation || (isManagerEmployee ? 'Manager' : 'Employee'),
        managerName: review.managerName || assignment?.assignedByName,
        evaluatorName: review.evaluatorName || (isEvaluated ? review.managerName : null),
        evaluatorRole: review.evaluatorRole || (isEvaluated ? (review.managerName === 'CEO & Admin' ? 'CEO' : 'MANAGER') : null),
        evaluatorId: review.evaluatorId || null,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error fetching submission for ${employeeId}:`, error);
      throw new HttpException(
        error.message || 'Failed to fetch quarterly review submission',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Evaluate employee or manager quarterly review */
  async evaluateReview(managerUser: any, id: number, dto: ManagerEvaluationDto, isDraft: boolean = false) {
    try {
      if (!id || isNaN(id)) {
        throw new HttpException(
          `Invalid review ID '${id}' received. Expected a numeric quarterly review record ID.`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const review = await this.quarterlyReviewRepository.findOne({ where: { id } });
      if (!review) {
        throw new NotFoundException(`Quarterly review with ID ${id} not found.`);
      }

      const reviewStatus = isDraft
        ? (dto.reviewStatus || AppraisalReviewStatus.UNDER_REVIEW)
        : (dto.reviewStatus || AppraisalReviewStatus.REVIEWED);

      if (!isDraft) {
        const strengths = (dto.strengths || '').trim();
        const improvements = (dto.improvements || '').trim();
        const remarks = (dto.remarks || '').trim();
        if (!strengths || !improvements || !remarks) {
          throw new HttpException(
            'All feedback fields (strengths, areas for improvement, and remarks) are required to submit the final review.',
            HttpStatus.BAD_REQUEST,
          );
        }

        let ratingsObj: any = dto.ratings;
        if (typeof ratingsObj === 'string') {
          try {
            ratingsObj = JSON.parse(ratingsObj);
          } catch {
            ratingsObj = null;
          }
        }

        const normalizedRatings: Record<string, number> = {};
        if (Array.isArray(ratingsObj)) {
          ratingsObj.forEach((item: any) => {
            if (item && item.category) {
              normalizedRatings[String(item.category).toLowerCase().trim()] = Number(item.rating);
            }
          });
        } else if (ratingsObj && typeof ratingsObj === 'object') {
          for (const [k, v] of Object.entries(ratingsObj)) {
            normalizedRatings[k.toLowerCase().trim()] = Number(v);
          }
        }

        const requiredCategories = ['productivity', 'quality', 'ownership', 'communication', 'collaboration', 'innovation'];
        const hasAllRatings = requiredCategories.every((cat) => {
          const val =
            normalizedRatings[cat] ??
            normalizedRatings[`${cat} & output`] ??
            normalizedRatings[`${cat} skills`];
          return typeof val === 'number' && !isNaN(val) && val > 0;
        });

        if (!hasAllRatings) {
          throw new HttpException(
            'All 6 performance category ratings are mandatory to submit the final review.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (dto.quarter?.trim()) {
        const selectedQuarter = dto.quarter.trim();
        const fiscalYear = review.quarter?.match(/FY\d{4}-\d{2}/i)?.[0];
        review.quarter = fiscalYear && !/FY\d{4}-\d{2}/i.test(selectedQuarter)
          ? `${selectedQuarter} ${fiscalYear}`
          : selectedQuarter;
      }
      review.ratings = dto.ratings !== undefined ? dto.ratings : review.ratings;
      review.strengths = dto.strengths !== undefined ? dto.strengths : review.strengths;
      review.improvements = dto.improvements !== undefined ? dto.improvements : review.improvements;
      review.remarks = dto.remarks !== undefined ? dto.remarks : review.remarks;
      if (dto.ratings !== undefined) {
        const avgScore = this.computeAverageRatingScore(dto.ratings);
        if (avgScore !== null) {
          review.averageRating = Number(avgScore.toFixed(1));
          review.finalRating = avgScore.toFixed(1);
        } else {
          review.finalRating = dto.finalRating !== undefined ? dto.finalRating : review.finalRating;
        }
      } else {
        review.finalRating = dto.finalRating !== undefined ? dto.finalRating : review.finalRating;
      }
      review.reviewStatus = reviewStatus;
      review.reviewedOn = isDraft ? null : new Date();
      review.status = isDraft ? ReviewStatus.UNDER_REVIEW : ReviewStatus.REVIEWED;

      // Track evaluator identity and role
      const evaluatorName =
        managerUser?.aliasLoginName || managerUser?.fullName || managerUser?.name || managerUser?.loginId || 'Evaluator';
      review.evaluatorName = evaluatorName;
      review.evaluatorRole = managerUser?.userType || 'MANAGER';
      review.evaluatorId = managerUser?.loginId || null;

      const updated = await this.quarterlyReviewRepository.save(review);
      this.logger.log(
        `[evaluateReview] Successfully saved review ID=${id} as ${reviewStatus} by evaluator=${evaluatorName}`,
      );

      // Sync matching assignment status
      try {
        if (updated.assignmentId) {
          await this.assignmentRepository.update(updated.assignmentId, {
            status: isDraft ? AssignmentStatus.UNDER_REVIEW : AssignmentStatus.REVIEWED,
          });
        } else {
          const variants = this.normalizeQuarterVariants(updated.quarter);
          const matchingAssignment = await this.assignmentRepository.findOne({
            where: { employeeId: updated.employeeId, quarter: In(variants) },
            order: { id: 'DESC' },
          });
          if (matchingAssignment) {
            matchingAssignment.status = isDraft ? AssignmentStatus.UNDER_REVIEW : AssignmentStatus.REVIEWED;
            await this.assignmentRepository.save(matchingAssignment);
          }
        }
      } catch (syncErr: any) {
        this.logger.warn(`Could not sync assignment status on evaluateReview: ${syncErr.message}`);
      }

      if (!isDraft) {
        setImmediate(async () => {
          try {
            await this.sendQuarterlyReviewNotificationEmail(managerUser, updated, dto);

            // 1. Send in-app notification to the Employee
            try {
              await this.notificationsService.createNotification({
                employeeId: updated.employeeId,
                title: 'Quarterly Review Evaluated',
                message: `Your manager ${evaluatorName} has completed and submitted your Quarterly Review evaluation for ${updated.quarter}.`,
                type: 'success',
              });
              this.logger.log(`Created in-app notification for employee ${updated.employeeId} on review evaluation`);
            } catch (empNotifErr: any) {
              this.logger.warn(`Could not create notification for employee ${updated.employeeId}: ${empNotifErr.message}`);
            }

            // 2. Send in-app notification to the Manager / Evaluator
            if (managerUser?.loginId && managerUser.loginId !== updated.employeeId) {
              try {
                const empDetail = await this.employeeDetailsRepository.findOne({
                  where: { employeeId: updated.employeeId },
                });
                const empName = empDetail?.fullName || updated.employeeId;
                await this.notificationsService.createNotification({
                  employeeId: managerUser.loginId,
                  title: 'Quarterly Review Evaluated',
                  message: `You have completed and submitted the evaluation for ${empName} (${updated.quarter}).`,
                  type: 'info',
                });
                this.logger.log(`Created in-app notification for manager ${managerUser.loginId}`);
              } catch (mgrNotifErr: any) {
                this.logger.warn(`Could not create notification for manager ${managerUser.loginId}: ${mgrNotifErr.message}`);
              }
            }

            // 3. Send in-app notification and email to Admin and CEO
            try {
              const adminCeoUsers = await this.userRepository.find({
                where: [
                  { userType: UserType.ADMIN },
                  { userType: UserType.CEO },
                  { role: UserType.ADMIN },
                  { role: UserType.CEO },
                ],
              }).catch(() => []);

              const adminCeoIds = new Set<string>(['Admin', 'CEO']);
              const adminCeoEmails = new Set<string>();

              for (const u of adminCeoUsers) {
                if (u.loginId && u.loginId !== managerUser?.loginId) {
                  adminCeoIds.add(u.loginId);
                }
              }

              const adminCeoEmployees = await this.employeeDetailsRepository.find({
                where: [
                  { designation: Like('%Admin%') },
                  { designation: Like('%CEO%') },
                ],
              }).catch(() => []);

              for (const emp of adminCeoEmployees) {
                if (emp.employeeId && emp.employeeId !== managerUser?.loginId) {
                  adminCeoIds.add(emp.employeeId);
                  if (emp.email) adminCeoEmails.add(emp.email);
                }
              }

              if (adminCeoIds.size > 0) {
                const extraEmps = await this.employeeDetailsRepository.find({
                  where: { employeeId: In(Array.from(adminCeoIds)) },
                }).catch(() => []);
                for (const emp of extraEmps) {
                  if (emp.email) adminCeoEmails.add(emp.email);
                }
              }

              const empDetail = await this.employeeDetailsRepository.findOne({
                where: { employeeId: updated.employeeId },
              });
              const empName = empDetail?.fullName || updated.employeeId;

              // Dispatch in-app notifications to Admin and CEO
              for (const recipientId of adminCeoIds) {
                try {
                  await this.notificationsService.createNotification({
                    employeeId: recipientId,
                    title: 'Quarterly Review Evaluated',
                    message: `${evaluatorName} has completed and submitted the evaluation for ${empName} (${updated.quarter}).`,
                    type: 'info',
                  });
                  this.logger.log(`Created in-app notification for Admin/CEO ${recipientId}`);
                } catch (adminNotifErr: any) {
                  this.logger.warn(`Could not create notification for Admin/CEO ${recipientId}: ${adminNotifErr.message}`);
                }
              }

              // Dispatch email notifications to Admin and CEO
              for (const adminEmail of adminCeoEmails) {
                try {
                  const quarter = updated.quarter || 'Quarterly Review';
                  const subject = `Quarterly Performance Review Completed - ${empName} (${quarter})`;
                  const text = `Hello,\n\n${evaluatorName} has completed and submitted the quarterly review evaluation for ${empName} (${quarter}).\n\nFinal Performance Rating: ${updated.finalRating || dto.finalRating || 'N/A'}\n\nRegards,\nWorkSphere Team`;
                  const htmlContent = getAppraisalQuarterEvaluatedTemplate({
                    employeeName: empName,
                    quarter,
                    managerName: evaluatorName,
                    finalRating: updated.finalRating || dto.finalRating || undefined,
                    strengths: dto.strengths || updated.strengths || undefined,
                    improvements: dto.improvements || updated.improvements || undefined,
                    remarks: dto.remarks || updated.remarks || undefined,
                    portalUrl: process.env.FRONTEND_URL || 'https://worksphere.inventech-developer.in',
                  });
                  await this.emailService.sendEmail(adminEmail, subject, text, htmlContent);
                  this.logger.log(`Queued review evaluation email for Admin/CEO (${adminEmail})`);
                } catch (adminMailErr: any) {
                  this.logger.warn(`Could not send review evaluation email to Admin/CEO: ${adminMailErr.message}`);
                }
              }
            } catch (adminResolveErr: any) {
              this.logger.warn(`Could not resolve or notify Admin/CEO on review evaluation: ${adminResolveErr.message}`);
            }
          } catch (notifErr: any) {
            this.logger.warn(`Could not dispatch evaluation notifications: ${notifErr.message}`);
          }
        });
      }

      return this.getSubmissionById(managerUser, updated.id);
    } catch (err: any) {
      // Log the real underlying error instead of exposing only a generic frontend 500.
      this.logger.error(`evaluateReview failed for id=${id}: ${err.message}`, err.stack);

      if (err instanceof HttpException) {
        throw err;
      }

      throw new HttpException(
        `Failed to submit review: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Send email notification to employee when manager submits final review */
  private async sendQuarterlyReviewNotificationEmail(
    managerUser: any,
    review: QuarterlyReview,
    dto: ManagerEvaluationDto,
  ): Promise<void> {
    try {
      const empDetail = await this.employeeDetailsRepository.findOne({
        where: { employeeId: review.employeeId },
      });

      if (!empDetail || !empDetail.email) {
        this.logger.warn(
          `Cannot send review notification email: No email address found for employeeId '${review.employeeId}'`,
        );
        return;
      }

      const managerName =
        managerUser?.aliasLoginName ||
        managerUser?.fullName ||
        managerUser?.name ||
        'Your Manager';
      const employeeName = empDetail.fullName || review.employeeId;
      const quarter = review.quarter || 'Quarterly Review';
      const finalRating = dto.finalRating || review.finalRating || 'N/A';
      const strengths = dto.strengths || review.strengths || 'N/A';
      const improvements = dto.improvements || review.improvements || 'N/A';
      const remarks = dto.remarks || review.remarks || 'N/A';

      const subject = `Quarterly Performance Review Completed - ${quarter}`;
      const text = `Hello ${employeeName},\n\nYour quarterly review for ${quarter} has been evaluated and submitted by ${managerName}.\n\nFinal Performance Rating: ${finalRating}\n\nKey Strengths:\n${strengths}\n\nAreas for Improvement:\n${improvements}\n\nManager Remarks:\n${remarks}\n\nPlease log in to the portal to view your complete evaluation details.`;

      const frontendUrl = process.env.FRONTEND_URL || 'https://worksphere.inventech-developer.in';

      const htmlContent = getAppraisalQuarterEvaluatedTemplate({
        employeeName,
        quarter,
        managerName,
        finalRating,
        strengths,
        improvements,
        remarks,
        portalUrl: frontendUrl,
      });

      await this.emailService.sendEmail(
        empDetail.email,
        subject,
        text,
        htmlContent,
      );

      this.logger.log(
        `Successfully queued quarterly review notification email for employee '${review.employeeId}' (${empDetail.email})`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to send quarterly review notification email to employee '${review.employeeId}': ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Get all review assignments created by or accessible to the manager.
   * Privileged users (Admin, CEO) can view all assignments or filter by quarter.
   */
  async getAssignedReviews(managerUser: any, quarter?: string): Promise<any[]> {
    try {
      const isPrivileged = this.isPrivilegedUser(managerUser);
      const managerLoginId = managerUser?.loginId || '';
      const managerFullName = managerUser?.aliasLoginName || managerUser?.fullName || managerUser?.name || managerLoginId;

      this.logger.log(
        `[getAssignedReviews] manager='${managerLoginId}', role='${managerUser?.userType}', quarter='${quarter || 'all'}'`,
      );

      let assignments: ReviewAssignment[] = [];

      if (isPrivileged) {
        const qb = this.assignmentRepository.createQueryBuilder('assignment').orderBy('assignment.id', 'DESC');
        if (quarter?.trim()) {
          const variants = this.normalizeQuarterVariants(quarter);
          qb.andWhere('assignment.quarter IN (:...variants)', { variants });
        }
        assignments = await qb.getMany();
      } else {
        const { employeeIds: mappedEmployeeIds } = await this.getMappedEmployeeIds(managerUser);

        const qb = this.assignmentRepository.createQueryBuilder('assignment');
        if (mappedEmployeeIds && mappedEmployeeIds.length > 0) {
          qb.where(
            '(assignment.assignedById = :managerLoginId OR assignment.assignedByName = :managerFullName OR assignment.employeeId IN (:...mappedEmployeeIds))',
            { managerLoginId, managerFullName, mappedEmployeeIds },
          );
        } else {
          qb.where(
            '(assignment.assignedById = :managerLoginId OR assignment.assignedByName = :managerFullName)',
            { managerLoginId, managerFullName },
          );
        }

        if (quarter?.trim()) {
          const variants = this.normalizeQuarterVariants(quarter);
          qb.andWhere('assignment.quarter IN (:...variants)', { variants });
        }

        qb.orderBy('assignment.id', 'DESC');
        assignments = await qb.getMany();
      }

      if (!assignments || assignments.length === 0) {
        return [];
      }

      const employeeIds = Array.from(new Set(assignments.map((a) => a.employeeId)));
      const quarters = Array.from(new Set(assignments.map((a) => a.quarter)));

      const [employees, reviews] = await Promise.all([
        this.employeeDetailsRepository.find({
          where: { employeeId: In(employeeIds) },
        }),
        this.quarterlyReviewRepository.find({
          where: {
            employeeId: In(employeeIds),
            quarter: In(quarters),
          },
        }),
      ]);

      const empMap = new Map(employees.map((e) => [e.employeeId, e]));
      const reviewMap = new Map(
        reviews.map((r) => [`${r.employeeId}_${this.normalizeQ(r.quarter)}`, r]),
      );

      const now = new Date();

      return assignments.map((assignment) => {
        const emp = empMap.get(assignment.employeeId);
        const review = reviewMap.get(`${assignment.employeeId}_${this.normalizeQ(assignment.quarter)}`);

        const isDeadlinePassed = now > new Date(assignment.deadlineAt);
        let liveStatus = assignment.status;
        if (
          assignment.isAccessOpen === 1 &&
          isDeadlinePassed &&
          assignment.status !== AssignmentStatus.SUBMITTED &&
          assignment.status !== AssignmentStatus.COMPLETED
        ) {
          liveStatus = AssignmentStatus.AUTO_SUBMITTED;
        }

        const resolvedRole = assignment.role || this.resolveEmployeeRole(emp);
        return {
          id: assignment.id,
          assignmentId: assignment.id,
          employeeId: assignment.employeeId,
          employeeName: emp?.fullName || assignment.employeeName || assignment.employeeId,
          role: resolvedRole,
          employeeRole: resolvedRole,
          designation: emp?.designation || 'Team Member',
          department: emp?.department || '—',
          email: emp?.email || null,
          quarter: this.formatQuarterHyphen(assignment.quarter),
          financialYear: assignment.financialYear || null,
          assignedById: assignment.assignedById,
          assignedByName: assignment.assignedByName,
          assignedByRole: assignment.assignedByRole,
          assignedAt: assignment.assignedAt,
          deadlineAt: assignment.deadlineAt,
          assignmentStatus: liveStatus,
          status: liveStatus,
          isAccessOpen: Boolean(assignment.isAccessOpen),
          isDeadlinePassed,
          accessRequestEligibleUntil: assignment.accessRequestEligibleUntil,
          notes: assignment.notes || null,
          reviewId: review ? review.id : null,
          reviewStatus: review ? (review.status || ReviewStatus.ASSIGNED) : ReviewStatus.ASSIGNED,
          isSubmitted: review ? (review.status === ReviewStatus.AWAITING_REVIEW || review.status === ReviewStatus.UNDER_REVIEW || review.status === ReviewStatus.REVIEWED) : false,
          submittedAt: review?.submittedDate || null,
          finalRating: review?.finalRating || null,
          averageRating: review?.averageRating != null ? parseFloat(String(review.averageRating)) : null,
          canEvaluate: review ? (review.status === ReviewStatus.AWAITING_REVIEW || review.status === ReviewStatus.UNDER_REVIEW || review.status === ReviewStatus.REVIEWED) : false,
        };
      });
    } catch (error: any) {
      this.logger.error(`[getAssignedReviews] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch assigned reviews',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create review assignment(s) from the manager "+ Create" modal.
   *
   * - mode INDIVIDUAL: assigns only to the supplied employeeIds (validated against mapped employees).
   * - mode ALL: resolves all employees mapped to this manager (or all employees for admin/CEO).
   *
   * Duplicate assignments (same employeeId + quarter string) are silently skipped
   * and counted in `skipped` so the frontend can surface the information.
   */
  async createReviewAssignment(
    managerUser: any,
    dto: CreateReviewAssignmentDto,
  ): Promise<{ created: number; skipped: number; assignments: any[] }> {
    const managerLoginId: string = managerUser?.loginId || '';
    const managerFullName: string =
      managerUser?.aliasLoginName || managerUser?.fullName || managerUser?.name || managerLoginId;
    const managerRole: string = (managerUser?.userType || managerUser?.role || 'MANAGER').toUpperCase();
    const isPrivileged = this.isPrivilegedUser(managerUser);

    // ── 1. Resolve target employee IDs ──────────────────────────────────────
    let targetEmployeeIds: string[] = [];

    if (dto.mode === AssignmentMode.INDIVIDUAL) {
      const rawIds = (dto.employeeIds ?? []).map((id) => String(id).trim()).filter(Boolean);
      if (rawIds.length === 0) {
        throw new BadRequestException('At least one employeeId must be provided when mode is INDIVIDUAL.');
      }

      if (!isPrivileged) {
        const { employeeIds: mappedIds } = await this.getMappedEmployeeIds(managerUser);
        const mappedSet = new Set(mappedIds);
        const unauthorized = rawIds.filter((id) => !mappedSet.has(id));
        if (unauthorized.length > 0) {
          throw new ForbiddenException(
            `The following employee IDs are not mapped to your account: ${unauthorized.join(', ')}`,
          );
        }
      }
      targetEmployeeIds = rawIds;
    } else {
      // ALL mode
      if (isPrivileged) {
        const all = await this.employeeDetailsRepository.find({ select: ['employeeId'] });
        targetEmployeeIds = all.map((e) => e.employeeId).filter((id) => Boolean(id) && id !== managerLoginId);
      } else {
        const { employeeIds: mappedIds } = await this.getMappedEmployeeIds(managerUser);
        targetEmployeeIds = mappedIds;
      }

      if (targetEmployeeIds.length === 0) {
        throw new BadRequestException('No team members are mapped to your account. Cannot assign to all.');
      }
    }

    // ── 2. Build canonical quarter string e.g. "Q2 FY2026-27" ───────────────
    let financialYear = (dto.financialYear || '').trim();
    if (!financialYear) {
      const now = new Date();
      const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      financialYear = `FY${yr}-${String(yr + 1).slice(2)}`;
    }
    const canonicalQuarter = `${dto.quarter} ${financialYear}`.trim();

    // ── 3. Detect duplicates & access requests ──────────────────────────────
    const quarterCode = dto.quarter.match(/Q[1-4]/i)?.[0]?.toUpperCase() || dto.quarter.trim();
    const existingAssignments = await this.assignmentRepository.find({
      where: { employeeId: In(targetEmployeeIds) },
    });
    const matchedAssignments = existingAssignments.filter((a) => {
      const aQ = (a.quarter || '').toUpperCase().trim();
      const aCode = aQ.match(/Q[1-4]/i)?.[0]?.toUpperCase();
      return aQ === canonicalQuarter.toUpperCase() || (quarterCode && aCode === quarterCode) || aQ === dto.quarter.toUpperCase();
    });
    const existingAssignmentMap = new Map(matchedAssignments.map((a) => [a.employeeId, a]));

    const existingReviews = await this.quarterlyReviewRepository.find({
      where: { employeeId: In(targetEmployeeIds) },
    });
    const matchedReviews = existingReviews.filter((r) => {
      const rQ = (r.quarter || '').toUpperCase().trim();
      const rCode = rQ.match(/Q[1-4]/i)?.[0]?.toUpperCase();
      return rQ === canonicalQuarter.toUpperCase() || (quarterCode && rCode === quarterCode) || rQ === dto.quarter.toUpperCase();
    });
    const existingReviewMap = new Map(matchedReviews.map((r) => [r.employeeId, r]));

    const accessRequests = await this.accessRequestRepository.find({
      where: { employeeId: In(targetEmployeeIds) },
      order: { id: 'DESC' },
    });
    const accessRequestMap = new Map<string, QuarterlyReviewAccessRequest>();
    for (const ar of accessRequests) {
      const qNorm = (ar.quarter || '').trim().toUpperCase();
      const cNorm = canonicalQuarter.trim().toUpperCase();
      const qCode = qNorm.match(/Q[1-4]/i)?.[0]?.toUpperCase();
      const cCode = cNorm.match(/Q[1-4]/i)?.[0]?.toUpperCase();
      if ((qNorm === cNorm || (qCode && qCode === cCode)) && !accessRequestMap.has(ar.employeeId)) {
        accessRequestMap.set(ar.employeeId, ar);
      }
    }

    // ── 4. Fetch employee details for enrichment ─────────────────────────────
    const employeeDetails = await this.employeeDetailsRepository.find({
      where: { employeeId: In(targetEmployeeIds) },
    });
    const empDetailMap = new Map(employeeDetails.map((e) => [e.employeeId, e]));

    // ── 5. Build assignment rows ─────────────────────────────────────────────
    const effectiveStartDate = (dto.startDate && dto.startDate.trim()) || new Date().toISOString().slice(0, 10);
    try {
      assertAssignmentDateRange(effectiveStartDate, dto.endDate);
    } catch (dateErr: any) {
      throw new BadRequestException(dateErr.message || 'Invalid assignment date range.');
    }

    const now = new Date();
    const { assignedAt: computedAssignedAt, deadlineAt: computedDeadlineAt } = computeAssignmentDeadline(
      effectiveStartDate,
      dto.endDate,
      now,
    );
    const endDateObj = computedDeadlineAt;
    const toCreate: ReviewAssignment[] = [];
    const skippedIds: string[] = [];

    for (const empId of targetEmployeeIds) {
      const existingAssignment = existingAssignmentMap.get(empId);
      const existingReview = existingReviewMap.get(empId);
      const accessReq = accessRequestMap.get(empId);

      if (existingAssignment || existingReview) {
        if (!accessReq) {
          skippedIds.push(empId);
          this.logger.log(`[createReviewAssignment] Skipping ${empId} — already assigned for ${canonicalQuarter} without access request`);
          continue;
        }

        // Employee has an access request for this quarter: renew assignment & approve request
        if (!existingAssignment) continue;
        const empRole = this.resolveEmployeeRole(empDetailMap.get(empId));
        existingAssignment.role = empRole;
        existingAssignment.deadlineAt = computedDeadlineAt;
        existingAssignment.financialYear = financialYear || existingAssignment.financialYear;
        existingAssignment.assignedAt = computedAssignedAt;
        existingAssignment.assignedById = managerLoginId;
        existingAssignment.assignedByName = managerFullName;
        existingAssignment.status = AssignmentStatus.ASSIGNED;
        existingAssignment.isAccessOpen = 1;
        existingAssignment.notes = dto.description;
        existingAssignment.reminder2dSentAt = null;
        existingAssignment.reminder1dSentAt = null;
        existingAssignment.reminderTodaySentAt = null;
        existingAssignment.deadlineExpiredNotifiedAt = null;
        existingAssignment.accessRequestEligibleUntil = null;
        existingAssignment.updatedBy = managerFullName;
        const updated = await this.assignmentRepository.save(existingAssignment);
        toCreate.push(updated);

        if (accessReq.status === AccessRequestStatus.PENDING) {
          accessReq.status = AccessRequestStatus.APPROVED;
          accessReq.approvedById = managerLoginId;
          accessReq.approvedByName = managerFullName;
          accessReq.approvedAt = now;
          accessReq.extensionDeadline = computedDeadlineAt;
          accessReq.accessUntil = computedDeadlineAt;
          accessReq.remarks = dto.description || 'Access re-assigned by manager';
          accessReq.updatedBy = managerFullName;
          await this.accessRequestRepository.save(accessReq);
        }

        let review = await this.quarterlyReviewRepository.findOne({
          where: [
            { employeeId: empId, quarter: canonicalQuarter },
            { employeeId: empId, quarter: dto.quarter },
          ],
        });
        if (review) {
          review.financialYear = financialYear || review.financialYear;
          review.assignedAt = computedAssignedAt;
          review.deadlineAt = computedDeadlineAt;
          review.accessUntil = computedDeadlineAt;
          review.notes = dto.description;
          review.isReopened = 1;
          review.autoSubmitted = 0;
          if (review.status === ReviewStatus.AUTO_SUBMITTED) {
            review.status = ReviewStatus.DRAFT;
          }
          review.updatedBy = managerFullName;
          await this.quarterlyReviewRepository.save(review);
        }
        continue;
      }

      const empDetail = empDetailMap.get(empId);
      const empRole = this.resolveEmployeeRole(empDetail);
      const assignment = this.assignmentRepository.create({
        employeeId: empId,
        employeeName: empDetail?.fullName || empId,
        role: empRole,
        quarter: canonicalQuarter,
        financialYear,
        assignedById: managerLoginId,
        assignedByName: managerFullName,
        assignedByRole: (managerRole as 'MANAGER' | 'ADMIN' | 'CEO') || 'MANAGER',
        assignedAt: computedAssignedAt,
        deadlineAt: computedDeadlineAt,
        status: AssignmentStatus.ASSIGNED,
        isAccessOpen: 1,
        notes: dto.description,
        assignmentMode: dto.mode as any,
        accessRequestEligibleUntil: null,
        reminder2dSentAt: null,
        reminder1dSentAt: null,
        reminderTodaySentAt: null,
        deadlineExpiredNotifiedAt: null,
      });

      toCreate.push(assignment);
    }

    let savedAssignments: ReviewAssignment[] = [];
    if (toCreate.length > 0) {
      savedAssignments = await this.assignmentRepository.save(toCreate);
      this.logger.log(
        `[createReviewAssignment] Created ${savedAssignments.length} assignment(s) for ${canonicalQuarter} by ${managerLoginId}`,
      );

      for (const saved of savedAssignments) {
        try {
          const matchingReview = await this.quarterlyReviewRepository.findOne({
            where: [
              { employeeId: saved.employeeId, quarter: canonicalQuarter },
              { employeeId: saved.employeeId, quarter: dto.quarter },
            ],
          });
          if (matchingReview) {
            matchingReview.notes = dto.description;
            matchingReview.assignmentId = saved.id;
            matchingReview.assignedAt = saved.assignedAt;
            matchingReview.deadlineAt = saved.deadlineAt;
            await this.quarterlyReviewRepository.save(matchingReview);
          }
        } catch { }
      }
    }

    // ── 6. Send notifications & emails ─────────────────────────────────────
    const frontendUrl = process.env.FRONTEND_URL || 'https://worksphere.inventech-developer.in';
    const successfullyAssignedEmployees: { id: string; name: string }[] = [];

    for (const saved of savedAssignments) {
      const emp = empDetailMap.get(saved.employeeId);
      const empName = emp?.fullName || saved.employeeName || saved.employeeId;
      successfullyAssignedEmployees.push({ id: saved.employeeId, name: empName });

      // In-app notification
      try {
        await this.notificationsService.createNotification({
          employeeId: saved.employeeId,
          title: `Quarterly Review Assigned: ${canonicalQuarter}`,
          message: `Your manager ${managerFullName} has assigned you a quarterly review for ${canonicalQuarter}. Please complete it by ${endDateObj.toLocaleDateString('en-IN')}.`,
          type: 'info',
        });
      } catch (notifErr: any) {
        this.logger.warn(
          `[createReviewAssignment] Could not notify employee ${saved.employeeId}: ${notifErr.message}`,
        );
      }

      // Email notification to employee
      try {
        let empEmail = emp?.email;
        if (!empEmail) {
          const empRec = await this.employeeDetailsRepository.findOne({ where: { employeeId: saved.employeeId } });
          empEmail = empRec?.email;
        }

        if (empEmail) {
          const subject = `Quarterly Review Assigned: ${canonicalQuarter}`;
          const plainText = `Congratulations ${empName}, your quarterly review for ${canonicalQuarter} has been assigned by ${managerFullName} (${managerRole}). Please log in to WorkSphere and complete your self-assessment before the deadline: ${endDateObj.toLocaleDateString('en-IN')} ${endDateObj.toLocaleTimeString('en-IN')}.`;
          const htmlContent = getAppraisalQuarterAssignedTemplate({
            employeeName: empName,
            quarter: canonicalQuarter,
            assignedByName: managerFullName,
            assignedByRole: managerRole,
            deadlineAt: endDateObj,
            startDate: effectiveStartDate,
            financialYear,
            notes: dto.description || null,
            portalUrl: frontendUrl,
          });
          await this.emailService.sendEmail(empEmail, subject, plainText, htmlContent);
          this.logger.log(`[createReviewAssignment] Sent assignment email to employee ${saved.employeeId} (${empEmail})`);
        } else {
          this.logger.warn(`[createReviewAssignment] No email address found for employee ${saved.employeeId}`);
        }
      } catch (mailErr: any) {
        this.logger.warn(
          `[createReviewAssignment] Could not send assignment email to employee ${saved.employeeId}: ${mailErr.message}`,
        );
      }
    }

    // Confirmation email to Manager / Assigner
    if (savedAssignments.length > 0) {
      try {
        let managerEmail = managerUser?.email;
        if (!managerEmail && managerLoginId) {
          const empRec = await this.employeeDetailsRepository.findOne({ where: { employeeId: managerLoginId } });
          managerEmail = empRec?.email;
        }

        if (managerEmail) {
          const empNamesList = successfullyAssignedEmployees.map((e) => `${e.name} (${e.id})`);
          const subject = `Quarterly Review Assignment Confirmed: ${canonicalQuarter}`;
          const plainText = `Hello ${managerFullName},\n\nYou have successfully assigned quarterly appraisal reviews for ${canonicalQuarter} to ${savedAssignments.length} employee(s):\n${empNamesList.join('\n')}\n\nSubmission Deadline: ${endDateObj.toLocaleDateString('en-IN')} ${endDateObj.toLocaleTimeString('en-IN')}.\n\nRegards,\nWorkSphere Team`;
          const htmlContent = getAppraisalQuarterAssignedManagerTemplate({
            managerName: managerFullName,
            quarter: canonicalQuarter,
            assignedCount: savedAssignments.length,
            assignedEmployeeNames: empNamesList,
            deadlineAt: endDateObj,
            startDate: effectiveStartDate,
            financialYear,
            notes: dto.description || null,
            portalUrl: frontendUrl,
          });
          await this.emailService.sendEmail(managerEmail, subject, plainText, htmlContent);
          this.logger.log(`[createReviewAssignment] Sent confirmation email to manager ${managerLoginId} (${managerEmail})`);
        } else {
          this.logger.warn(`[createReviewAssignment] No email address found for manager ${managerLoginId}`);
        }
      } catch (mgrMailErr: any) {
        this.logger.warn(
          `[createReviewAssignment] Could not send confirmation email to manager ${managerLoginId}: ${mgrMailErr.message}`,
        );
      }
    }

    // ── 7. Build response ────────────────────────────────────────────────────
    const assignmentResponseRows = savedAssignments.map((a) => {
      const emp = empDetailMap.get(a.employeeId);
      return {
        id: a.id,
        employeeId: a.employeeId,
        employeeName: emp?.fullName || a.employeeName || a.employeeId,
        designation: emp?.designation || 'Employee',
        department: emp?.department || '—',
        quarter: a.quarter,
        financialYear: a.financialYear,
        status: a.status,
        assignmentMode: a.assignmentMode,
        assignedAt: a.assignedAt,
        startDate: a.assignedAt ? new Date(a.assignedAt).toISOString().slice(0, 10) : null,
        fromDate: a.assignedAt ? new Date(a.assignedAt).toISOString().slice(0, 10) : null,
        toDate: a.deadlineAt ? new Date(a.deadlineAt).toISOString().slice(0, 10) : null,
        deadlineAt: a.deadlineAt,
        notes: a.notes,
        assignedByName: a.assignedByName,
      };
    });

    return {
      created: savedAssignments.length,
      skipped: skippedIds.length,
      assignments: assignmentResponseRows,
    };
  }
}
