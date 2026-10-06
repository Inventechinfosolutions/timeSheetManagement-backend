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
} from '../enums/quarterly_review.enums';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';

export interface EnrichedQuarterlyReview extends QuarterlyReview {
  performanceDetails?: EmployeePerformance | null;
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
  ) {}

  /**
   * FR-02: Create Quarterly Review cycle (Manager / Admin assigns)
   * Guard: An employee can only have ONE review per quarter + financial year.
   */
  async create(createDto: CreateQuarterlyReviewDto): Promise<EnrichedQuarterlyReview> {
    try {
      this.logger.log(
        `Creating review for employee: ${createDto.employeeId}, Quarter: ${createDto.quarter}, FY: ${createDto.financialYear}`,
      );

      // Check for duplicate submission/review for this quarter
      const existing = await this.reviewRepository.findOne({
        where: {
          employeeId: createDto.employeeId,
          quarter: createDto.quarter,
          financialYear: createDto.financialYear,
        },
      });

      if (existing) {
        throw new BadRequestException(
          `A quarterly review for employee ${createDto.employeeId} for quarter ${createDto.quarter} (${createDto.financialYear}) already exists.`,
        );
      }

      // Auto-populate employee details
      const emp = await this.employeeDetailsRepository.findOne({
        where: { employeeId: createDto.employeeId },
      });

      // Auto-populate reporting manager if not supplied
      const mapping = await this.managerMappingRepository.findOne({
        where: { employeeId: createDto.employeeId },
      });

      const assignerId = createDto.assignerId || mapping?.managerId || 'MANAGER';
      const managerName = mapping?.managerName || 'Reporting Manager';

      const review = this.reviewRepository.create({
        employeeId: createDto.employeeId,
        financialYear: createDto.financialYear,
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
        status: createDto.status || QuarterlyReviewStatus.NOT_STARTED,
      });

      const saved = await this.reviewRepository.save(review);
      const enrichedList = await this.enrichReviewsWithDetails([saved]);
      return enrichedList[0];
    } catch (error) {
      this.logger.error(`Error creating quarterly review: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create review: ${error.message}`,
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

      if (review.status === QuarterlyReviewStatus.REVIEWED) {
        throw new BadRequestException('This review has already been evaluated and locked.');
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
      const averageScore = Number((sum / scores.length).toFixed(2));
      const finalRating = evalDto.overrideFinalScore ?? Math.round(averageScore);
      const ratingDescription = RATING_DESCRIPTIONS[finalRating] || 'Meets Expectations';

      review.productivity = evalDto.productivity;
      review.qualityOfWork = evalDto.qualityOfWork;
      review.ownershipResponsibility = evalDto.ownership;
      review.communication = evalDto.communication;
      review.teamCollaboration = evalDto.teamCollaboration;
      review.innovationProblemSolving = evalDto.innovation;
      review.averageScore = averageScore;
      review.finalRating = finalRating;
      review.ratingDescription = ratingDescription;

      if (evalDto.overrideFinalScore) {
        review.overrideFinalScore = evalDto.overrideFinalScore;
        review.overrideJustification = evalDto.overrideJustification || null;
      }

      review.performanceStrengths = evalDto.performanceStrengths;
      review.areasOfImprovement = evalDto.areasOfImprovement;
      review.additionalRemarks = evalDto.additionalRemarks || null;

      review.status = QuarterlyReviewStatus.REVIEWED;
      review.reviewedDate = new Date();

      const saved = await this.reviewRepository.save(review);

      // Keep EmployeePerformance in sync
      const perf = await this.performanceRepository.findOne({
        where: {
          employeeId: review.employeeId,
          quarter: review.quarter,
          financialYear: review.financialYear,
        },
      });
      if (perf) {
        perf.status = EmployeePerformanceStatus.REVIEWED;
        await this.performanceRepository.save(perf);
      }

      const enrichedList = await this.enrichReviewsWithDetails([saved]);
      return enrichedList[0];
    } catch (error) {
      this.logger.error(`Error evaluating review: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to submit evaluation: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * FR-01: Employee Dashboard View
   * Returns current quarter, submission status, due date, submitted date, and final rating (if reviewed).
   */
  async getEmployeeDashboard(employeeId: string): Promise<{
    currentQuarter: string;
    reviews: Array<{
      id: number;
      quarter: string;
      financialYear: string;
      submissionStatus: string;
      dueDate: Date | null;
      submittedDate: Date | null;
      ratingStatus: string;
      finalRating: number | null;
      ratingDescription: string | null;
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
        r.status !== QuarterlyReviewStatus.REVIEWED &&
        deadline.getTime() < today.getTime();

      const isReviewed = r.status === QuarterlyReviewStatus.REVIEWED;

      return {
        id: r.id,
        quarter: r.quarter,
        financialYear: r.financialYear,
        submissionStatus: r.status,
        dueDate: r.deadlineDate,
        submittedDate: r.submittedDate,
        ratingStatus: isReviewed ? 'Rated' : 'Pending Review',
        // FR-08: Only reveal rating if reviewed
        finalRating: isReviewed ? r.finalRating : null,
        ratingDescription: isReviewed ? r.ratingDescription : null,
        reviewedDate: r.reviewedDate,
        isOverdue: !!isOverdue,
      };
    });

    return {
      currentQuarter: reviews[0]?.quarter || 'Q1',
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

    const completed = uniqueReviews.filter((r) => r.status === QuarterlyReviewStatus.REVIEWED);
    const pending = uniqueReviews.filter((r) => r.status !== QuarterlyReviewStatus.REVIEWED);

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

    const isReviewed = review.status === QuarterlyReviewStatus.REVIEWED;

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
      finalRating: isReviewed ? review.finalRating : null,
      ratingDescription: isReviewed ? review.ratingDescription : null,
      // Hidden from employee:
      performanceStrengths: undefined,
      areasOfImprovement: undefined,
      additionalRemarks: undefined,
      productivity: undefined,
      qualityOfWork: undefined,
      ownershipResponsibility: undefined,
      communication: undefined,
      teamCollaboration: undefined,
      innovationProblemSolving: undefined,
      overrideJustification: undefined,
    };
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
      'Average Score': r.averageScore,
      'Final Rating': r.finalRating,
      'Rating Description': r.ratingDescription,
      'Performance Strengths': r.performanceStrengths,
      'Areas of Improvement': r.areasOfImprovement,
      'Additional Remarks': r.additionalRemarks,
      'Key Accomplishments': r.performanceDetails?.keyAccomplishments || '',
      'Major Projects': r.performanceDetails?.majorProjects || '',
    }));
  }

  /**
   * Find All reviews
   */
  async findAll(query?: QueryQuarterlyReviewDto): Promise<{
    data: EnrichedQuarterlyReview[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    return this.getByParams(query);
  }

  /**
   * Get reviews by parameters
   */
  async getByParams(params?: QueryQuarterlyReviewDto): Promise<{
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
        qb.andWhere('review.assignerId = :assignerId', { assignerId: params.assignerId.trim() });
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

      return {
        data: enriched,
        total,
        page: params?.page,
        limit: params?.limit,
      };
    } catch (error) {
      this.logger.error(`Error in getByParams: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch reviews: ${error.message}`,
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
  async findOne(id: number): Promise<EnrichedQuarterlyReview> {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Quarterly review with ID ${id} not found`);
    }

    const enrichedList = await this.enrichReviewsWithDetails([review]);
    return enrichedList[0];
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

    Object.assign(review, updateDto);
    const updated = await this.reviewRepository.save(review);
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return reviews.map((r) => {
      const perfKey = `${r.employeeId}-${r.quarter}-${r.financialYear}`;
      const perf = perfMap.get(perfKey) || null;

      const deadline = r.deadlineDate ? new Date(r.deadlineDate) : null;
      const isOverdue =
        deadline &&
        r.status !== QuarterlyReviewStatus.REVIEWED &&
        deadline.getTime() < today.getTime();

      return {
        ...r,
        performanceDetails: perf,
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
