import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { EmployeePerformance } from '../entities/employee_performance.entity';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import {
  CreateQuarterlyReviewDto,
  QueryQuarterlyReviewDto,
  SearchQuarterlyReviewDto,
  UpdateQuarterlyReviewDto,
  ManagerEvaluationDto,
  ExportQuarterlyReviewDto,
  ReassignQuarterlyReviewDto,
} from '../dto/quarterly_review.dto';
import {
  QuarterlyReviewStatus,
  RATING_DESCRIPTIONS,
  ReviewEmployeeType,
  ReviewAssignedBy,
  RatingVisibilityStatus,
  QuaterlyEnum,
  ReviewPeriod,
  YEARLY_QUARTERS,
} from '../enums/quarterly_review.enums';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { User } from '../../users/entities/user.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { hasAdminAccess, isCeoOrGmUser } from '../../users/utils/admin-access';
import { AnnualAppraisalService } from './annual_appraisal.service';
import { AppraisalNoticeService } from './appraisal_notice.service';
import {
  duplicateAssignmentMessage,
  yearlyAlreadyAssignedMessage,
  yearlyBlocksQuarterlyMessage,
  quarterlyBlocksYearlyMessage,
  DEADLINE_AFTER_ASSIGNED_MESSAGE,
  EMPLOYEE_NOT_FOUND_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
  QUARTER_WINDOW_UNAVAILABLE_MESSAGE,
  RATING_NOT_READY_MESSAGE,
  quarterNotAssignableMessage,
  APPRAISAL_EDIT_WINDOW_HOURS,
  appraisalWindowMs,
  SUBMITTABLE_PERFORMANCE_STATUSES,
} from '../constants/appraisal.constants';
import { isLockedReviewStatus, isOneDayBeforeDeadline, reviewAccessFlags, shouldCloseRenewedAccess } from '../utils/review-access';
import { MasterFinancialYearService } from '../../master/service/master-financialyear.service';
import { UsersService } from '../../users/service/user.service';
import { RevealedEvaluationDto } from '../dto/reveal_rating.dto';
import { createAuditEntry, appendAuditEntry } from '../utils/audit-history.helper';
import { computeResumeStep, overlayPerformanceView } from '../utils/performance-steps';
import { AppraisalAuditEntry } from '../interfaces/appraisal_audit.interface';
import {
  YearlyQuarterReviewSnapshot,
  YearlyQuarterReviews,
} from '../interfaces/yearly_quarter_reviews.interface';
import { AppraisalMappingService } from './appraisal_mapping.service';
import { AppraisalAssignerType } from '../entities/appraisal_mapping.entity';

export interface EnrichedQuarterlyReview extends QuarterlyReview {
  performanceDetails?: (EmployeePerformance & {
    canRequestEdit?: boolean;
    remainingRequestHours?: number;
    canEdit?: boolean;
    isEditWindowActive?: boolean;
    step?: number;
  }) | null;
  canRequestEdit?: boolean;
  remainingRequestHours?: number;
  canEdit?: boolean;
  isEditWindowActive?: boolean;
  isOverdue?: boolean;
}

@Injectable()
export class QuarterlyReviewService {
  private readonly logger = new Logger(QuarterlyReviewService.name);

  constructor(
    @InjectRepository(QuarterlyReview)
    private readonly reviewRepository: Repository<QuarterlyReview>,
    @InjectRepository(EmployeePerformance)
    private readonly performanceRepository: Repository<EmployeePerformance>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    private readonly annualService: AnnualAppraisalService,
    private readonly noticeService: AppraisalNoticeService,
    private readonly usersService: UsersService,
    private readonly financialYearService: MasterFinancialYearService,
    private readonly appraisalMappingService: AppraisalMappingService,
  ) {}

  private toReviewQuarter(quarter: string): QuaterlyEnum {
    switch (quarter) {
      case QuaterlyEnum.Q1:
        return QuaterlyEnum.Q1;
      case QuaterlyEnum.Q2:
        return QuaterlyEnum.Q2;
      case QuaterlyEnum.Q3:
        return QuaterlyEnum.Q3;
      case QuaterlyEnum.Q4:
        return QuaterlyEnum.Q4;
      default:
        throw new BadRequestException(QUARTER_WINDOW_UNAVAILABLE_MESSAGE);
    }
  }

  private isYearlyAssignment(createDto: Pick<CreateQuarterlyReviewDto, 'quarter' | 'reviewPeriod'>): boolean {
    const period = String(createDto.reviewPeriod || '').trim().toUpperCase();
    const quarter = String(createDto.quarter || '').trim().toUpperCase();
    return (
      period === ReviewPeriod.YEARLY ||
      quarter === 'YEARLY' ||
      quarter === QuaterlyEnum.YEARLY ||
      quarter.includes('Q1, Q2') ||
      quarter.includes('Q1,Q2') ||
      quarter.includes('Q1-Q4') ||
      typeof createDto.quarter === 'object'
    );
  }

  private isYearlyReviewRecord(review: Pick<QuarterlyReview, 'reviewPeriod' | 'quarter'>): boolean {
    if (review.reviewPeriod === ReviewPeriod.YEARLY) return true;
    return this.isYearlyQuarterStored(review.quarter);
  }

  private isQuarterlyReviewRecord(review: Pick<QuarterlyReview, 'reviewPeriod' | 'quarter'>): boolean {
    if (this.isYearlyReviewRecord(review)) return false;
    const quarter = String(review.quarter || '').trim().toUpperCase();
    return (
      quarter === QuaterlyEnum.Q1 ||
      quarter === QuaterlyEnum.Q2 ||
      quarter === QuaterlyEnum.Q3 ||
      quarter === QuaterlyEnum.Q4
    );
  }

  /** Mode A/B exclusivity: one FY cannot mix YEARLY and Q1–Q4 assignments. */
  private assertExclusiveReviewMode(
    employeeId: string,
    financialYear: string,
    assigningYearly: boolean,
    existingReviews: QuarterlyReview[],
  ): void {
    if (assigningYearly) {
      const quarterlyRows = existingReviews.filter((r) => this.isQuarterlyReviewRecord(r));
      if (quarterlyRows.length > 0) {
        throw new BadRequestException(quarterlyBlocksYearlyMessage(employeeId, financialYear));
      }
      return;
    }
    const yearlyRows = existingReviews.filter((r) => this.isYearlyReviewRecord(r));
    if (yearlyRows.length > 0) {
      throw new BadRequestException(yearlyBlocksQuarterlyMessage(employeeId, financialYear));
    }
  }

