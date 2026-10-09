import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
} from '../dto/quarterly_review.dto';
import {
  QuarterlyReviewStatus,
  RATING_DESCRIPTIONS,
  ReviewEmployeeType,
  ReviewAssignedBy,
  RatingVisibilityStatus,
  QuaterlyEnum,
} from '../enums/quarterly_review.enums';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { AnnualAppraisalService } from './annual_appraisal.service';
import { AppraisalNoticeService } from './appraisal_notice.service';
import {
  duplicateAssignmentMessage,
  DEADLINE_AFTER_ASSIGNED_MESSAGE,
  EMPLOYEE_NOT_FOUND_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
  QUARTER_WINDOW_UNAVAILABLE_MESSAGE,
  RATING_NOT_READY_MESSAGE,
  quarterNotAssignableMessage,
  APPRAISAL_EDIT_WINDOW_HOURS,
  appraisalWindowMs,
} from '../constants/appraisal.constants';
import { MasterFinancialYearService } from '../../master/service/master-financialyear.service';
import { UsersService } from '../../users/service/user.service';
import { User } from '../../users/entities/user.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { RevealedEvaluationDto } from '../dto/reveal_rating.dto';

export interface EnrichedQuarterlyReview extends QuarterlyReview {
  performanceDetails?: (EmployeePerformance & {
    canRequestEdit?: boolean;
    remainingRequestHours?: number;
    canEdit?: boolean;
    isEditWindowActive?: boolean;
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
  async create(createDto: CreateQuarterlyReviewDto): Promise<EnrichedQuarterlyReview> {
    try {
      this.logger.log(
        `Creating review for employee: ${createDto.employeeId}, Quarter: ${createDto.quarter}, FY: ${createDto.financialYear}`,
      );

      const emp = await this.employeeDetailsRepository.findOne({
        where: { employeeId: createDto.employeeId },
      });
      if (!emp) {
        throw new BadRequestException(EMPLOYEE_NOT_FOUND_MESSAGE);
      }

      await this.assertAssignableQuarter(createDto.quarter, createDto.financialYear);

      const employeeId = createDto.employeeId.trim();
      const financialYear = createDto.financialYear.trim();
      const existing = await this.reviewRepository
        .createQueryBuilder('review')
        .where('review.employeeId = :employeeId', { employeeId })
        .andWhere('review.quarter = :quarter', { quarter: createDto.quarter })
        .andWhere('TRIM(review.financialYear) = :financialYear', { financialYear })
        .getOne();

      if (existing) {
        throw new BadRequestException(
          duplicateAssignmentMessage(employeeId, createDto.quarter, financialYear),
        );
      }

      // Auto-populate reporting manager if not supplied
      const mapping = await this.managerMappingRepository.findOne({
        where: { employeeId: createDto.employeeId },
      });

      const assignerId = createDto.assignerId || mapping?.managerId || 'MANAGER';
      const managerName = mapping?.managerName || 'Reporting Manager';

      this.assertDeadlineAfterAssigned(
        createDto.assignedDate,
        createDto.deadlineDate,
      );

      const review = this.reviewRepository.create({
        employeeId,
        financialYear,
        quarter: createDto.quarter,
        employeeType: createDto.employeeType || ReviewEmployeeType.EMPLOYEE,
        description: createDto.description || null,
        employeeName: emp?.fullName || createDto.employeeId,
        department: emp?.department || null,
        designation: emp?.designation || null,
        assignedBy: createDto.assignedBy || ReviewAssignedBy.MANAGER,
        assignerId,
        managerName,
        assignedDate: createDto.assignedDate ? new Date(createDto.assignedDate) : new Date(),
        deadlineDate: createDto.deadlineDate ? new Date(createDto.deadlineDate) : null,
        status: QuarterlyReviewStatus.ASSIGNED,
      });

      const saved = await this.reviewRepository.save(review);
      const performance = await this.ensureAssignedPerformance(
        saved.employeeId,
        saved.quarter,
        saved.financialYear,
      );
      saved.performanceId = performance.id;
      await this.reviewRepository.save(saved);
      await this.noticeService.notifyEmployeeOfAssignment({
        employeeId: saved.employeeId,
        employeeName: saved.employeeName || saved.employeeId,
        quarter: saved.quarter,
        financialYear: saved.financialYear,
        deadlineDate: saved.deadlineDate,
      });
      const enrichedList = await this.enrichReviewsWithDetails([saved]);
      return enrichedList[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating quarterly review: ${message}`, stack);
      if (error instanceof HttpException) throw error;
      const driverError = error as { code?: string; errno?: number };
      if (driverError.code === 'ER_DUP_ENTRY' || driverError.errno === 1062) {
        throw new BadRequestException(
          duplicateAssignmentMessage(
            createDto.employeeId.trim(),
            createDto.quarter,
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
  ): Promise<EnrichedQuarterlyReview> {
    try {
      const review = await this.reviewRepository.findOne({
        where: { id },
      });

      if (!review) {
        throw new NotFoundException(`Quarterly review with ID ${id} not found.`);
      }

      // Calculate Average Score (1 to 5 scale)
      const scores = [
        evalDto.productivity,
        evalDto.qualityOfWork,
        evalDto.ownership,
        evalDto.communication,
        evalDto.teamCollaboration,
        evalDto.innovation,
      ];

      const sum = scores.reduce((acc, curr) => acc + curr, 0);
      const calculated = Number((sum / scores.length).toFixed(2));
      const finalRating = evalDto.overrideFinalScore ?? calculated;
      const ratingDescription = RATING_DESCRIPTIONS[Math.round(Number(finalRating))] || 'Meets Expectations';

      review.productivity = evalDto.productivity;
      review.qualityOfWork = evalDto.qualityOfWork;
      review.ownershipResponsibility = evalDto.ownership;
      review.communication = evalDto.communication;
      review.teamCollaboration = evalDto.teamCollaboration;
      review.innovationProblemSolving = evalDto.innovation;
      review.finalRating = Number(Number(finalRating).toFixed(2));
      review.ratingDescription = ratingDescription;

      if (evalDto.overrideFinalScore) {
        review.overrideFinalScore = evalDto.overrideFinalScore;
        review.overrideJustification = evalDto.overrideJustification || null;
      }

      review.performanceStrengths = evalDto.performanceStrengths;
      review.areasOfImprovement = evalDto.areasOfImprovement;
      review.additionalRemarks = evalDto.additionalRemarks || null;

      review.status = QuarterlyReviewStatus.COMPLETED;
      review.reviewedDate = new Date();

      const saved = await this.reviewRepository.save(review);
      await this.markPerformanceCompleted(saved);
      await this.annualService.syncEmployeeAnnualRating(saved.employeeId, saved.financialYear);

      await this.noticeService.notifyEmployeeReviewCompleted({
        employeeId: saved.employeeId,
        employeeName: saved.employeeName || saved.employeeId,
        quarter: saved.quarter,
        financialYear: saved.financialYear,
      });

      const enrichedList = await this.enrichReviewsWithDetails([saved]);
      return enrichedList[0];
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

    // Deduplicate by ID
    const uniqueReviews = Array.from(new Map(reviews.map((r) => [r.id, r])).values());

    const completed = uniqueReviews.filter((r) => this.isEvaluationFinished(r.status));
    const pending = uniqueReviews.filter((r) => !this.isEvaluationFinished(r.status));

    // Calculate rating distribution and average
    const ratedScores = completed
      .map((r) => r.finalRating)
      .filter((rating): rating is number => typeof rating === 'number' && rating > 0);

    const averageTeamRating =
      ratedScores.length > 0
        ? Number((ratedScores.reduce((a, b) => a + b, 0) / ratedScores.length).toFixed(2))
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
      performanceStrengths: review.performanceStrengths || '',
      areasOfImprovement: review.areasOfImprovement || '',
      additionalRemarks: review.additionalRemarks || '',
      passwordVerified: true,
    };
    return revealed;
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
      'Productivity (1-5)': r.productivity,
      'Quality of Work (1-5)': r.qualityOfWork,
      'Ownership (1-5)': r.ownershipResponsibility,
      'Communication (1-5)': r.communication,
      'Team Collaboration (1-5)': r.teamCollaboration,
      'Innovation (1-5)': r.innovationProblemSolving,
      'Final Rating': r.finalRating,
      'Rating Description': r.ratingDescription,
      'Performance Strengths': r.performanceStrengths,
      'Areas of Improvement': r.areasOfImprovement,
      'Additional Remarks': r.additionalRemarks,
      'Key Accomplishments': r.performanceDetails?.keyAccomplishments || '',
      'Major Projects': (r.performanceDetails?.projects || []).map((project) => project.title).filter(Boolean).join(', '),
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

      if (params?.name?.trim() || params?.department?.trim()) {
        const empQb = this.employeeDetailsRepository.createQueryBuilder('emp');
        if (params.name?.trim()) {
          empQb.andWhere('emp.fullName LIKE :name', { name: `%${params.name.trim()}%` });
        }
        if (params.department?.trim()) {
          empQb.andWhere('emp.department LIKE :department', { department: `%${params.department.trim()}%` });
        }

        const matchedEmployees = await empQb.select('emp.employeeId', 'employeeId').getRawMany();
        const matchedIds = matchedEmployees.map((e) => e.employeeId).filter(Boolean);

        if (matchedIds.length === 0) {
          return { data: [], total: 0, page: params?.page, limit: params?.limit };
        }
        qb.andWhere('review.employeeId IN (:...matchedIds)', { matchedIds });
      }

      if (params?.financialYear?.trim()) {
        qb.andWhere('review.financialYear = :fy', { fy: params.financialYear.trim() });
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
        const teamEmployeeIds = teamMappings.map((m) => m.employeeId).filter(Boolean);
        if (teamEmployeeIds.length > 0) {
          qb.andWhere(
            '(review.assignerId = :assignerId OR review.employeeId IN (:...teamEmployeeIds))',
            { assignerId, teamEmployeeIds },
          );
        } else {
          qb.andWhere('review.assignerId = :assignerId', { assignerId });
        }
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
  async findOne(id: number, hideEvaluation = false): Promise<EnrichedQuarterlyReview> {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found`);
    }

    const enrichedList = await this.enrichReviewsWithDetails([review]);
    const enriched = enrichedList[0];
    return hideEvaluation ? this.withoutEvaluation(enriched) : enriched;
  }

  hidesManagerEvaluation(user?: User): boolean {
    return user?.userType === UserType.EMPLOYEE;
  }

  private withoutEvaluation<T extends EnrichedQuarterlyReview>(review: T): T {
    const copy = { ...review };
    const hidden = [
      'productivity',
      'qualityOfWork',
      'ownershipResponsibility',
      'communication',
      'teamCollaboration',
      'innovationProblemSolving',
      'finalRating',
      'ratingDescription',
      'overrideFinalScore',
      'overrideJustification',
      'performanceIndex',
      'performanceStrengths',
      'areasOfImprovement',
      'additionalRemarks',
    ] as const;
    hidden.forEach((key) => {
      delete copy[key];
    });
    return copy;
  }

  /**
   * Update review
   */
  async update(
    id: number,
    updateDto: UpdateQuarterlyReviewDto,
  ): Promise<EnrichedQuarterlyReview> {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });

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
      const assigned = this.dateOnly(
        typeof definedUpdate.assignedDate === 'string' ? definedUpdate.assignedDate : review.assignedDate,
      );
      this.assertDeadlineAfterAssigned(assigned, String(definedUpdate.deadlineDate));
    }
    Object.assign(review, definedUpdate);

