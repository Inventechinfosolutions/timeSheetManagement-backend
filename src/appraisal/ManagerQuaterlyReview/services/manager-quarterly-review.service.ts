import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { QuarterlyReview } from '../../quarterlyReview/entities/quarterly-review.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../../managerMapping/entities/managerMapping.entity';
import { EmployeeDetails } from '../../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerEvaluationDto } from '../dto/manager-evaluation.dto';
import { ReviewStatus } from '../../quarterlyReview/enums/quarterly-review.enum';
import { EmailService } from '../../../email/email.service';
import { NotificationsService } from '../../../notifications/Services/notifications.service';

/** Filters + pagination params accepted by getTeamSubmissions */
export interface TeamSubmissionsFilters {
  quarter?: string;
  status?: string;
  quarterCard?: string;
  year?: string;
  search?: string;
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
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.ensureQuarterlyReviewAuditColumns();
  }

  /**
   * QuarterlyReview extends BaseEntity, which declares createdAt, updatedAt,
   * createdBy, updatedBy — TypeORM includes these in EVERY SELECT against
   * quarterly_reviews. If the table itself never got these columns (e.g. it
   * was created by a hand-written migration that predates BaseEntity, or one
   * that only covered the domain-specific fields), every read against this
   * entity fails with "Unknown column 'QuarterlyReview.createdAt' in 'field
   * list'" — which is exactly what getStats() and getTeamSubmissions() were
   * surfacing as a bare 500, since neither method wraps its DB calls in a
   * try/catch.
   *
   * This checks INFORMATION_SCHEMA for which of the four BaseEntity columns
   * are actually present on quarterly_reviews, and adds only the ones that
   * are missing — matching the exact column types TypeORM generates from
   * @CreateDateColumn/@UpdateDateColumn/@Column in BaseEntity. Non-fatal,
   * like the check above: a failure here is logged with its full cause
   * rather than silently ignored, but the app keeps booting either way.
   */
  private async ensureQuarterlyReviewAuditColumns() {
    const requiredColumns = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

    try {
      const existing: Array<{ COLUMN_NAME: string }> = await this.quarterlyReviewRepository.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quarterly_reviews'`,
      );
      const existingNames = new Set(existing.map((c) => c.COLUMN_NAME));
      const missing = requiredColumns.filter((c) => !existingNames.has(c));

      if (missing.length === 0) {
        this.logger.log('[DB Schema] quarterly_reviews already has all BaseEntity audit columns.');
        return;
      }

      this.logger.warn(`[DB Schema] quarterly_reviews is missing audit columns: ${missing.join(', ')}. Adding them now.`);

      // NOTE: these type strings assume MySQL's default TypeORM output for
      // @CreateDateColumn()/@UpdateDateColumn() with no explicit type —
      // DATETIME(6) with a fractional-second default. If `SHOW CREATE TABLE
      // manager_mapping` (an existing BaseEntity-derived table with the same
      // four columns) shows a different type/precision in your database,
      // update the strings below to match exactly so every BaseEntity table
      // stays consistent.
      const columnDefs: Record<string, string> = {
        createdAt: '`createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)',
        updatedAt: '`updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)',
        createdBy: '`createdBy` VARCHAR(255) NULL',
        updatedBy: '`updatedBy` VARCHAR(255) NULL',
      };

      const alterClauses = missing.map((c) => `ADD COLUMN ${columnDefs[c]}`).join(', ');
      await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ${alterClauses}`);

      this.logger.log(`[DB Schema] Added missing audit columns to quarterly_reviews: ${missing.join(', ')}.`);
    } catch (err: any) {
      this.logger.error(`[DB Schema] Failed to verify/add audit columns on quarterly_reviews: ${err.message}`, err.stack);
    }
  }

  /** Get list of employee IDs mapped to the manager */
  private async getMappedEmployeeIds(managerUser: any): Promise<{ employeeIds: string[]; managerNames: string[] }> {
    const managerLoginId = managerUser?.loginId || '';
    const managerFullName = managerUser?.aliasLoginName || managerUser?.fullName || managerUser?.name || managerLoginId;

    this.logger.log(
      `[getMappedEmployeeIds] manager loginId='${managerLoginId}', fullName='${managerFullName}'`,
    );

    // Identify mappings by:
    //  1. manager_name = full name from employee profile (e.g. "John Doe")
    //  2. manager_name = loginId (e.g. "abc") — covers cases where loginId is stored as the name
    //  3. manager_id  = loginId
    // NOTE: We deliberately do NOT include { employeeId: managerLoginId } here —
    // that would accidentally pick up rows where the manager happens to share an
    // employee_id value, and then add the manager themselves to their own team list.
    const mappings = await this.managerMappingRepository.find({
      where: [
        { managerName: managerFullName, status: ManagerMappingStatus.ACTIVE },
        { managerName: managerLoginId, status: ManagerMappingStatus.ACTIVE },
        { managerId: managerLoginId, status: ManagerMappingStatus.ACTIVE },
      ],
    });

    // De-duplicate and exclude the manager's own loginId from the employee list
    const employeeIds = Array.from(
      new Set(
        mappings
          .map((m) => m.employeeId)
          .filter((id) => Boolean(id) && id !== managerLoginId),
      ),
    );

    const managerNames = Array.from(
      new Set(
        [managerFullName, managerLoginId, ...mappings.map((m) => m.managerName)].filter(Boolean),
      ),
    );

    this.logger.log(
      `[getMappedEmployeeIds] Found ${mappings.length} mapping row(s), ${employeeIds.length} unique employee(s): [${employeeIds.join(', ')}]`,
    );

    return { employeeIds, managerNames };
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

  private sanitizeReview(review: QuarterlyReview | null): any {
    if (!review) return null;
    return {
      ...review,
      projects: this.parseJsonIfNeeded(review.projects) ?? [],
      achievements: this.parseJsonIfNeeded((review as any).achievements) ?? [],
      challenges: this.parseJsonIfNeeded((review as any).challenges) ?? [],
      learningGoals: this.parseJsonIfNeeded(review.learningGoals) ?? [],
      teamContribution: this.parseJsonIfNeeded(review.teamContribution) ?? [],
      companyEnvironment: this.parseJsonIfNeeded(review.companyEnvironment) ?? null,
      ratings: this.parseJsonIfNeeded(review.ratings) ?? null,
    };
  }

  private getInitials(name: string): string {
    if (!name) return '--';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  private getDisplayStatus(review: QuarterlyReview): string {
    if (review.status === ReviewStatus.SUBMITTED && !review.reviewStatus) return 'Under Review';
    if (review.status === ReviewStatus.IN_REVIEW) return 'Under Review';
    if (review.status === ReviewStatus.APPROVED || review.reviewStatus === ReviewStatus.REVIEWED) return 'Reviewed';
    if (review.status === ReviewStatus.COMPLETED) return 'Completed';
    return review.reviewStatus || review.status || 'Not Started';
  }

  private getStatusBucket(r: QuarterlyReview): 'pending' | 'in-review' | 'completed' | 'other' {
    if (['Reviewed', 'Approved', 'Completed'].includes(r.reviewStatus || '')) return 'completed';
    if (r.reviewStatus === 'In Review' || r.status === ReviewStatus.IN_REVIEW) return 'in-review';
    if (!r.reviewStatus || r.status === ReviewStatus.SUBMITTED) return 'pending';
    return 'other';
  }

  private normalizeStatusFilter(status: string): string {
    return status.toLowerCase().replace(/[\s_-]/g, '');
  }

  private extractRatingValue(finalRating: string | null): number | null {
    if (!finalRating) return null;
    const normalized = finalRating.trim().toLowerCase();
    const labels: Record<string, number> = {
      outstanding: 5.0,
      'exceeds expectations': 4.5,
      'meets expectations': 3.5,
      'needs improvement': 2.5,
      unsatisfactory: 1.5,
    };
    if (normalized in labels) return labels[normalized];
    const directNumber = parseFloat(finalRating);
    if (!isNaN(directNumber) && /^\s*[\d.]+\s*$/.test(finalRating)) return directNumber;
    const rangeMatch = finalRating.match(/(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/);
    if (rangeMatch) return Math.round(((parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[3])) / 2) * 10) / 10;
    const singleMatch = finalRating.match(/\d+(\.\d+)?/);
    return singleMatch ? parseFloat(singleMatch[0]) : null;
  }

  /** Shape a single review row exactly to what the manager's table UI expects */
  private toTableRow(review: QuarterlyReview, empDetail?: EmployeeDetails) {
    const sanitized = this.sanitizeReview(review);
    const employeeName = empDetail?.fullName || review.employeeId;
    const displayStatus = this.getDisplayStatus(review);
    const isEvaluated = displayStatus === 'Reviewed' || displayStatus === 'Completed';

    // finalRating stored as varchar. It may be a plain number ("4.5") or a label
    // like "Exceeds Expectations (4.0 - 4.9)" — extract the numeric value either way.
    const parsedRating = this.extractRatingValue(review.finalRating);

    return {
      ...sanitized,
      employeeId: review.employeeId,
      employeeName,
      employeeInitials: this.getInitials(employeeName),
      department: empDetail?.department || 'Engineering',
      designation: empDetail?.designation || 'Employee',
      quarter: review.quarter,
      status: displayStatus,
      finalRating: parsedRating,
      lastModified: review.reviewedOn || (review as any).updatedAt || review.submittedDate || null,
      actionType: isEvaluated ? 'view' : 'evaluate',
      actionLabel: isEvaluated ? 'View Review' : 'Evaluate Now',
    };
  }

  /** Best-effort fiscal-year label for a table row, e.g. "2025-26" */
  private getRowFiscalYear(row: any): string {
    const fyMatch = (row.quarter || '').match(/FY(\d{4}-\d{2})/i);
    if (fyMatch) return fyMatch[1];
    if (row.lastModified) {
      const y = new Date(row.lastModified).getFullYear();
      return `FY${y}-${String(y + 1).slice(-2)}`;
    }
    return '';
  }

  /**
   * Fetch + enrich + filter ALL rows matching the manager's team and the
   * given filters, with NO pagination applied. This is the single source of
   * truth for "what rows match" — used both to build a page of results and
   * to compute accurate stats/filter-option lists across the whole team.
   */
  private async getFilteredRows(managerUser: any, filters: TeamSubmissionsFilters = {}): Promise<any[]> {
    const { employeeIds, managerNames } = await this.getMappedEmployeeIds(managerUser);

    this.logger.log(`Found ${employeeIds.length} mapped employees for manager`);

    const whereConditions: any[] = [];
    if (employeeIds.length > 0) {
      whereConditions.push({ employeeId: In(employeeIds) });
    }
    if (managerNames.length > 0) {
      managerNames.forEach((mName) => {
        whereConditions.push({ managerName: mName });
      });
    }

    // If no conditions match (e.g. no mapping), fallback to empty
    if (whereConditions.length === 0) {
      return [];
    }

    let reviews = await this.quarterlyReviewRepository.find({
      where: whereConditions,
      order: { id: 'DESC' },
    });

    // Filter out draft reviews that employee hasn't submitted yet.
    // Managers should see reviews with status Submitted, In Review, Reviewed, Approved, Completed
    reviews = reviews.filter((r) => r.status !== ReviewStatus.DRAFT);

    if (filters.quarter) {
      reviews = reviews.filter((r) => r.quarter?.toLowerCase().includes(filters.quarter!.toLowerCase()));
    }

    // Status-tab filter (All / Pending / In Review / Completed). Uses the
    // same getStatusBucket() classification as getStats(), so the tab
    // results and the dashboard stat-card counts always agree. Comparison
    // is normalized (case/space/hyphen-insensitive) so it doesn't matter
    // whether the frontend sends "pending", "Pending", "in-review",
    // "in_review", or "In Review".
    if (filters.status) {
      const target = this.normalizeStatusFilter(filters.status);
      reviews = reviews.filter((r) => this.normalizeStatusFilter(this.getStatusBucket(r)) === target);
    }

    // Fetch employee details to enrich response
    const allEmpIds = Array.from(new Set(reviews.map((r) => r.employeeId)));
    let empDetailsMap: Record<string, EmployeeDetails> = {};
    if (allEmpIds.length > 0) {
      const empDetails = await this.employeeDetailsRepository.find({
        where: { employeeId: In(allEmpIds) },
      });
      empDetailsMap = empDetails.reduce((acc, curr) => {
        acc[curr.employeeId] = curr;
        return acc;
      }, {} as Record<string, EmployeeDetails>);
    }

    let rows = reviews.map((r) => this.toTableRow(r, empDetailsMap[r.employeeId]));

    // Quarter "quick filter" cards (Q1/Q2/Q3/Q4), separate from the exact-match
    // quarter dropdown filter above.
    if (filters.quarterCard) {
      const qc = filters.quarterCard.toUpperCase();
      rows = rows.filter((row) => (row.quarter || '').toUpperCase().includes(qc));
    }

    if (filters.year) {
      rows = rows.filter((row) => this.getRowFiscalYear(row) === filters.year);
    }

    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((row) => {
        const matchesName = row.employeeName?.toLowerCase().includes(q);
        const matchesId = row.employeeId?.toLowerCase().includes(q);
        const matchesDept = row.department?.toLowerCase().includes(q);
        return matchesName || matchesId || matchesDept;
      });
    }

    return rows;
  }

  /**
   * Fetch team submissions for the requesting manager, filtered and paginated
   * server-side. Each call re-runs the filter against the DB-backed rows and
   * returns only the slice for the requested page — page 2 returns page 2's
   * rows, and navigating back to page 1 returns page 1's rows again, rather
   * than relying on a client-side cache of the full list.
   */
  async getTeamSubmissions(
    managerUser: any,
    filters: TeamSubmissionsFilters = {},
  ): Promise<PaginatedResult<any>> {
    const rows = await this.getFilteredRows(managerUser, filters);

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
  }

  /** Distinct quarter values available for this manager's team, for populating the dropdown */
  async getQuarterOptions(managerUser: any): Promise<string[]> {
    const rows = await this.getFilteredRows(managerUser);
    return Array.from(new Set(rows.map((r) => r.quarter).filter(Boolean)));
  }

  /** Return every active employee mapped to this manager for the reminder modal. */
  async getNotificationCandidates(managerUser: any) {
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

    // Return ALL employees assigned to this manager — including those who have
    // completed reviews. isCompleted lets the frontend distinguish who still
    // needs action without hiding anyone from the notification modal.
    return employeeIds.map((employeeId) => {
      const employee = employees.find((item) => item.employeeId === employeeId);
      const review = latestReviewByEmployee.get(employeeId);
      const isCompleted = Boolean(
        review &&
        ([ReviewStatus.APPROVED, ReviewStatus.COMPLETED].includes(review.status) ||
          review.reviewStatus === ReviewStatus.REVIEWED),
      );

      return {
        // ── Identity ───────────────────────────────────────────────────────────
        employeeId,
        employeeName: employee?.fullName || employeeId,
        designation: employee?.designation || 'Employee',
        department: employee?.department || '—',
        // ── Full employee details ──────────────────────────────────────────────
        email: employee?.email || null,
        joiningDate: employee?.joiningDate || null,
        employmentType: employee?.employmentType || null,
        gender: employee?.gender || null,
        userStatus: employee?.userStatus || null,
        // ── Review details ─────────────────────────────────────────────────────
        quarter: review?.quarter || null,
        reviewStatus: review?.reviewStatus || review?.status || null,
        submittedDate: review?.submittedDate || null,
        averageRating: review?.averageRating != null
          ? parseFloat(String(review.averageRating))
          : null,
        finalRating: review?.finalRating || null,
        managerName: review?.managerName || null,
        // ── Status flag ────────────────────────────────────────────────────────
        isCompleted,
      };
    });
  }

  /** Send in-app reminders to mapped employees who have not completed a review. */
  async sendReviewNotifications(managerUser: any, employeeIds: string[]) {
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
  }

  /** Calculate stats for manager dashboard — always computed over the full (unpaginated) team */
  async getStats(managerUser: any) {
    const reviews = await this.getFilteredRows(managerUser);

    const totalSubmissions = reviews.length;
    const pendingReviews = reviews.filter((r) => !r.reviewStatus || r.reviewStatus === 'Pending' || r.status === ReviewStatus.SUBMITTED && r.reviewStatus !== 'Reviewed').length;
    const inReview = reviews.filter((r) => r.reviewStatus === 'In Review' || r.status === ReviewStatus.IN_REVIEW).length;
    const completed = reviews.filter((r) => ['Reviewed', 'Approved', 'Completed'].includes(r.reviewStatus || '')).length;

    const { employeeIds } = await this.getMappedEmployeeIds(managerUser);

    return {
      totalTeamMembers: employeeIds.length || totalSubmissions,
      totalSubmissions,
      pendingReviews,
      inReview,
      completed,
    };
  }

  /** Get single submission details — scoped to the logged-in manager's mapped employees */
  async getSubmissionById(managerUser: any, id: number) {
    const review = await this.quarterlyReviewRepository.findOne({ where: { id } });
    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found.`);
    }

    // Ensure this manager is actually allowed to see this employee's review —
    // prevents fetching another manager's team member by guessing/incrementing
    // the numeric id in the URL.
    const { employeeIds, managerNames } = await this.getMappedEmployeeIds(managerUser);
    const isMappedByEmployeeId = employeeIds.includes(review.employeeId);
    const isMappedByManagerName = managerNames.includes((review as any).managerName);
    if (!isMappedByEmployeeId && !isMappedByManagerName) {
      throw new ForbiddenException("You do not have access to this employee's review.");
    }

    const sanitized = this.sanitizeReview(review);
    const empDetail = await this.employeeDetailsRepository.findOne({ where: { employeeId: review.employeeId } });

    return {
      ...sanitized,
      employeeName: empDetail?.fullName || review.employeeId,
      department: empDetail?.department || 'Engineering',
      designation: empDetail?.designation || 'Employee',
    };
  }

  /**
   * Get single submission details by employeeId instead of the row's numeric id.
   * An employee may have multiple review rows (one per quarter), so `quarter`
   * narrows it down; without it, the latest matching row (highest id) is returned.
   * Same manager-scoping guard as getSubmissionById.
   */
  async getSubmissionByEmployeeId(managerUser: any, employeeId: string, quarter?: string) {
    const { employeeIds, managerNames } = await this.getMappedEmployeeIds(managerUser);

    const whereConditions: any = quarter ? { employeeId, quarter } : { employeeId };

    const review = await this.quarterlyReviewRepository.findOne({
      where: whereConditions,
      order: { id: 'DESC' },
    });

    if (!review) {
      throw new NotFoundException(`Quarterly review for employee ID ${employeeId} not found.`);
    }

    const isMappedByEmployeeId = employeeIds.includes(review.employeeId);
    const isMappedByManagerName = managerNames.includes((review as any).managerName);
    if (!isMappedByEmployeeId && !isMappedByManagerName) {
      throw new ForbiddenException("You do not have access to this employee's review.");
    }

    const sanitized = this.sanitizeReview(review);
    const empDetail = await this.employeeDetailsRepository.findOne({ where: { employeeId: review.employeeId } });

    return {
      ...sanitized,
      employeeName: empDetail?.fullName || review.employeeId,
      department: empDetail?.department || 'Engineering',
      designation: empDetail?.designation || 'Employee',
    };
  }

  /** Manager evaluate employee quarterly review */
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
        ? (dto.reviewStatus || ReviewStatus.IN_REVIEW)
        : (dto.reviewStatus || ReviewStatus.REVIEWED);

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
      review.finalRating = dto.finalRating !== undefined ? dto.finalRating : review.finalRating;
      review.reviewStatus = reviewStatus;
      review.reviewedOn = new Date();
      review.status = isDraft ? ReviewStatus.IN_REVIEW : ReviewStatus.APPROVED;

      const updated = await this.quarterlyReviewRepository.save(review);
      this.logger.log(`Manager evaluated review id=${id}, status=${updated.reviewStatus}, finalRating=${updated.finalRating}`);

      if (!isDraft) {
        await this.sendQuarterlyReviewNotificationEmail(managerUser, updated, dto);
      }

      return this.getSubmissionById(managerUser, updated.id);
    } catch (err: any) {
      // Log the real underlying error (visible in your NestJS terminal) instead of
      // letting it surface only as a generic "Internal server error" on the frontend.
      this.logger.error(`evaluateReview failed for id=${id}: ${err.message}`, err.stack);

      // Preserve intended HTTP status codes (400/404) instead of masking everything as 500
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

      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 15px;">
            <h2 style="color: #4f46e5; margin: 0; font-size: 24px;">Quarterly Review Submitted</h2>
            <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">${quarter}</p>
          </div>
          <p style="color: #374151; font-size: 16px; line-height: 1.5;">Dear <strong>${employeeName}</strong>,</p>
          <p style="color: #374151; font-size: 16px; line-height: 1.5;">
            Your manager, <strong>${managerName}</strong>, has completed and submitted your Quarterly Review evaluation for <strong>${quarter}</strong>.
          </p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; border-radius: 6px; margin: 24px 0;">
            <p style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px;"><strong>Final Performance Rating:</strong> <span style="color: #4f46e5; font-size: 17px; font-weight: bold;">${finalRating}</span></p>
            ${strengths !== 'N/A' ? `<p style="margin: 8px 0; color: #334155; font-size: 14px;"><strong>Performance Strengths:</strong><br>${strengths.replace(/\n/g, '<br>')}</p>` : ''}
            ${improvements !== 'N/A' ? `<p style="margin: 8px 0; color: #334155; font-size: 14px;"><strong>Areas for Improvement:</strong><br>${improvements.replace(/\n/g, '<br>')}</p>` : ''}
            ${remarks !== 'N/A' ? `<p style="margin: 8px 0; color: #334155; font-size: 14px;"><strong>Manager Remarks:</strong><br>${remarks.replace(/\n/g, '<br>')}</p>` : ''}
          </div>

          <p style="color: #374151; font-size: 15px; line-height: 1.5;">
            You can log into Worksphere portal to view your complete quarterly review feedback and rating breakdown.
          </p>

          <div style="text-align: center; margin: 35px 0;">
            <a href="${frontendUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">View Quarterly Review</a>
          </div>

          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">This is an automated notification from Worksphere Appraisal System. Please do not reply directly to this email.</p>
        </div>
      `;

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

}