  private emptyYearlyQuarterReviews(): YearlyQuarterReviews {
    return { Q1: null, Q2: null, Q3: null, Q4: null };
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toYearlySnapshot(
    review: QuarterlyReview,
    slotQuarter: QuaterlyEnum,
    performance?: EmployeePerformance | null,
  ): YearlyQuarterReviewSnapshot {
    return {
      id: review.id,
      quarter: slotQuarter,
      reviewPeriod: review.reviewPeriod || ReviewPeriod.YEARLY,
      status: review.status,
      assignedDate: review.assignedDate,
      deadlineDate: review.deadlineDate,
      submittedDate: review.submittedDate,
      reviewedDate: review.reviewedDate,
      productivity: this.toNullableNumber(review.productivity),
      qualityOfWork: this.toNullableNumber(review.qualityOfWork),
      technicalJobSkills: this.toNullableNumber(review.technicalJobSkills),
      ownershipResponsibility: this.toNullableNumber(review.ownershipResponsibility),
      communication: this.toNullableNumber(review.communication),
      teamCollaboration: this.toNullableNumber(review.teamCollaboration),
      innovationProblemSolving: this.toNullableNumber(review.innovationProblemSolving),
      overallPerformanceRating: this.toNullableNumber(review.overallPerformanceRating),
      finalRating: this.toNullableNumber(review.finalRating),
      ratingDescription: review.ratingDescription,
      performanceStrengths: review.performanceStrengths,
      areasOfImprovement: review.areasOfImprovement,
      managerComment: review.managerComment,
      goalsForNextReviewPeriod: review.goalsForNextReviewPeriod,
      careerGrowthRecommendation: review.careerGrowthRecommendation,
      reviewOutcome: review.reviewOutcome,
      performanceAction: review.performanceAction,
      managerConfirmation: Boolean(review.managerConfirmation),
      assignerConfirmation: Boolean(review.assignerConfirmation),
      description: review.description,
      performanceId: performance?.id ?? review.performanceId,
      performance: performance
        ? {
            id: performance.id,
            status: performance.status,
            submittedAt: performance.submittedAt,
            stepOverview: performance.stepOverview,
            stepAchievements: performance.stepAchievements,
            stepTeamwork: performance.stepTeamwork,
            stepLearning: performance.stepLearning,
            stepEnvironment: performance.stepEnvironment,
            stepFinalReview: performance.stepFinalReview,
          }
        : null,
    };
  }

  private async buildYearlyQuarterReviews(
    employeeId: string,
    financialYear: string,
    yearlyReview?: QuarterlyReview | null,
  ): Promise<YearlyQuarterReviews> {
    const stored = this.emptyYearlyQuarterReviews();
    const reviews = await this.reviewRepository.find({
      where: { employeeId, financialYear },
    });
    const yearly =
      yearlyReview ||
      reviews.find((review) => review.reviewPeriod === ReviewPeriod.YEARLY) ||
      null;
    const byQuarter = new Map(
      reviews
        .filter((review) => review.quarter !== QuaterlyEnum.YEARLY)
        .map((review) => [review.quarter, review]),
    );
    const performances = await this.performanceRepository.find({
      where: { employeeId, financialYear },
    });
    const performanceByQuarter = new Map(
      performances.map((item) => [item.quarter, item]),
    );
    const yearlyPerformance =
      (yearly?.performanceId
        ? performances.find((item) => item.id === yearly.performanceId)
        : null) ||
      performanceByQuarter.get(yearly?.quarter || QuaterlyEnum.YEARLY) ||
      null;

    for (const slot of YEARLY_QUARTERS) {
      const quarterReview = byQuarter.get(slot);
      if (quarterReview) {
        stored[slot] = this.toYearlySnapshot(
          quarterReview,
          slot,
          performanceByQuarter.get(slot) || yearlyPerformance,
        );
        continue;
      }
      if (yearly) {
        stored[slot] = this.toYearlySnapshot(yearly, slot, yearlyPerformance);
      }
    }
    return stored;
  }

  async syncYearlyQuarterReviews(employeeId: string, financialYear: string): Promise<void> {
    const yearlyRows = await this.reviewRepository.find({
      where: {
        employeeId,
        financialYear,
        reviewPeriod: ReviewPeriod.YEARLY,
      },
    });
    if (!yearlyRows.length) return;
    const json = await this.buildYearlyQuarterReviews(employeeId, financialYear, yearlyRows[0]);
    for (const row of yearlyRows) {
      row.reviewPeriod = ReviewPeriod.YEARLY;
      row.quarter = ['Q1', 'Q2', 'Q3', 'Q4'];
      row.yearlyQuarterReviews = json;
      await this.reviewRepository.save(row);
    }
  }

  private async propagateYearlyReview(source: QuarterlyReview): Promise<void> {
    if (source.reviewPeriod !== ReviewPeriod.YEARLY) return;
    await this.syncYearlyQuarterReviews(source.employeeId, source.financialYear);
  }

  async propagateYearlyPerformance(source: EmployeePerformance): Promise<void> {
    await this.syncYearlyQuarterReviews(source.employeeId, source.financialYear);
  }

  /**
   * Yearly can be assigned once any quarter of that financial year has started.
   */
  private async assertAssignableYear(financialYear: string): Promise<void> {
    const years = await this.financialYearService.findAll();
    const year = years.find((item) => item.financialYear === financialYear);
    if (!year?.quarters?.length) {
      throw new BadRequestException(QUARTER_WINDOW_UNAVAILABLE_MESSAGE);
    }
    const today = this.todayDate();
    const started = year.quarters.some((item) => item.startDate <= today);
    if (!started) {
      throw new BadRequestException(quarterNotAssignableMessage(`Yearly ${financialYear}`));
    }
  }

  private todayDate(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  /**
   * The current quarter and every earlier quarter can be assigned.
   * A quarter that has not started is rejected before a row, notice, or mail is created.
   */
  private async assertAssignableQuarter(quarter: QuaterlyEnum, financialYear: string): Promise<void> {
    const years = await this.financialYearService.findAll();
    const slots = years
      .flatMap((year) =>
        year.quarters.map((item) => ({
          financialYear: year.financialYear,
          quarter: this.toReviewQuarter(item.quarter),
          startDate: item.startDate,
          endDate: item.endDate,
        })),
      )
      .sort((left, right) => left.startDate.localeCompare(right.startDate));

    const today = this.todayDate();
    const started = slots.filter((slot) => slot.startDate <= today);
    if (started.length === 0) {
      throw new BadRequestException(QUARTER_WINDOW_UNAVAILABLE_MESSAGE);
    }

    const match = started.some((slot) => slot.financialYear === financialYear && slot.quarter === quarter);
    if (!match) {
      throw new BadRequestException(quarterNotAssignableMessage(`${quarter} ${financialYear}`));
    }
  }

  /**
   * FR-02: Create Quarterly Review cycle (Manager / Admin assigns)
   * Guard: An employee can only have ONE review per quarter + financial year.
   */
  private async assertCeoManagerEmployee(
    employeeId: string | null | undefined,
    user?: { userType?: string | null; role?: string | null } | null,
  ): Promise<void> {
    if (!isCeoOrGmUser(user) || !employeeId) return;
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId },
    });
    if (!employee || String(employee.role || '').toUpperCase() !== UserType.MANAGER) {
      throw new ForbiddenException(
        'CEO / General Manager can assign and review appraisals only for managers',
      );
    }
  }

  /**
   * Manager appraisals are reviewed by Admin / CEO / GM only.
   * A manager must never evaluate their own appraisal.
   */
  private async assertCanEvaluateReview(
    employeeId: string | null | undefined,
    user?: User | null,
  ): Promise<void> {
    if (!employeeId || !user) return;

    const loginId = String(user.loginId || '').trim();
    if (loginId) {
      const sessionEmployeeId = await this.resolveSessionEmployeeId(loginId);
      if (sessionEmployeeId && sessionEmployeeId === employeeId) {
        throw new ForbiddenException(
          'You cannot evaluate your own appraisal. Admin / CEO / General Manager will review it.',
        );
      }
    }

    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId },
    });
    const targetIsManager =
      String(employee?.role || '').toUpperCase() === UserType.MANAGER;

    // Manager appraisals: Admin, CEO, and GM only — never a peer manager.
    if (targetIsManager && !hasAdminAccess(user)) {
      throw new ForbiddenException(
        'Manager appraisals can only be reviewed by Admin, CEO, or General Manager.',
      );
    }

    await this.assertCeoManagerEmployee(employeeId, user);
  }

  async create(
    createDto: CreateQuarterlyReviewDto,
    user?: User,
    options?: { skipNotice?: boolean },
  ): Promise<EnrichedQuarterlyReview | EnrichedQuarterlyReview[]> {
    try {
      await this.assertCeoManagerEmployee(createDto.employeeId, user);
      const isYearly = this.isYearlyAssignment(createDto);
      const reviewPeriod = isYearly ? ReviewPeriod.YEARLY : ReviewPeriod.QUARTERLY;

      const employeeId = createDto.employeeId.trim();
      const financialYear = createDto.financialYear.trim();

      const emp = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
      });
      if (!emp) {
        throw new BadRequestException(EMPLOYEE_NOT_FOUND_MESSAGE);
      }

      this.assertDeadlineAfterAssigned(
        createDto.assignedDate,
        createDto.deadlineDate,
      );

      if (!createDto.description || !createDto.description.trim()) {
        throw new BadRequestException('Description is required.');
      }

      // Auto-populate reporting manager if not supplied
      const mapping = await this.managerMappingRepository.findOne({
        where: { employeeId },
      });

      const assignerId =
        createDto.assignerId?.trim() ||
        user?.loginId ||
        mapping?.managerId ||
        'MANAGER';
      const assignerEmp = await this.employeeDetailsRepository.findOne({
        where: [{ employeeId: assignerId }, { employeeId: user?.loginId || assignerId }],
      });
      const assignerName =
        assignerEmp?.fullName ||
        user?.aliasLoginName ||
        user?.loginId ||
        null;
      const isRoleAssigner =
        String(assignerId).toLowerCase() === 'admin' ||
        createDto.assignedBy === ReviewAssignedBy.ADMIN ||
        hasAdminAccess(user);
      const managerId =
        mapping?.managerId ||
        (!isRoleAssigner ? assignerId : null);
      // Assigned By shows the real person who assigned (same as manager name display).
      const managerName =
        assignerName ||
        mapping?.managerName ||
        'Reporting Manager';

      const assignedDate = createDto.assignedDate
        ? this.calendarDate(createDto.assignedDate)
        : this.calendarDate(new Date());
      const deadlineDate = createDto.deadlineDate ? this.calendarDate(createDto.deadlineDate) : null;
      const employeeType = createDto.employeeType || ReviewEmployeeType.EMPLOYEE;
      const description = createDto.description || null;
      const employeeName = emp?.fullName || employeeId;
      const department = emp?.department || null;
      const designation = emp?.designation || null;
      const assignedBy =
        createDto.assignedBy ||
        (isRoleAssigner ? ReviewAssignedBy.ADMIN : ReviewAssignedBy.MANAGER);

      if (isYearly) {
        await this.assertAssignableYear(financialYear);

        const allReviewsForFY = await this.reviewRepository.find({
          where: { employeeId, financialYear },
        });

        // Mode A: yearly is exclusive — reject if any Q1–Q4 rows already exist for this FY
        this.assertExclusiveReviewMode(employeeId, financialYear, true, allReviewsForFY);

        // Exactly one yearly row per employee + FY — validate, never update/delete existing IDs here
        const existingYearly = allReviewsForFY.find((r) => this.isYearlyReviewRecord(r));
        if (existingYearly) {
          throw new BadRequestException(
            yearlyAlreadyAssignedMessage(employeeId, financialYear),
          );
        }

        // One yearly row: store ["Q1","Q2","Q3","Q4"] once (never create 4 separate rows)
        const yearlyQuarterValue = ['Q1', 'Q2', 'Q3', 'Q4'];
        const existingSnapshots = await this.buildYearlyQuarterReviews(employeeId, financialYear);

        const review = this.reviewRepository.create({
          employeeId,
          financialYear,
          quarter: yearlyQuarterValue,
          reviewPeriod: ReviewPeriod.YEARLY,
          yearlyQuarterReviews: existingSnapshots,
          employeeType,
          description,
          employeeName,
          department,
          designation,
          assignedBy,
          assignerId,
          managerId,
          managerName,
          assignedDate,
          deadlineDate,
          status: QuarterlyReviewStatus.ASSIGNED,
          reassignCount: 0,
        });

        const saved = await this.reviewRepository.save(review);
        const performance = await this.ensureAssignedPerformance(
          saved.employeeId,
          saved.quarter,
          saved.financialYear,
        );

        const initAuditEntry = createAuditEntry({
          employeeId: saved.employeeId,
          managerId: saved.managerId,
          quarter: 'YEARLY (Q1-Q4)',
          financialYear: saved.financialYear,
          createdBy: saved.assignerId || 'ADMIN',
          createdDate: saved.assignedDate,
          assignedDate: saved.assignedDate,
          deadlineDate: saved.deadlineDate,
          status: QuarterlyReviewStatus.ASSIGNED,
          lastModifiedBy: saved.assignerId || 'ADMIN',
          details: 'Yearly review cycle assigned to employee',
        });

        saved.auditHistory = appendAuditEntry(saved.auditHistory, initAuditEntry);
        saved.performanceId = performance.id;
        await this.reviewRepository.save(saved);

        performance.auditHistory = appendAuditEntry(performance.auditHistory, initAuditEntry);
        await this.performanceRepository.save(performance);

        if (!options?.skipNotice) {
          await this.noticeService.notifyEmployeeOfAssignment({
            employeeId: saved.employeeId,
            employeeName: saved.employeeName || saved.employeeId,
            quarter: QuaterlyEnum.YEARLY,
            financialYear: saved.financialYear,
            deadlineDate: saved.deadlineDate,
          });
        }

        await this.syncYearlyQuarterReviews(employeeId, financialYear);
        await this.annualService.syncEmployeeAnnualRating(employeeId, financialYear);
        const enrichedList = await this.enrichReviewsWithDetails([saved]);
        return enrichedList[0];
      } else {
        const quarter = createDto.quarter;
        if (!quarter) {
          throw new BadRequestException('Quarter is required.');
        }

        if (String(quarter).trim().toUpperCase() === 'YEARLY') {
          createDto.reviewPeriod = ReviewPeriod.YEARLY;
          return this.create(createDto, user, options);
        }

        this.logger.log(
          `Creating review for employee: ${employeeId}, Quarter: ${quarter}, FY: ${financialYear}`,
        );

        await this.assertAssignableQuarter(quarter, financialYear);

        const allReviewsForFY = await this.reviewRepository.find({
          where: { employeeId, financialYear },
        });
        // Mode B: quarterly is exclusive — reject if a YEARLY row already exists for this FY
        this.assertExclusiveReviewMode(employeeId, financialYear, false, allReviewsForFY);

        const existing = await this.reviewRepository
          .createQueryBuilder('review')
          .where('review.employeeId = :employeeId', { employeeId })
          .andWhere('review.quarter = :quarter', { quarter })
          .andWhere('TRIM(review.financialYear) = :financialYear', { financialYear })
          .getOne();

        if (existing) {
          throw new BadRequestException(
            duplicateAssignmentMessage(employeeId, quarter, financialYear),
          );
        }

        const review = this.reviewRepository.create({
          employeeId,
          financialYear,
          quarter,
          reviewPeriod: ReviewPeriod.QUARTERLY,
          yearlyQuarterReviews: null,
          employeeType,
          description,
          employeeName,
          department,
          designation,
          assignedBy,
          assignerId,
          managerId,
          managerName,
          assignedDate,
          deadlineDate,
          status: QuarterlyReviewStatus.ASSIGNED,
          reassignCount: 0,
        });

        const saved = await this.reviewRepository.save(review);
        const performance = await this.ensureAssignedPerformance(
          saved.employeeId,
          saved.quarter,
          saved.financialYear,
        );

        const initAuditEntry = createAuditEntry({
          employeeId: saved.employeeId,
          managerId: saved.managerId,
          quarter: saved.quarter,
          financialYear: saved.financialYear,
          createdBy: saved.assignerId || 'ADMIN',
          createdDate: saved.assignedDate,
          assignedDate: saved.assignedDate,
          deadlineDate: saved.deadlineDate,
          status: QuarterlyReviewStatus.ASSIGNED,
          lastModifiedBy: saved.assignerId || 'ADMIN',
          details: 'Review cycle assigned to employee',
        });

        saved.auditHistory = appendAuditEntry(saved.auditHistory, initAuditEntry);
        saved.performanceId = performance.id;
        await this.reviewRepository.save(saved);

        performance.auditHistory = appendAuditEntry(performance.auditHistory, initAuditEntry);
        await this.performanceRepository.save(performance);

        if (!options?.skipNotice) {
          await this.noticeService.notifyEmployeeOfAssignment({
            employeeId: saved.employeeId,
            employeeName: saved.employeeName || saved.employeeId,
            quarter: saved.quarter,
            financialYear: saved.financialYear,
            deadlineDate: saved.deadlineDate,
          });
          if (saved.deadlineDate && isOneDayBeforeDeadline(saved.deadlineDate, new Date())) {
            try {
              await this.noticeService.notifyOneDayDeadlineReminder({
                employeeId: saved.employeeId,
                employeeName: saved.employeeName || saved.employeeId,
                quarter: saved.quarter,
                financialYear: saved.financialYear,
                deadlineDate: saved.deadlineDate,
              });
            } catch (noticeErr) {
              this.logger.warn(`Could not dispatch 1-day reminder notice on create: ${noticeErr}`);
            }
          }
        }

        await this.annualService.syncEmployeeAnnualRating(saved.employeeId, saved.financialYear);
        const enrichedList = await this.enrichReviewsWithDetails([saved]);
        return enrichedList[0];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating quarterly review: ${message}`, stack);
      if (error instanceof HttpException) throw error;
      const driverError = error as { code?: string; errno?: number };
      if (driverError.code === 'ER_DUP_ENTRY' || driverError.errno === 1062) {
        throw new BadRequestException(
          this.isYearlyAssignment(createDto)
            ? yearlyAlreadyAssignedMessage(
                createDto.employeeId.trim(),
                createDto.financialYear.trim(),
              )
            : duplicateAssignmentMessage(
                createDto.employeeId.trim(),
                createDto.quarter || 'quarter',
                createDto.financialYear.trim(),
              ),
        );
      }
      throw new HttpException(
        `Failed to create review: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * FR-05, FR-06, FR-07: Submit Manager Evaluation
   * Evaluates ratings on 1-5 scale, computes average, records remarks, and locks review.
   */
  async evaluateReview(
    id: number,
    evalDto: ManagerEvaluationDto,
    user?: User,
  ): Promise<Partial<RevealedEvaluationDto> & { status: string; isDraft?: boolean }> {
    try {
      const review = await this.reviewRepository.findOne({
        where: { id },
      });
      if (!review) {
        throw new NotFoundException(`Quarterly review with ID ${id} not found.`);
      }
      // Manager appraisals → Admin/CEO/GM only; never self-evaluate.
      await this.assertCanEvaluateReview(review.employeeId, user);

      // Calculate Average Score (1 to 5 scale) across all provided criteria.
      // A partial update keeps the stored scores for fields that were not sent.
      const scoreSent = (value: number | undefined | null) => value !== undefined && value !== null;
      const storedScore = (value: unknown): number | undefined => {
        if (value === undefined || value === null || value === '') return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      };
      const anyScoreSent =
        scoreSent(evalDto.productivity) ||
        scoreSent(evalDto.qualityOfWork) ||
        scoreSent(evalDto.ownership) ||
        scoreSent(evalDto.ownershipResponsibility) ||
        scoreSent(evalDto.communication) ||
        scoreSent(evalDto.teamCollaboration) ||
        scoreSent(evalDto.innovation) ||
        scoreSent(evalDto.innovationProblemSolving) ||
        scoreSent(evalDto.technicalJobSkills) ||
        scoreSent(evalDto.finalRating) ||
        scoreSent(evalDto.overallPerformanceRating);

      const ownershipResponsibility = evalDto.ownershipResponsibility ?? evalDto.ownership;
      const innovationProblemSolving = evalDto.innovationProblemSolving ?? evalDto.innovation;

      if (anyScoreSent) {
        const scores = [
          evalDto.productivity ?? storedScore(review.productivity),
          evalDto.qualityOfWork ?? storedScore(review.qualityOfWork),
          ownershipResponsibility ?? storedScore(review.ownershipResponsibility),
          evalDto.communication ?? storedScore(review.communication),
          evalDto.teamCollaboration ?? storedScore(review.teamCollaboration),
          innovationProblemSolving ?? storedScore(review.innovationProblemSolving),
          evalDto.technicalJobSkills ?? storedScore(review.technicalJobSkills),
        ].filter((s): s is number => s !== undefined && s !== null && s > 0);

        const sum = scores.reduce((acc, curr) => acc + curr, 0);
        const calculated = scores.length > 0 ? Number((sum / scores.length).toFixed(1)) : null;
        const finalRating = calculated ?? evalDto.finalRating ?? evalDto.overallPerformanceRating ?? null;
        const ratingDescription = finalRating
          ? RATING_DESCRIPTIONS[Math.round(Number(finalRating))] || 'Meets Expectations'
          : 'Meets Expectations';

        if (finalRating !== null && finalRating !== undefined) {
          const rounded = Number(Number(finalRating).toFixed(1));
          review.overallPerformanceRating = rounded;
          review.finalRating = rounded;
        }
        review.ratingDescription = ratingDescription;
      }

      if (evalDto.productivity !== undefined) review.productivity = evalDto.productivity;
      if (evalDto.qualityOfWork !== undefined) review.qualityOfWork = evalDto.qualityOfWork;
      if (evalDto.technicalJobSkills !== undefined) review.technicalJobSkills = evalDto.technicalJobSkills;
      if (ownershipResponsibility !== undefined) review.ownershipResponsibility = ownershipResponsibility;
      if (evalDto.communication !== undefined) review.communication = evalDto.communication;
      if (evalDto.teamCollaboration !== undefined) review.teamCollaboration = evalDto.teamCollaboration;
      if (innovationProblemSolving !== undefined) review.innovationProblemSolving = innovationProblemSolving;

      if (evalDto.performanceStrengths !== undefined) review.performanceStrengths = evalDto.performanceStrengths;
      if (evalDto.areasOfImprovement !== undefined) review.areasOfImprovement = evalDto.areasOfImprovement;
      if (evalDto.managerComment !== undefined) review.managerComment = evalDto.managerComment || null;

      // Section 5: Final Review & Submission Fields
      if (evalDto.goalsForNextReviewPeriod !== undefined) review.goalsForNextReviewPeriod = evalDto.goalsForNextReviewPeriod;
      if (evalDto.trainingDevelopmentRecommendations !== undefined) review.trainingDevelopmentRecommendations = evalDto.trainingDevelopmentRecommendations;
      if (evalDto.careerGrowthRecommendation !== undefined) review.careerGrowthRecommendation = evalDto.careerGrowthRecommendation;
      if (evalDto.reviewOutcome !== undefined) review.reviewOutcome = evalDto.reviewOutcome;
      if (evalDto.performanceAction !== undefined) review.performanceAction = evalDto.performanceAction;
      // Dual flow (safe default = old COMPLETED path when no employee-assigner mapping):
      // EMPLOYEE assigner first submit → AWAITING_MANAGER_FINAL_REVIEW (+ notify manager).
      // Manager final (or manager-assigner / no mapping) → COMPLETED as before.
      const appraisalMapping = await this.appraisalMappingService.findActiveByEmployeeId(
        review.employeeId,
      );
      const alreadyAwaitingManager =
        review.status === QuarterlyReviewStatus.AWAITING_MANAGER_FINAL_REVIEW;
      const evaluationFinished = this.isEvaluationFinished(review.status);
      const sessionEmployeeId = user?.loginId
        ? await this.resolveSessionEmployeeId(String(user.loginId))
        : null;
      // Employee-assigner cannot edit after forward or after manager completes.
      if (
        appraisalMapping?.assignerType === AppraisalAssignerType.EMPLOYEE &&
        sessionEmployeeId &&
        sessionEmployeeId === appraisalMapping.assignerId &&
        (alreadyAwaitingManager || evaluationFinished)
      ) {
        throw new ForbiddenException(
          alreadyAwaitingManager
            ? 'Evaluation is awaiting manager final comment. Only the manager can complete it.'
            : 'Evaluation is completed. Only the manager can edit it.',
        );
      }
      const isEmployeeAssignerFlow =
        !!appraisalMapping &&
        appraisalMapping.assignerType === AppraisalAssignerType.EMPLOYEE &&
        !alreadyAwaitingManager &&
        !evaluationFinished;

      // Confirmations: assigner first-pass → assignerConfirmation; manager final → managerConfirmation.
      if (isEmployeeAssignerFlow) {
        if (evalDto.assignerConfirmation !== undefined) {
          review.assignerConfirmation = evalDto.assignerConfirmation;
        } else if (evalDto.managerConfirmation) {
          review.assignerConfirmation = true;
        }
      } else {
        if (evalDto.assignerConfirmation !== undefined) {
          review.assignerConfirmation = evalDto.assignerConfirmation;
        }
        if (evalDto.managerConfirmation !== undefined) {
          review.managerConfirmation = evalDto.managerConfirmation;
        }
      }

      if (evalDto.isDraft) {
        review.status = QuarterlyReviewStatus.EVALUATION_IN_PROGRESS;
        const draftEntry = createAuditEntry({
          employeeId: review.employeeId,
          managerId: review.managerId || review.assignerId,
          quarter: review.quarter,
          financialYear: review.financialYear,
          createdBy: review.assignerId || 'ADMIN',
          createdDate: review.assignedDate,
          assignedDate: review.assignedDate,
          deadlineDate: review.deadlineDate,
          submittedDate: review.submittedDate,
          submittedBy: review.submittedDate ? review.employeeId : null,
          status: QuarterlyReviewStatus.EVALUATION_IN_PROGRESS,
          lastModifiedBy: review.managerId || review.assignerId || 'MANAGER',
          details: 'Manager saved evaluation draft',
        });
        review.auditHistory = appendAuditEntry(review.auditHistory, draftEntry);
        const saved = await this.reviewRepository.save(review);
        await this.syncPerformanceAudit(saved, draftEntry);
        await this.markPerformanceEvaluationInProgress(saved);
        await this.propagateYearlyReview(saved);
        await this.annualService.syncEmployeeAnnualRating(saved.employeeId, saved.financialYear);
        return this.toEvaluationPatchResponse(saved, evalDto, anyScoreSent);
      }

      if (isEmployeeAssignerFlow) {
        // Strip manager comment if an employee-assigner somehow sent it.
        if (evalDto.managerComment !== undefined) {
          review.managerComment = null;
        }
        review.managerConfirmation = false;
        review.status = QuarterlyReviewStatus.AWAITING_MANAGER_FINAL_REVIEW;
        review.reviewedDate = null;
        const awaitEntry = createAuditEntry({
          employeeId: review.employeeId,
          managerId: review.managerId || review.assignerId,
          quarter: review.quarter,
          financialYear: review.financialYear,
          createdBy: review.assignerId || 'ADMIN',
          createdDate: review.assignedDate,
          assignedDate: review.assignedDate,
          deadlineDate: review.deadlineDate,
          submittedDate: new Date(),
          submittedBy: appraisalMapping.assignerId,
          status: QuarterlyReviewStatus.AWAITING_MANAGER_FINAL_REVIEW,
          lastModifiedBy: appraisalMapping.assignerId,
          details: `Assigner submitted evaluation (score: ${review.finalRating ?? 'N/A'}); awaiting manager final comment`,
        });
        review.auditHistory = appendAuditEntry(review.auditHistory, awaitEntry);
        const saved = await this.reviewRepository.save(review);
        await this.syncPerformanceAudit(saved, awaitEntry);
        await this.markPerformanceEvaluationInProgress(saved);
        await this.propagateYearlyReview(saved);
        await this.annualService.syncEmployeeAnnualRating(saved.employeeId, saved.financialYear);
        await this.noticeService.notifyManagerOfFinalReviewNeeded({
          employeeId: saved.employeeId,
          employeeName: saved.employeeName || saved.employeeId,
          quarter: saved.quarter,
          financialYear: saved.financialYear,
          assignerName: appraisalMapping.assignerName || appraisalMapping.assignerId,
        });
        return this.toEvaluationPatchResponse(saved, evalDto, anyScoreSent);
      }

      review.status = QuarterlyReviewStatus.COMPLETED;
      review.reviewedDate = new Date();

      const compEntry = createAuditEntry({
        employeeId: review.employeeId,
        managerId: review.managerId || review.assignerId,
        quarter: review.quarter,
        financialYear: review.financialYear,
        createdBy: review.assignerId || 'ADMIN',
        createdDate: review.assignedDate,
        assignedDate: review.assignedDate,
        deadlineDate: review.deadlineDate,
        submittedDate: review.reviewedDate,
        submittedBy: review.managerId || review.assignerId || 'MANAGER',
        status: QuarterlyReviewStatus.COMPLETED,
        lastModifiedBy: review.managerId || review.assignerId || 'MANAGER',
        details: `Manager finalized evaluation with score: ${review.finalRating ?? 'N/A'}${review.ratingDescription ? ` (${review.ratingDescription})` : ''}`,
      });
      review.auditHistory = appendAuditEntry(review.auditHistory, compEntry);

      const saved = await this.reviewRepository.save(review);
      await this.syncPerformanceAudit(saved, compEntry);
      await this.markPerformanceCompleted(saved);
      // Refresh yearly snapshots first, then sync annual so YEARLY finalRating is captured
      await this.propagateYearlyReview(saved);
      await this.annualService.syncEmployeeAnnualRating(saved.employeeId, saved.financialYear);

      await this.noticeService.notifyEmployeeReviewCompleted({
        employeeId: saved.employeeId,
        employeeName: saved.employeeName || saved.employeeId,
        quarter: saved.quarter,
        financialYear: saved.financialYear,
      });

      return this.toEvaluationPatchResponse(saved, evalDto, anyScoreSent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error evaluating review: ${message}`, stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to submit evaluation: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * FR-01: Employee Dashboard View
   * Returns current quarter, submission status, due date, submitted date, and final rating (if reviewed).
   */
  async getEmployeeDashboard(employeeId: string): Promise<{
    currentQuarter: QuaterlyEnum;
    reviews: Array<{
      id: number;
      quarter: QuaterlyEnum;
      financialYear: string;
      managerName: string | null;
      assignedDate: Date | null;
      submissionStatus: QuarterlyReviewStatus;
      dueDate: Date | null;
      submittedDate: Date | null;
      ratingStatus: RatingVisibilityStatus;
      reviewedDate: Date | null;
      isOverdue: boolean;
    }>;
  }> {
    const reviews = await this.reviewRepository.find({
      where: { employeeId },
      order: { id: 'DESC' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formattedReviews = reviews.map((r) => {
      const deadline = r.deadlineDate ? new Date(r.deadlineDate) : null;
      const isOverdue =
        deadline &&
        !this.isEvaluationFinished(r.status) &&
        deadline.getTime() < today.getTime();

      const isReviewed = this.isEvaluationFinished(r.status);

      return {
        id: r.id,
        quarter: r.quarter,
        financialYear: r.financialYear,
        managerName: r.managerName || r.assignerId,
        assignedDate: r.assignedDate,
        submissionStatus: r.status,
        dueDate: r.deadlineDate,
        submittedDate: r.submittedDate,
        ratingStatus: isReviewed ? RatingVisibilityStatus.RATED : RatingVisibilityStatus.PENDING_REVIEW,
        reviewedDate: r.reviewedDate,
        isOverdue: !!isOverdue,
      };
    });

    return {
      currentQuarter: reviews[0]?.quarter || QuaterlyEnum.Q1,
      reviews: formattedReviews,
    };
  }

  /**
   * FR-01: Manager Dashboard View
   * Returns team members, pending reviews, completed reviews, and statistics.
   */
  async getManagerDashboard(managerId: string): Promise<{
    teamCount: number;
    pendingReviewsCount: number;
    completedReviewsCount: number;
    statistics: {
      averageTeamRating: number | null;
      ratingDistribution: Record<string, number>;
    };
    teamReviews: EnrichedQuarterlyReview[];
  }> {
    // 1. Fetch team members mapped to this manager
    const teamMappings = await this.managerMappingRepository.find({
      where: { managerId },
    });
    const teamEmployeeIds = teamMappings.map((m) => m.employeeId).filter(Boolean);

    let reviews: QuarterlyReview[] = [];
    if (teamEmployeeIds.length > 0) {
      reviews = await this.reviewRepository.find({
        where: [
          { employeeId: In(teamEmployeeIds) },
          { assignerId: managerId },
        ],
        order: { id: 'DESC' },
      });
    } else {
      reviews = await this.reviewRepository.find({
        where: { assignerId: managerId },
        order: { id: 'DESC' },
      });
    }

    // Deduplicate by ID; hide other-assigner team rows until awaiting manager final / completed.
    const managerVisibleFromOtherAssigner = new Set<string>([
      QuarterlyReviewStatus.AWAITING_MANAGER_FINAL_REVIEW,
      QuarterlyReviewStatus.COMPLETED,
      QuarterlyReviewStatus.REVIEWED,
    ]);
    const uniqueReviews = Array.from(new Map(reviews.map((r) => [r.id, r])).values()).filter(
      (r) =>
        r.assignerId === managerId ||
        managerVisibleFromOtherAssigner.has(String(r.status || '')),
    );

    const completed = uniqueReviews.filter((r) => this.isEvaluationFinished(r.status));
    const pending = uniqueReviews.filter((r) => !this.isEvaluationFinished(r.status));

    // Calculate rating distribution and average
    const ratedScores = completed
      .map((r) => r.finalRating)
      .filter((rating): rating is number => typeof rating === 'number' && rating > 0);

    const averageTeamRating =
      ratedScores.length > 0
        ? Number((ratedScores.reduce((a, b) => a + b, 0) / ratedScores.length).toFixed(1))
        : null;

    const ratingDistribution: Record<string, number> = {
      '5 - Outstanding': ratedScores.filter((s) => s === 5).length,
      '4 - Exceeds Expectations': ratedScores.filter((s) => s === 4).length,
      '3 - Meets Expectations': ratedScores.filter((s) => s === 3).length,
      '2 - Needs Improvement': ratedScores.filter((s) => s === 2).length,
      '1 - Unsatisfactory': ratedScores.filter((s) => s === 1).length,
    };

    const enriched = await this.enrichReviewsWithDetails(uniqueReviews);

    return {
      teamCount: teamEmployeeIds.length,
      pendingReviewsCount: pending.length,
      completedReviewsCount: completed.length,
      statistics: {
        averageTeamRating,
        ratingDistribution,
      },
      teamReviews: enriched,
    };
  }

  /**
   * FR-08: Employee Rating Visibility (Masked View)
   * Strictly HIDES manager comments, areas of improvement, strengths, and internal scores.
   */
  async getEmployeeView(id: number, employeeId: string): Promise<Partial<QuarterlyReview>> {
    const review = await this.reviewRepository.findOne({
      where: { id, employeeId },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found for this employee.`);
    }

    return {
      id: review.id,
      employeeId: review.employeeId,
      employeeName: review.employeeName,
      department: review.department,
      designation: review.designation,
      quarter: review.quarter,
      financialYear: review.financialYear,
      status: review.status,
      assignedDate: review.assignedDate,
      deadlineDate: review.deadlineDate,
      submittedDate: review.submittedDate,
      reviewedDate: review.reviewedDate,
    };
  }

  async revealRating(id: number, employeeId: string, password: string, user: User): Promise<RevealedEvaluationDto> {
    const requestedEmployeeId = employeeId?.trim();
    if (!requestedEmployeeId) {
      throw new BadRequestException('Employee id is required.');
    }

    const typed = password?.trim();
    const account = user?.loginId
      ? await this.usersService.findByLoginId(user.loginId)
      : user?.id
        ? await this.usersService.findById(user.id)
        : null;

    if (!typed || !account?.loginId) {
      throw new BadRequestException(PASSWORD_MISMATCH_MESSAGE);
    }

    const userMatches = await this.matchesStoredPassword(typed, account.password);
    const employee = userMatches
      ? null
      : await this.employeeDetailsRepository.findOne({
        where: [{ employeeId: account.loginId }, { email: account.loginId }],
      });
    const employeeMatches = userMatches
      ? false
      : await this.matchesStoredPassword(typed, employee?.password);
    if (!userMatches && !employeeMatches) {
      throw new BadRequestException(PASSWORD_MISMATCH_MESSAGE);
    }

    const sessionEmployeeId = await this.resolveSessionEmployeeId(account.loginId);
    if (sessionEmployeeId !== requestedEmployeeId) {
      throw new NotFoundException(`Review with ID ${id} not found for this employee.`);
    }

    const review = await this.reviewRepository.findOne({
      where: { id, employeeId: requestedEmployeeId },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found for this employee.`);
    }

    const performance = await this.performanceRepository.findOne({
      where: {
        employeeId: review.employeeId,
        quarter: review.quarter,
        financialYear: review.financialYear,
      },
    });
    if (
      review.status !== QuarterlyReviewStatus.COMPLETED ||
      performance?.status !== EmployeePerformanceStatus.COMPLETED ||
      review.finalRating == null
    ) {
      throw new BadRequestException(RATING_NOT_READY_MESSAGE);
    }

    const revealed: RevealedEvaluationDto = {
      quarter: review.quarter,
      financialYear: review.financialYear,
      finalRating: Number(review.finalRating),
      ratingDescription: review.ratingDescription || '',
      productivity: Number(review.productivity),
      qualityOfWork: Number(review.qualityOfWork),
      ownershipResponsibility: Number(review.ownershipResponsibility),
      communication: Number(review.communication),
      teamCollaboration: Number(review.teamCollaboration),
      innovationProblemSolving: Number(review.innovationProblemSolving),
      technicalJobSkills: review.technicalJobSkills != null ? Number(review.technicalJobSkills) : 0,
      overallPerformanceRating: review.overallPerformanceRating != null ? Number(review.overallPerformanceRating) : 0,
      performanceStrengths: review.performanceStrengths || '',
      areasOfImprovement: review.areasOfImprovement || '',
      managerComment: review.managerComment || '',
      goalsForNextReviewPeriod: review.goalsForNextReviewPeriod || '',
      trainingDevelopmentRecommendations: review.trainingDevelopmentRecommendations || '',
      careerGrowthRecommendation: review.careerGrowthRecommendation || '',
      reviewOutcome: review.reviewOutcome || '',
      performanceAction: review.performanceAction || '',
      managerConfirmation: Boolean(review.managerConfirmation),
      assignerConfirmation: Boolean(review.assignerConfirmation),
      passwordVerified: true,
    };
    return revealed;
  }

  /** Manager matrix: scores and comments only. No employee self-review body. */
  async getManagerEvaluation(id: number, user?: User): Promise<RevealedEvaluationDto> {
    const review = await this.reviewRepository.findOne({ where: { id } });
    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found.`);
    }
    await this.assertCanEvaluateReview(review.employeeId, user);
    const revealed = this.toRevealedEvaluation(review);
    // Hide manager comment from employee-assigner until manager final step.
    const mapping = await this.appraisalMappingService.findActiveByEmployeeId(review.employeeId);
    const sessionEmployeeId = user?.loginId
      ? await this.resolveSessionEmployeeId(String(user.loginId))
      : null;
    if (
      mapping?.assignerType === AppraisalAssignerType.EMPLOYEE &&
      sessionEmployeeId === mapping.assignerId &&
      review.status !== QuarterlyReviewStatus.AWAITING_MANAGER_FINAL_REVIEW &&
      review.status !== QuarterlyReviewStatus.COMPLETED
    ) {
      revealed.managerComment = '';
    }
    return revealed;
  }

  private toRevealedEvaluation(review: QuarterlyReview): RevealedEvaluationDto {
    const quarterValue = review.quarter as unknown;
    const quarter = Array.isArray(quarterValue)
      ? quarterValue.join(',')
      : String(quarterValue || '');
    const asNumber = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return {
      quarter,
      financialYear: review.financialYear,
      finalRating: asNumber(review.finalRating),
      ratingDescription: review.ratingDescription || '',
      productivity: asNumber(review.productivity),
      qualityOfWork: asNumber(review.qualityOfWork),
      ownershipResponsibility: asNumber(review.ownershipResponsibility),
      communication: asNumber(review.communication),
      teamCollaboration: asNumber(review.teamCollaboration),
      innovationProblemSolving: asNumber(review.innovationProblemSolving),
      technicalJobSkills: asNumber(review.technicalJobSkills),
      overallPerformanceRating: asNumber(review.overallPerformanceRating),
      performanceStrengths: review.performanceStrengths || '',
      areasOfImprovement: review.areasOfImprovement || '',
      managerComment: review.managerComment || '',
      goalsForNextReviewPeriod: review.goalsForNextReviewPeriod || '',
      trainingDevelopmentRecommendations: review.trainingDevelopmentRecommendations || '',
      careerGrowthRecommendation: review.careerGrowthRecommendation || '',
      reviewOutcome: review.reviewOutcome || '',
      performanceAction: review.performanceAction || '',
      managerConfirmation: Boolean(review.managerConfirmation),
      assignerConfirmation: Boolean(review.assignerConfirmation),
      passwordVerified: true,
      status: review.status,
    };
  }

  /** PATCH evaluate response: only fields that were sent, plus status (and derived scores when recalculated). */
  private toEvaluationPatchResponse(
    review: QuarterlyReview,
    evalDto: ManagerEvaluationDto,
    scoresRecalculated: boolean,
  ): Partial<RevealedEvaluationDto> & { status: string; isDraft?: boolean } {
    const asNumber = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const response: Partial<RevealedEvaluationDto> & { status: string; isDraft?: boolean } = {
      status: review.status,
    };

    if (evalDto.isDraft !== undefined) response.isDraft = Boolean(evalDto.isDraft);
    if (evalDto.productivity !== undefined) response.productivity = asNumber(review.productivity);
    if (evalDto.qualityOfWork !== undefined) response.qualityOfWork = asNumber(review.qualityOfWork);
    if (evalDto.ownership !== undefined || evalDto.ownershipResponsibility !== undefined) {
      response.ownershipResponsibility = asNumber(review.ownershipResponsibility);
    }
    if (evalDto.communication !== undefined) response.communication = asNumber(review.communication);
    if (evalDto.teamCollaboration !== undefined) {
      response.teamCollaboration = asNumber(review.teamCollaboration);
    }
    if (evalDto.innovation !== undefined || evalDto.innovationProblemSolving !== undefined) {
      response.innovationProblemSolving = asNumber(review.innovationProblemSolving);
    }
    if (evalDto.technicalJobSkills !== undefined) {
      response.technicalJobSkills = asNumber(review.technicalJobSkills);
    }
    if (evalDto.performanceStrengths !== undefined) {
      response.performanceStrengths = review.performanceStrengths || '';
    }
    if (evalDto.areasOfImprovement !== undefined) {
      response.areasOfImprovement = review.areasOfImprovement || '';
    }
    if (evalDto.managerComment !== undefined) {
      response.managerComment = review.managerComment || '';
    }
    if (evalDto.goalsForNextReviewPeriod !== undefined) {
      response.goalsForNextReviewPeriod = review.goalsForNextReviewPeriod || '';
    }
    if (evalDto.trainingDevelopmentRecommendations !== undefined) {
      response.trainingDevelopmentRecommendations = review.trainingDevelopmentRecommendations || '';
    }
    if (evalDto.careerGrowthRecommendation !== undefined) {
      response.careerGrowthRecommendation = review.careerGrowthRecommendation || '';
    }
    if (evalDto.reviewOutcome !== undefined) response.reviewOutcome = review.reviewOutcome || '';
    if (evalDto.performanceAction !== undefined) {
      response.performanceAction = review.performanceAction || '';
    }
    if (evalDto.managerConfirmation !== undefined) {
      response.managerConfirmation = Boolean(review.managerConfirmation);
    }
    if (evalDto.assignerConfirmation !== undefined) {
      response.assignerConfirmation = Boolean(review.assignerConfirmation);
    }

    if (
      scoresRecalculated ||
      evalDto.finalRating !== undefined ||
      evalDto.overallPerformanceRating !== undefined
    ) {
      response.finalRating = asNumber(review.finalRating);
      response.overallPerformanceRating = asNumber(review.overallPerformanceRating);
      response.ratingDescription = review.ratingDescription || '';
    }

    return response;
  }

  private async resolveSessionEmployeeId(loginId: string): Promise<string> {
    const byEmployeeId = await this.employeeDetailsRepository.findOne({
      where: { employeeId: loginId },
    });
    if (byEmployeeId) {
      return byEmployeeId.employeeId;
    }

    const byEmail = await this.employeeDetailsRepository.findOne({
      where: { email: loginId },
    });
    if (byEmail) {
      return byEmail.employeeId;
    }

    return loginId;
  }

  /**
   * Manager View: Full submission + Remarks + Attachments
   */
  async getManagerView(id: number, managerId: string): Promise<EnrichedQuarterlyReview> {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found.`);
    }

    const enriched = await this.enrichReviewsWithDetails([review]);
    return enriched[0];
  }

  /**
   * FR-09: Manager Download Reports (Export data format)
   */
  async exportReports(dto: ExportQuarterlyReviewDto): Promise<any[]> {
    const qb = this.reviewRepository.createQueryBuilder('review');

    if (dto.quarter) {
      qb.andWhere('review.quarter = :quarter', { quarter: dto.quarter });
    }
    if (dto.financialYear?.trim()) {
      qb.andWhere('review.financialYear = :financialYear', { financialYear: dto.financialYear.trim() });
    }
    if (dto.department?.trim()) {
      qb.andWhere('review.department = :department', { department: dto.department.trim() });
    }
    if (dto.managerId?.trim()) {
      qb.andWhere('review.assignerId = :managerId', { managerId: dto.managerId.trim() });
    }
    if (dto.rating) {
      qb.andWhere('review.finalRating = :rating', { rating: dto.rating });
    }
    if (dto.status) {
      qb.andWhere('review.status = :status', { status: dto.status });
    }

    qb.orderBy('review.id', 'DESC');
    const reviews = await qb.getMany();
    const enriched = await this.enrichReviewsWithDetails(reviews);

    return enriched.map((r) => ({
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      Department: r.department,
      Designation: r.designation,
      'Financial Year': r.financialYear,
      Quarter: r.quarter,
      'Review Status': r.status,
      'Due Date': r.deadlineDate ? new Date(r.deadlineDate).toISOString().split('T')[0] : '',
      'Submitted Date': r.submittedDate ? new Date(r.submittedDate).toISOString().split('T')[0] : '',
      'Reviewed Date': r.reviewedDate ? new Date(r.reviewedDate).toISOString().split('T')[0] : '',
      'Overall Performance Rating (1-5)': r.overallPerformanceRating,
      'Productivity (1-5)': r.productivity,
      'Quality of Work (1-5)': r.qualityOfWork,
      'Technical / Job Skills (1-5)': r.technicalJobSkills,
      'Ownership (1-5)': r.ownershipResponsibility,
      'Communication (1-5)': r.communication,
      'Team Collaboration (1-5)': r.teamCollaboration,
      'Innovation / Problem Solving (1-5)': r.innovationProblemSolving,
      'Final Rating': r.finalRating,
      'Rating Description': r.ratingDescription,
      'Performance Strengths': r.performanceStrengths,
      'Areas of Improvement': r.areasOfImprovement,
      'Manager Comment': r.managerComment,
      'Goals for Next Review Period': r.goalsForNextReviewPeriod,
      'Training Recommendations': r.trainingDevelopmentRecommendations,
      'Career Growth Recommendation': r.careerGrowthRecommendation,
      'Review Outcome': r.reviewOutcome,
      'Performance Action': r.performanceAction,
      'Key Accomplishments': r.performanceDetails?.stepOverview?.majorContributions || '',
      'Major Projects': (r.performanceDetails?.stepAchievements?.projects || []).map((project) => project.projectName).filter(Boolean).join(', '),
    }));
  }

  /**
   * Find All reviews
   */
  async findAll(
    query?: QueryQuarterlyReviewDto,
    hideEvaluation = false,
  ): Promise<{
    data: EnrichedQuarterlyReview[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    return this.getByParams(query, hideEvaluation);
  }

  /**
   * Get reviews by parameters
   */
  async getByParams(params?: QueryQuarterlyReviewDto, hideEvaluation = false): Promise<{
    data: EnrichedQuarterlyReview[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    try {
      const qb = this.reviewRepository.createQueryBuilder('review');

      if (params?.employeeId?.trim()) {
        const empId = params.employeeId.trim();
        qb.andWhere('(review.employeeId = :exactEmpId OR review.employeeId LIKE :likeEmpId)', {
          exactEmpId: empId,
          likeEmpId: `%${empId}%`,
        });
      }

      if (params?.department?.trim()) {
        const dept = params.department.trim();
        const empDeptQb = this.employeeDetailsRepository.createQueryBuilder('emp');
        empDeptQb.andWhere('emp.department LIKE :department', { department: `%${dept}%` });
        const matchedDeptEmployees = await empDeptQb.select('emp.employeeId', 'employeeId').getRawMany();
        const matchedDeptIds = matchedDeptEmployees.map((e) => e.employeeId).filter(Boolean);

        if (matchedDeptIds.length > 0) {
          qb.andWhere(
            '(review.department LIKE :deptParam OR review.employeeId IN (:...matchedDeptIds))',
            { deptParam: `%${dept}%`, matchedDeptIds },
          );
        } else {
          qb.andWhere('review.department LIKE :deptParam', { deptParam: `%${dept}%` });
        }
      }

      if (params?.name?.trim()) {
        const name = params.name.trim();
        const empNameQb = this.employeeDetailsRepository.createQueryBuilder('emp');
        empNameQb.andWhere('emp.fullName LIKE :name', { name: `%${name}%` });
        const matchedNameEmployees = await empNameQb.select('emp.employeeId', 'employeeId').getRawMany();
        const matchedNameIds = matchedNameEmployees.map((e) => e.employeeId).filter(Boolean);

        if (matchedNameIds.length > 0) {
          qb.andWhere(
            '(review.employeeName LIKE :nameParam OR review.employeeId IN (:...matchedNameIds))',
            { nameParam: `%${name}%`, matchedNameIds },
          );
        } else {
          qb.andWhere('review.employeeName LIKE :nameParam', { nameParam: `%${name}%` });
        }
      }

      if (params?.financialYear?.trim()) {
        qb.andWhere('review.financialYear = :fy', { fy: params.financialYear.trim() });
      }

      if (params?.reviewPeriod) {
        qb.andWhere('review.reviewPeriod = :reviewPeriod', { reviewPeriod: params.reviewPeriod });
      }

      if (params?.quarter) {
        qb.andWhere('review.quarter = :quarter', { quarter: params.quarter });
      }

      if (params?.status) {
        qb.andWhere('review.status = :status', { status: params.status });
      }

      if (params?.assignerId?.trim()) {
        const assignerId = params.assignerId.trim();
        const teamMappings = await this.managerMappingRepository.find({
          where: { managerId: assignerId },
        });
        // Never include the manager's own GM/CEO-assigned appraisal in the team list.
        const teamEmployeeIds = teamMappings
          .map((m) => m.employeeId)
          .filter((id): id is string => Boolean(id) && id !== assignerId);

        // Own assignments always visible. Team rows assigned by someone else (employee assigner)
        // only after AWAITING_MANAGER_FINAL_REVIEW or finished (COMPLETED/REVIEWED).
        const managerVisibleFromOtherAssigner = [
          QuarterlyReviewStatus.AWAITING_MANAGER_FINAL_REVIEW,
          QuarterlyReviewStatus.COMPLETED,
          QuarterlyReviewStatus.REVIEWED,
        ];
        if (teamEmployeeIds.length > 0) {
          qb.andWhere(
            `(review.assignerId = :assignerId OR (
              review.employeeId IN (:...teamEmployeeIds)
              AND review.assignerId != :assignerId
              AND review.status IN (:...managerVisibleFromOtherAssigner)
            ))`,
            { assignerId, teamEmployeeIds, managerVisibleFromOtherAssigner },
          );
        } else {
          qb.andWhere('review.assignerId = :assignerId', { assignerId });
        }
        qb.andWhere('review.employeeId != :assignerId', { assignerId });
      }

      const employeeRole = (params?.employeeRole || params?.role || '').trim();
      if (employeeRole) {
        const roles = employeeRole
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean) as UserType[];
        const roleRows = roles.length
          ? await this.employeeDetailsRepository.find({
              where: { role: In(roles) },
              select: ['employeeId'],
            })
          : [];
        const roleEmployeeIds = roleRows.map((row) => row.employeeId).filter(Boolean);
        if (roleEmployeeIds.length === 0) {
          return {
            data: [],
            total: 0,
            page: params?.page,
            limit: params?.limit,
          };
        }
        qb.andWhere('review.employeeId IN (:...roleEmployeeIds)', { roleEmployeeIds });
      }

      if (params?.q?.trim()) {
        const keyword = `%${params.q.trim()}%`;
        qb.andWhere(
          '(review.employeeId LIKE :keyword OR review.employeeName LIKE :keyword OR review.department LIKE :keyword OR review.financialYear LIKE :keyword OR review.quarter LIKE :keyword OR review.status LIKE :keyword)',
          { keyword },
        );
      }

      qb.orderBy('review.id', 'DESC');

      const total = await qb.getCount();

      if (params?.page && params?.limit) {
        const skip = (params.page - 1) * params.limit;
        qb.skip(skip).take(params.limit);
      }

      const reviews = await qb.getMany();
      const enriched = await this.enrichReviewsWithDetails(reviews);
      const data = hideEvaluation ? enriched.map((row) => this.withoutEvaluation(row)) : enriched;

      return {
        data,
        total,
        page: params?.page,
        limit: params?.limit,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in getByParams: ${message}`, stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch reviews: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search reviews
   */
  async getBySearch(searchDto: SearchQuarterlyReviewDto): Promise<{
    data: EnrichedQuarterlyReview[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    return this.getByParams(searchDto);
  }

  /**
   * Find single review by ID
   */
  async findOne(id: number, hideEvaluation = false, user?: User): Promise<EnrichedQuarterlyReview> {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });
    await this.assertCeoManagerEmployee(review?.employeeId, user);

    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found`);
    }

    const enrichedList = await this.enrichReviewsWithDetails([review]);
    const enriched = enrichedList[0];
    // Employee-assigner viewing a review they assigned must see final rating / scores
    let hide = hideEvaluation;
    if (hide && user) {
      hide = await this.shouldHideEvaluation(user, {
        reviewAssignerId: enriched?.assignerId,
      });
    }
    return hide ? this.withoutEvaluation(enriched) : enriched;
  }

  /** Employees hide scores on their own appraisals; assigners keep scores on reviews they assigned. */
  hidesManagerEvaluation(user?: User): boolean {
    return user?.userType === UserType.EMPLOYEE;
  }

  async shouldHideEvaluation(
    user?: User,
    opts?: { listAssignerId?: string; reviewAssignerId?: string },
  ): Promise<boolean> {
    if (!this.hidesManagerEvaluation(user)) return false;
    const loginId = user?.loginId || (user as { employeeId?: string })?.employeeId;
    if (!loginId) return true;
    const sessionId = await this.resolveSessionEmployeeId(String(loginId));
    if (opts?.listAssignerId?.trim() && opts.listAssignerId.trim() === sessionId) {
      return false;
    }
    if (opts?.reviewAssignerId?.trim() && opts.reviewAssignerId.trim() === sessionId) {
      return false;
    }
    return true;
  }

  private withoutEvaluation<T extends EnrichedQuarterlyReview>(review: T): T {
    const copy = { ...review };
    const hidden = [
      'overallPerformanceRating',
      'productivity',
      'qualityOfWork',
      'technicalJobSkills',
      'ownershipResponsibility',
      'communication',
      'teamCollaboration',
      'innovationProblemSolving',
      'finalRating',
      'ratingDescription',
      'performanceIndex',
      'performanceStrengths',
      'areasOfImprovement',
      'managerComment',
      'goalsForNextReviewPeriod',
      'trainingDevelopmentRecommendations',
      'careerGrowthRecommendation',
      'reviewOutcome',
      'performanceAction',
      'managerConfirmation',
      'assignerConfirmation',
    ] as const;
    hidden.forEach((key) => {
      delete (copy as any)[key];
    });
    if (copy.yearlyQuarterReviews) {
      const maskSnapshot = (snapshot: YearlyQuarterReviewSnapshot | null) =>
        snapshot
          ? {
              ...snapshot,
              productivity: null,
              qualityOfWork: null,
              technicalJobSkills: null,
              ownershipResponsibility: null,
              communication: null,
              teamCollaboration: null,
              innovationProblemSolving: null,
              overallPerformanceRating: null,
              finalRating: null,
              ratingDescription: null,
              performanceStrengths: null,
              areasOfImprovement: null,
              managerComment: null,
              goalsForNextReviewPeriod: null,
              careerGrowthRecommendation: null,
              reviewOutcome: null,
              performanceAction: null,
              managerConfirmation: false,
              assignerConfirmation: false,
            }
          : null;
      copy.yearlyQuarterReviews = {
        Q1: maskSnapshot(copy.yearlyQuarterReviews.Q1),
        Q2: maskSnapshot(copy.yearlyQuarterReviews.Q2),
        Q3: maskSnapshot(copy.yearlyQuarterReviews.Q3),
        Q4: maskSnapshot(copy.yearlyQuarterReviews.Q4),
      };
    }
    return copy;
  }

  /**
   * Update review
   */
  async update(
    id: number,
    updateDto: UpdateQuarterlyReviewDto,
    user?: User,
  ): Promise<EnrichedQuarterlyReview> {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });
    await this.assertCeoManagerEmployee(review?.employeeId, user);

    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found`);
    }

    const hasEvaluationScores =
      updateDto.productivity != null &&
      updateDto.qualityOfWork != null &&
      updateDto.ownershipResponsibility != null &&
      updateDto.communication != null &&
      updateDto.teamCollaboration != null &&
      updateDto.innovationProblemSolving != null;

    const definedUpdate = Object.fromEntries(
      Object.entries(updateDto).filter(([, value]) => value !== undefined),
    );
    delete definedUpdate.status;
    delete definedUpdate.assignedDate;
    delete definedUpdate.quarter;
    delete definedUpdate.financialYear;
    delete definedUpdate.employeeId;
    delete definedUpdate.finalRating;
    const assignmentFields =
      definedUpdate.deadlineDate !== undefined || definedUpdate.description !== undefined;
    if (this.isEvaluationFinished(review.status) && assignmentFields && !hasEvaluationScores) {
      throw new BadRequestException('Deadline and description are locked after the review is completed.');
    }
    if (this.isEvaluationFinished(review.status) && hasEvaluationScores) {
      delete definedUpdate.deadlineDate;
      delete definedUpdate.description;
    }
    if (definedUpdate.deadlineDate) {
      review.assignedDate = this.calendarDate(updateDto.assignedDate || new Date());
      const assigned = this.dateOnly(review.assignedDate);
      this.assertDeadlineAfterAssigned(assigned, String(definedUpdate.deadlineDate));

      const newDeadlineStr = this.dateOnly(definedUpdate.deadlineDate);
      if (newDeadlineStr) {
        const performance = await this.performanceRepository.findOne({
          where: {
            employeeId: review.employeeId,
            quarter: review.quarter,
            financialYear: review.financialYear,
          },
        });
        if (
          performance &&
          (performance.status === EmployeePerformanceStatus.EDIT_GRANTED ||
            review.status === QuarterlyReviewStatus.EDIT_GRANTED ||
            performance.editAllowedUntil)
        ) {
          const [year, month, day] = newDeadlineStr.split('-').map(Number);
          performance.editAllowedUntil = new Date(year, month - 1, day, 23, 59, 59, 0);
          performance.lastModifiedDate = new Date();
          await this.performanceRepository.save(performance);
        }
      }
    }
    Object.assign(review, definedUpdate);

    if (hasEvaluationScores) {
      const typed = Number(updateDto.finalRating);
      if (!Number.isFinite(typed) || typed < 1 || typed > 5) {
        throw new BadRequestException('Enter a final rating from 1 to 5.');
      }
      const rounded = Math.min(5, Math.max(1, Math.round(typed)));
      review.finalRating = Number(typed.toFixed(1));
      review.ratingDescription = RATING_DESCRIPTIONS[rounded] || 'Meets Expectations';
      review.status = QuarterlyReviewStatus.COMPLETED;
      review.reviewedDate = new Date();
    }

    if (hasEvaluationScores || definedUpdate.deadlineDate) {
      const updateEntry = createAuditEntry({
        employeeId: review.employeeId,
        managerId: review.managerId || review.assignerId,
        quarter: review.quarter,
        financialYear: review.financialYear,
        createdBy: review.assignerId || 'ADMIN',
        createdDate: review.assignedDate,
        assignedDate: review.assignedDate,
        deadlineDate: review.deadlineDate,
        submittedDate: review.reviewedDate || review.submittedDate,
        submittedBy: hasEvaluationScores
          ? (review.managerId || review.assignerId || 'MANAGER')
          : (review.submittedDate ? review.employeeId : null),
        status: review.status,
        lastModifiedBy: review.managerId || review.assignerId || 'ADMIN',
        details: hasEvaluationScores
          ? `Review evaluated with rating: ${review.finalRating}`
          : `Review deadline updated to ${definedUpdate.deadlineDate}`,
      });
      review.auditHistory = appendAuditEntry(review.auditHistory, updateEntry);
    }

    const updated = await this.reviewRepository.save(review);

    if (definedUpdate.deadlineDate && updated.deadlineDate && isOneDayBeforeDeadline(updated.deadlineDate, new Date())) {
      try {
        await this.noticeService.notifyOneDayDeadlineReminder({
          employeeId: updated.employeeId,
          employeeName: updated.employeeName || updated.employeeId,
          quarter: updated.quarter,
          financialYear: updated.financialYear,
          deadlineDate: updated.deadlineDate,
        });
      } catch (noticeErr) {
        this.logger.warn(`Could not dispatch 1-day reminder notice on update: ${noticeErr}`);
      }
    }

    if (hasEvaluationScores) {
      await this.markPerformanceCompleted(updated);
      await this.propagateYearlyReview(updated);
      await this.annualService.syncEmployeeAnnualRating(updated.employeeId, updated.financialYear);
      await this.noticeService.notifyEmployeeReviewCompleted({
        employeeId: updated.employeeId,
        employeeName: updated.employeeName || updated.employeeId,
        quarter: updated.quarter,
        financialYear: updated.financialYear,
      });
    } else {
      await this.propagateYearlyReview(updated);
    }

    const enrichedList = await this.enrichReviewsWithDetails([updated]);
    return enrichedList[0];
  }

  /**
   * Delete review
   */
  async remove(id: number): Promise<{ success: boolean; message: string }> {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found`);
    }

    await this.reviewRepository.remove(review);
    return {
      success: true,
      message: `Quarterly review with ID ${id} deleted successfully`,
    };
  }

  private calendarDate(value?: Date | string | null): Date | null {
    const day = this.dateOnly(value);
    if (!day) {
      return null;
    }
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date, 12, 0, 0, 0);
  }

  private dateOnly(value?: Date | string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return undefined;
      }
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const date = String(value.getDate()).padStart(2, '0');
      return `${value.getFullYear()}-${month}-${date}`;
    }
    const text = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
  }

  private assertDeadlineAfterAssigned(assignedDate?: string | null, deadlineDate?: string | null): void {
    if (!deadlineDate) return;
    const deadline = deadlineDate.slice(0, 10);
    const assigned = assignedDate
      ? assignedDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (deadline <= assigned) {
      throw new BadRequestException(DEADLINE_AFTER_ASSIGNED_MESSAGE);
    }
  }

  private async matchesStoredPassword(typed: string, stored?: string | null): Promise<boolean> {
    if (!stored) {
      return false;
    }
    if (stored.startsWith('$2')) {
      return this.usersService.comparePassword(typed, stored);
    }
    return stored === typed;
  }

  private isEvaluationFinished(status: QuarterlyReviewStatus): boolean {
    return status === QuarterlyReviewStatus.COMPLETED || status === QuarterlyReviewStatus.REVIEWED;
  }

  private async markPerformanceCompleted(review: QuarterlyReview): Promise<void> {
    const performance = await this.performanceRepository.findOne({
      where: {
        employeeId: review.employeeId,
        quarter: review.quarter,
        financialYear: review.financialYear,
      },
    });
    if (!performance || performance.status === EmployeePerformanceStatus.COMPLETED) {
      return;
    }
    performance.status = EmployeePerformanceStatus.COMPLETED;
    await this.performanceRepository.save(performance);
  }

  private async markPerformanceEvaluationInProgress(review: QuarterlyReview): Promise<void> {
    const performance = await this.performanceRepository.findOne({
      where: {
        employeeId: review.employeeId,
        quarter: review.quarter,
        financialYear: review.financialYear,
      },
    });
    if (!performance || performance.status === EmployeePerformanceStatus.COMPLETED) {
      return;
    }
    performance.status = EmployeePerformanceStatus.EVALUATION_IN_PROGRESS;
    await this.performanceRepository.save(performance);
  }

  private async syncPerformanceAudit(review: QuarterlyReview, entry: AppraisalAuditEntry): Promise<void> {
    try {
      const performance = await this.performanceRepository.findOne({
        where: {
          employeeId: review.employeeId,
          quarter: review.quarter,
          financialYear: review.financialYear,
        },
      });
      if (performance) {
        performance.auditHistory = appendAuditEntry(performance.auditHistory, entry);
        await this.performanceRepository.save(performance);
      }
    } catch (err) {
      this.logger.warn(`Could not sync performance audit entry: ${err instanceof Error ? err.message : err}`);
    }
  }

  private isYearlyQuarterStored(quarter: unknown): boolean {
    if (quarter == null) return false;
    if (Array.isArray(quarter)) {
      return quarter.some((item) => String(item).toUpperCase().includes('Q'));
    }
    if (typeof quarter === 'object') return true; // legacy { Q1: "Q1", ... }
    const value = String(quarter).trim();
    const upper = value.toUpperCase();
    if (
      upper === QuaterlyEnum.Q1 ||
      upper === QuaterlyEnum.Q2 ||
      upper === QuaterlyEnum.Q3 ||
      upper === QuaterlyEnum.Q4
    ) {
      return false;
    }
    return (
      upper === 'YEARLY' ||
      upper === String(QuaterlyEnum.YEARLY).toUpperCase() ||
      upper.includes('YEARLY') ||
      (upper.includes('Q1') && upper.includes('Q2') && upper.includes('Q3') && upper.includes('Q4')) ||
      (value.startsWith('{') && value.includes('Q1')) ||
      (value.startsWith('[') && value.includes('Q1'))
    );
  }

  private async ensureAssignedPerformance(
    employeeId: string,
    quarter: any,
    financialYear: string,
  ): Promise<EmployeePerformance> {
    const isYearly = this.isYearlyQuarterStored(quarter);
    if (isYearly) {
      const records = await this.performanceRepository.find({
        where: { employeeId, financialYear },
      });
      const existingYearly = records.find((r) => this.isYearlyQuarterStored(r.quarter));
      if (existingYearly) {
        const isCanonicalArray =
          Array.isArray(existingYearly.quarter) &&
          existingYearly.quarter.map(String).join(',') === 'Q1,Q2,Q3,Q4';
        if (!isCanonicalArray) {
          existingYearly.quarter = ['Q1', 'Q2', 'Q3', 'Q4'];
          await this.performanceRepository.save(existingYearly);
        }
        return existingYearly;
      }
      return await this.performanceRepository.save(
        this.performanceRepository.create({
          employeeId,
          quarter: ['Q1', 'Q2', 'Q3', 'Q4'],
          financialYear,
          status: EmployeePerformanceStatus.NOT_STARTED,
        }),
      );
    }
    const existing = await this.performanceRepository.findOne({
      where: { employeeId, quarter, financialYear },
    });
    if (existing) {
      return existing;
    }
    return await this.performanceRepository.save(
      this.performanceRepository.create({
        employeeId,
        quarter,
        financialYear,
        status: EmployeePerformanceStatus.NOT_STARTED,
      }),
    );
  }

  /**
   * Helper: Enrich reviews with linked employee self-assessment and overdue status
   */
  private async enrichReviewsWithDetails(
    reviews: QuarterlyReview[],
  ): Promise<EnrichedQuarterlyReview[]> {
    if (!reviews.length) return [];

    const employeeIds = Array.from(
      new Set([
        ...reviews.map((r) => r.employeeId),
        ...reviews.map((r) => r.assignerId),
      ].filter(Boolean)),
    );

    // Fetch matching employee details for department / name / designation fallback
    const empDetails = employeeIds.length
      ? await this.employeeDetailsRepository.find({
          where: { employeeId: In(employeeIds) },
        })
      : [];
    const empMap = new Map<string, { fullName?: string; department?: string; designation?: string }>();
    empDetails.forEach((e) => {
      empMap.set(e.employeeId, {
        fullName: e.fullName,
        department: e.department,
        designation: e.designation,
      });
    });

    // Fetch matching self-assessments
    const perfRecords = await this.performanceRepository.find({
      where: { employeeId: In(employeeIds) },
    });

    const perfMap = new Map<string, EmployeePerformance>();
    perfRecords.forEach((p) => {
      perfMap.set(`${p.employeeId}-${p.quarter}-${p.financialYear}`, p);
    });

    for (const review of reviews) {
      if (review.reviewPeriod !== ReviewPeriod.YEARLY) {
        continue;
      }
      const previous = review.yearlyQuarterReviews;
      const wasEmpty = !previous?.Q1 && !previous?.Q2 && !previous?.Q3 && !previous?.Q4;
      const filled = await this.buildYearlyQuarterReviews(
        review.employeeId,
        review.financialYear,
        review,
      );
      review.yearlyQuarterReviews = filled;
      review.reviewPeriod = ReviewPeriod.YEARLY;
      if (wasEmpty && (filled.Q1 || filled.Q2 || filled.Q3 || filled.Q4)) {
        await this.reviewRepository.save(review);
      }
    }

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestWindowMs = appraisalWindowMs(APPRAISAL_EDIT_WINDOW_HOURS);

    for (const review of reviews) {
      const perfKey = `${review.employeeId}-${typeof review.quarter === 'object' ? 'YEARLY' : review.quarter}-${review.financialYear}`;
      const rawPerf = (review.performanceId ? perfRecords.find(p => p.id === review.performanceId) : null) || perfMap.get(perfKey) || null;
      const status = (rawPerf?.status || review.status) as EmployeePerformanceStatus;

      // Dispatch 1-day reminder if appraisal deadline is due tomorrow
      if (SUBMITTABLE_PERFORMANCE_STATUSES.includes(status)) {
        const effectiveDeadline = rawPerf?.editAllowedUntil || review.deadlineDate;
        if (effectiveDeadline && isOneDayBeforeDeadline(effectiveDeadline, now)) {
          void this.noticeService.notifyOneDayDeadlineReminder({
            employeeId: review.employeeId,
            employeeName: review.employeeName || review.employeeId,
            quarter: typeof review.quarter === 'object' ? 'YEARLY' : review.quarter,
            financialYear: review.financialYear,
            deadlineDate: effectiveDeadline,
          }).catch((err) => {
            this.logger.warn(`Could not dispatch 1-day reminder notice on enrich: ${err.message}`);
          });
        }
      }

      if (!shouldCloseRenewedAccess(review.reassignCount || 0, review.deadlineDate, status, now)) {
        continue;
      }
      review.status = QuarterlyReviewStatus.LOCKED;
      await this.reviewRepository.save(review);
      if (rawPerf && !isLockedReviewStatus(rawPerf.status)) {
        rawPerf.status = EmployeePerformanceStatus.LOCKED;
        rawPerf.lastModifiedDate = now;
        await this.performanceRepository.save(rawPerf);
      }
    }

    return reviews.map((r) => {
      const perfKey = `${r.employeeId}-${typeof r.quarter === 'object' ? 'YEARLY' : r.quarter}-${r.financialYear}`;
      const rawPerf = (r.performanceId ? perfRecords.find(p => p.id === r.performanceId) : null) || perfMap.get(perfKey) || null;
      const access = reviewAccessFlags({
        status: rawPerf?.status || r.status,
        deadlineDate: r.deadlineDate,
        submittedAt: rawPerf?.submittedAt || r.submittedDate,
        editAllowedUntil: rawPerf?.editAllowedUntil || null,
        reassignCount: r.reassignCount || 0,
        requestWindowMs,
        lockedAt: r.updatedAt,
        now,
      });
      const canRequestEdit = access.canRequestEdit;
      const remainingRequestHours = access.remainingRequestHours;
      const isEditWindowActive = access.isEditWindowActive;
      const canEdit = access.canEdit;

      let perf: (EmployeePerformance & {
        canRequestEdit?: boolean;
        remainingRequestHours?: number;
        canEdit?: boolean;
        isEditWindowActive?: boolean;
        step?: number;
      }) | null = null;

      if (rawPerf) {
        perf = {
          ...overlayPerformanceView(rawPerf),
          canRequestEdit,
          remainingRequestHours,
          isEditWindowActive,
          canEdit,
          step: computeResumeStep(rawPerf),
        };
      }

      const deadline = r.deadlineDate ? new Date(r.deadlineDate) : null;
      const isOverdue =
        deadline &&
        !this.isEvaluationFinished(r.status) &&
        deadline.getTime() < today.getTime();

      const empInfo = empMap.get(r.employeeId);
      const assignerInfo = empMap.get(r.assignerId);
      const department = r.department || empInfo?.department || null;
      const employeeName = r.employeeName || empInfo?.fullName || r.employeeId;
      const designation = r.designation || empInfo?.designation || null;
      const managerName =
        assignerInfo?.fullName ||
        (r.managerName &&
        r.managerName !== r.assignerId &&
        r.managerName !== 'Reporting Manager' &&
        String(r.managerName).toLowerCase() !== 'admin'
          ? r.managerName
          : null) ||
        r.managerName ||
        r.assignerId;

      return {
        ...r,
        department,
        employeeName,
        designation,
        managerName,
        performanceDetails: perf,
        canRequestEdit,
        remainingRequestHours,
        canEdit,
        isEditWindowActive,
        isOverdue: !!isOverdue,
      };
    });
  }

  async reassignReview(
    id: number,
    dto: ReassignQuarterlyReviewDto,
    user?: User,
  ): Promise<QuarterlyReview> {
    const review = await this.reviewRepository.findOne({ where: { id } });
    if (!review) {
      throw new NotFoundException(`Quarterly review #${id} was not found.`);
    }
    await this.assertCeoManagerEmployee(review.employeeId, user);

    if ((review.reassignCount || 0) >= 1 && isLockedReviewStatus(review.status)) {
      throw new BadRequestException(
        'This review was already reassigned. Access and editing stay closed.',
      );
    }

    if (isLockedReviewStatus(review.status)) {
      const access = reviewAccessFlags({
        status: review.status,
        deadlineDate: review.deadlineDate,
        submittedAt: review.submittedDate,
        editAllowedUntil: null,
        reassignCount: review.reassignCount || 0,
        requestWindowMs: appraisalWindowMs(APPRAISAL_EDIT_WINDOW_HOURS),
        lockedAt: review.updatedAt,
      });
      if (access.canRequestEdit) {
        throw new BadRequestException(
          'The employee still has 42 hours to request access. Re-assign is available after that window if they do not request it.',
        );
      }
    }

    if (!dto.deadlineDate) {
      throw new BadRequestException('A new deadline date is required for re-assignment.');
    }

    const todayDateStr = this.dateOnly(dto.reassignedDate || new Date()) || '';
    const newDeadlineStr = this.dateOnly(dto.deadlineDate);

    if (!newDeadlineStr || newDeadlineStr < todayDateStr) {
      throw new BadRequestException('The new deadline date must be today or in the future.');
    }

    const performance = await this.performanceRepository.findOne({
      where: {
        employeeId: review.employeeId,
        quarter: review.quarter,
        financialYear: review.financialYear,
      },
    });
    const wasSubmitted = !!(performance?.submittedAt || review.submittedDate);

    // 1. Update QuarterlyReview deadline for every login (manager + employee)
    review.assignedDate = this.calendarDate(dto.reassignedDate || new Date());
    review.deadlineDate = this.calendarDate(newDeadlineStr);
    review.status = wasSubmitted
      ? QuarterlyReviewStatus.EDIT_GRANTED
      : QuarterlyReviewStatus.REASSIGNED;
    if (!wasSubmitted) {
      review.reassignCount = (review.reassignCount || 0) + 1;
    }
    if (dto.reason?.trim()) {
      // Keep only the latest reassignment note in description (no prior text).
      review.description = `[Re-assigned on ${todayDateStr}]: ${dto.reason.trim()}`;
    }
    const reassignEntry = createAuditEntry({
      employeeId: review.employeeId,
      managerId: review.managerId || review.assignerId,
      quarter: review.quarter,
      financialYear: review.financialYear,
      createdBy: review.assignerId || 'ADMIN',
      createdDate: review.assignedDate,
      assignedDate: review.assignedDate,
      deadlineDate: review.deadlineDate,
      submittedDate: review.submittedDate,
      submittedBy: review.submittedDate ? review.employeeId : null,
      status: review.status,
      lastModifiedBy: user?.loginId || review.assignerId || 'MANAGER',
      details: dto.reason?.trim()
        ? `Review re-assigned with new deadline ${newDeadlineStr}. Reason: ${dto.reason.trim()}`
        : `Review re-assigned with new deadline ${newDeadlineStr}`,
    });
    review.auditHistory = appendAuditEntry(review.auditHistory, reassignEntry);
    const savedReview = await this.reviewRepository.save(review);

    // 2. Update matching EmployeePerformance
    if (performance) {
      if (wasSubmitted) {
        performance.status = EmployeePerformanceStatus.EDIT_GRANTED;
        // End of the deadline calendar day. Avoid .999 ms — MySQL can round that to the next day.
        const [year, month, day] = newDeadlineStr.split('-').map(Number);
        performance.editAllowedUntil = new Date(year, month - 1, day, 23, 59, 59, 0);
      } else {
        // Employee self-review side stays NOT_STARTED so they can fill again.
        performance.status = EmployeePerformanceStatus.NOT_STARTED;
        performance.editAllowedUntil = null;
      }
      performance.lastModifiedDate = new Date();
      if (user?.loginId) {
        performance.lastModifiedBy = user.loginId;
      }
      performance.auditHistory = appendAuditEntry(performance.auditHistory, reassignEntry);
      await this.performanceRepository.save(performance);
    }

    // 3. Send notification to employee
    try {
      await this.noticeService.notifyEmployeeOfReassignment({
        employeeId: review.employeeId,
        employeeName: review.employeeName || review.employeeId,
        quarter: review.quarter,
        financialYear: review.financialYear,
        deadlineDate: review.deadlineDate,
      });
    } catch (err) {
      this.logger.warn(`Could not dispatch reassignment notice on reassign: ${err}`);
    }

    if (review.deadlineDate && isOneDayBeforeDeadline(review.deadlineDate, new Date())) {
      try {
        await this.noticeService.notifyOneDayDeadlineReminder({
          employeeId: review.employeeId,
          employeeName: review.employeeName || review.employeeId,
          quarter: review.quarter,
          financialYear: review.financialYear,
          deadlineDate: review.deadlineDate,
          force: true,
        });
      } catch (noticeErr) {
        this.logger.warn(`Could not dispatch 1-day reminder notice on reassign: ${noticeErr}`);
      }
    }

    await this.propagateYearlyReview(review);
    this.logger.log(
      `Re-assigned review #${id} for ${review.employeeId} (${review.quarter} ${review.financialYear}) with new deadline ${newDeadlineStr}`,
    );

    return savedReview;
  }
}

// Aliases
export const MasterQuaterlyReviewService = QuarterlyReviewService;
export type MasterQuaterlyReviewService = QuarterlyReviewService;
export const QuaterlyReviewService = QuarterlyReviewService;
export type QuaterlyReviewService = QuarterlyReviewService;
