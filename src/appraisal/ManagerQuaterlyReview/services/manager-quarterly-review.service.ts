import { Injectable, NotFoundException, ForbiddenException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { QuarterlyReview } from '../../quarterlyReview/entities/quarterly-review.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../../managerMapping/entities/managerMapping.entity';
import { EmployeeDetails } from '../../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerEvaluationDto } from '../dto/manager-evaluation.dto';
import { ReviewStatus } from '../../quarterlyReview/enums/quarterly-review.enum';

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
export class ManagerQuarterlyReviewService {
  private readonly logger = new Logger(ManagerQuarterlyReviewService.name);

  constructor(
    @InjectRepository(QuarterlyReview)
    private readonly quarterlyReviewRepository: Repository<QuarterlyReview>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
  ) {}

  /** Get list of employee IDs mapped to the manager */
  private async getMappedEmployeeIds(managerUser: any): Promise<{ employeeIds: string[]; managerNames: string[] }> {
    const managerLoginId = managerUser?.loginId || '';
    const managerFullName = managerUser?.aliasLoginName || managerUser?.fullName || managerUser?.name || managerLoginId;

    this.logger.log(`Fetching mapped employees for manager loginId='${managerLoginId}', fullName='${managerFullName}'`);

    const mappings = await this.managerMappingRepository.find({
      where: [
        { managerName: managerFullName, status: ManagerMappingStatus.ACTIVE },
        { managerName: managerLoginId, status: ManagerMappingStatus.ACTIVE },
        { employeeId: managerLoginId, status: ManagerMappingStatus.ACTIVE },
      ],
    });

    const employeeIds = Array.from(new Set(mappings.map((m) => m.employeeId).filter(Boolean)));
    const managerNames = Array.from(new Set([managerFullName, managerLoginId, ...mappings.map((m) => m.managerName)].filter(Boolean)));

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

  /** Build initials from a full name, e.g. "Aditi S" -> "AS" */
  private getInitials(name: string): string {
    if (!name) return '--';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  /** Map internal status values to the display label used in the UI badge */
  private getDisplayStatus(review: QuarterlyReview): string {
    // Manager hasn't started evaluating yet, but employee has submitted
    if (review.status === ReviewStatus.SUBMITTED && !review.reviewStatus) {
      return 'Under Review';
    }
    if (review.status === ReviewStatus.IN_REVIEW) {
      return 'Under Review';
    }
    if (review.status === ReviewStatus.APPROVED || review.reviewStatus === ReviewStatus.REVIEWED) {
      return 'Reviewed';
    }
    if (review.status === ReviewStatus.COMPLETED) {
      return 'Completed';
    }
    return review.reviewStatus || review.status || 'Not Started';
  }

  /**
   * Categorize a raw review into the same buckets used for the dashboard
   * stat cards (Pending / In Review / Completed). This is the single
   * source of truth for "which bucket does this row belong to" — reused
   * by both getStats() and the status-tab filter in getFilteredRows() so
   * the two can never disagree with each other again.
   */
  private getStatusBucket(r: QuarterlyReview): 'pending' | 'in-review' | 'completed' | 'other' {
    if (['Reviewed', 'Approved', 'Completed'].includes(r.reviewStatus || '')) {
      return 'completed';
    }
    if (r.reviewStatus === 'In Review' || r.status === ReviewStatus.IN_REVIEW) {
      return 'in-review';
    }
    if (!r.reviewStatus || r.status === ReviewStatus.SUBMITTED) {
      return 'pending';
    }
    return 'other';
  }

  /**
   * Normalize a status-tab key for comparison — lowercases and strips
   * spaces/hyphens/underscores so "In Review", "in-review", and
   * "in_review" all compare equal regardless of which exact format the
   * frontend's StatusTabFilter enum uses.
   */
  private normalizeStatusFilter(status: string): string {
    return status.toLowerCase().replace(/[\s_-]/g, '');
  }

  /** Known rating band labels mapped to their representative numeric score */
  private static readonly RATING_LABEL_MAP: Record<string, number> = {
    'outstanding': 5.0,
    'exceeds expectations': 4.5,
    'meets expectations': 3.5,
    'needs improvement': 2.5,
    'unsatisfactory': 1.5,
  };

  /**
   * Extract a numeric rating from finalRating, which may be stored as:
   *  - a known label: "Exceeds Expectations" -> 4.5 (via RATING_LABEL_MAP)
   *  - a plain number string: "4.5"
   *  - a range label: "Exceeds Expectations (4.0 - 4.9)" -> averages to 4.45, rounded to 4.5
   * Returns null if no number can be found.
   */
  private extractRatingValue(finalRating: string | null): number | null {
    if (!finalRating) return null;

    // Known label with no embedded numbers, e.g. "Exceeds Expectations"
    const normalized = finalRating.trim().toLowerCase();
    if (normalized in ManagerQuarterlyReviewService.RATING_LABEL_MAP) {
      return ManagerQuarterlyReviewService.RATING_LABEL_MAP[normalized];
    }

    // Plain numeric value, e.g. "4.5"
    const directNumber = parseFloat(finalRating);
    if (!isNaN(directNumber) && /^\s*[\d.]+\s*$/.test(finalRating)) {
      return directNumber;
    }

    // Range inside a label, e.g. "(4.0 - 4.9)"
    const rangeMatch = finalRating.match(/(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1]);
      const high = parseFloat(rangeMatch[3]);
      return Math.round(((low + high) / 2) * 10) / 10;
    }

    // Fallback: first standalone number anywhere in the string
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

      return this.getSubmissionById(managerUser, updated.id);
    } catch (err) {
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
}