    if (hasEvaluationScores) {
      const typed = Number(updateDto.finalRating);
      if (!Number.isFinite(typed) || typed < 1 || typed > 5) {
        throw new BadRequestException('Enter a final rating from 1 to 5.');
      }
      const rounded = Math.min(5, Math.max(1, Math.round(typed)));
      review.finalRating = Number(typed.toFixed(2));
      review.ratingDescription = RATING_DESCRIPTIONS[rounded] || 'Meets Expectations';
      review.status = QuarterlyReviewStatus.COMPLETED;
      review.reviewedDate = new Date();
    }

    const updated = await this.reviewRepository.save(review);

    if (hasEvaluationScores) {
      await this.markPerformanceCompleted(updated);
      await this.annualService.syncEmployeeAnnualRating(updated.employeeId, updated.financialYear);
      await this.noticeService.notifyEmployeeReviewCompleted({
        employeeId: updated.employeeId,
        employeeName: updated.employeeName || updated.employeeId,
        quarter: updated.quarter,
        financialYear: updated.financialYear,
      });
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

  private dateOnly(value?: Date | string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
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

  private async ensureAssignedPerformance(
    employeeId: string,
    quarter: QuaterlyEnum,
    financialYear: string,
  ): Promise<EmployeePerformance> {
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

    const employeeIds = Array.from(new Set(reviews.map((r) => r.employeeId).filter(Boolean)));

    // Fetch matching self-assessments
    const perfRecords = await this.performanceRepository.find({
      where: { employeeId: In(employeeIds) },
    });

    const perfMap = new Map<string, EmployeePerformance>();
    perfRecords.forEach((p) => {
      perfMap.set(`${p.employeeId}-${p.quarter}-${p.financialYear}`, p);
    });

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestWindowMs = appraisalWindowMs(APPRAISAL_EDIT_WINDOW_HOURS);

    return reviews.map((r) => {
      const perfKey = `${r.employeeId}-${r.quarter}-${r.financialYear}`;
      const rawPerf = perfMap.get(perfKey) || null;

      let canRequestEdit = false;
      let remainingRequestHours = 0;
      let isEditWindowActive = false;
      let canEdit = false;

      let perf: (EmployeePerformance & {
        canRequestEdit?: boolean;
        remainingRequestHours?: number;
        canEdit?: boolean;
        isEditWindowActive?: boolean;
      }) | null = null;

      if (rawPerf) {
        if (rawPerf.status === EmployeePerformanceStatus.SUBMITTED && rawPerf.submittedAt) {
          const diffMs = now.getTime() - new Date(rawPerf.submittedAt).getTime();
          canRequestEdit = diffMs <= requestWindowMs;
          if (canRequestEdit) {
            remainingRequestHours = Math.max(1, Math.round((requestWindowMs - diffMs) / (3600 * 1000)));
          }
        }

        isEditWindowActive = !!(
          rawPerf.status === EmployeePerformanceStatus.EDIT_GRANTED &&
          rawPerf.editAllowedUntil &&
          now.getTime() <= new Date(rawPerf.editAllowedUntil).getTime()
        );

        canEdit =
          isEditWindowActive ||
          rawPerf.status === EmployeePerformanceStatus.DRAFT ||
          rawPerf.status === EmployeePerformanceStatus.NOT_STARTED ||
          rawPerf.status === EmployeePerformanceStatus.NOT_UPDATED;

        perf = {
          ...rawPerf,
          canRequestEdit,
          remainingRequestHours,
          isEditWindowActive,
          canEdit,
        };
      } else {
        canEdit = !this.isEvaluationFinished(r.status);
      }

      const deadline = r.deadlineDate ? new Date(r.deadlineDate) : null;
      const isOverdue =
        deadline &&
        !this.isEvaluationFinished(r.status) &&
        deadline.getTime() < today.getTime();

      return {
        ...r,
        performanceDetails: perf,
        canRequestEdit,
        remainingRequestHours,
        canEdit,
        isEditWindowActive,
        isOverdue: !!isOverdue,
      };
    });
  }
}

// Aliases
export const MasterQuaterlyReviewService = QuarterlyReviewService;
export type MasterQuaterlyReviewService = QuarterlyReviewService;
export const QuaterlyReviewService = QuarterlyReviewService;
export type QuaterlyReviewService = QuarterlyReviewService;
