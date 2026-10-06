import {
    Injectable,
    NotFoundException,
    Logger,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { QuaterlyReview } from '../entities/quarterly_review.entities';
import {
    CreateQuarterlyReviewDto,
    QueryQuarterlyReviewDto,
    SearchQuarterlyReviewDto,
    UpdateQuarterlyReviewDto,
} from '../dto/quarterly_review.dto';
import { QuarterlyReviewStatus } from '../enums/quarterly_review.enums';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';

export interface EnrichedQuarterlyReview extends QuaterlyReview {
    overallAverageScore?: number | null;
    isOverdue?: boolean;
    employeeName?: string | null;
    department?: string | null;
}

export type EnrichedQuaterlyReview = EnrichedQuarterlyReview;

@Injectable()
export class QuaterlyReviewService {
    private readonly logger = new Logger(QuaterlyReviewService.name);

    constructor(
        @InjectRepository(QuaterlyReview)
        private readonly reviewRepository: Repository<QuaterlyReview>,
        @InjectRepository(EmployeeDetails)
        private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    ) { }

    /**
     * Create a new quarterly review record.
     */
    async create(createDto: CreateQuarterlyReviewDto): Promise<EnrichedQuarterlyReview> {
        try {
            this.logger.log(
                `Creating review for employee: ${createDto.employeeId}, Assigner: ${createDto.assignerId}, Quarter: ${createDto.quarter}, FY: ${createDto.financialYear}`,
            );

            const computedPerformanceIndex =
                createDto.performanceIndex ?? this.calculatePerformanceIndex(createDto);

            const review = this.reviewRepository.create({
                ...createDto,
                assignedDate: new Date(createDto.assignedDate),
                deadlineDate: new Date(createDto.deadlineDate),
                performanceIndex: computedPerformanceIndex,
                status: createDto.status || QuarterlyReviewStatus.PENDING,
            });

            const saved = await this.reviewRepository.save(review);
            const enrichedList = await this.enrichReviewsWithEmployeeDetails([saved]);
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
     * Get all reviews (getAll).
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
     * Get reviews matching specific parameters (getByParams).
     * Supports search by employeeId, name, department, financialYear, quarter, status, and general keyword q.
     */
    async getByParams(params?: QueryQuarterlyReviewDto): Promise<{
        data: EnrichedQuarterlyReview[];
        total: number;
        page?: number;
        limit?: number;
    }> {
        try {
            const qb = this.reviewRepository.createQueryBuilder('review');

            // 1. Direct Employee ID filter on review table
            if (params?.employeeId?.trim()) {
                const empId = params.employeeId.trim();
                qb.andWhere('(review.employeeId = :exactEmpId OR review.employeeId LIKE :likeEmpId)', {
                    exactEmpId: empId,
                    likeEmpId: `%${empId}%`,
                });
            }

            // 2. Employee Name or Department filter via EmployeeDetails without cross-table collation join
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
                    return {
                        data: [],
                        total: 0,
                        page: params?.page,
                        limit: params?.limit,
                    };
                }
                qb.andWhere('review.employeeId IN (:...matchedIds)', { matchedIds });
            }

            // 3. Financial Year
            if (params?.financialYear?.trim()) {
                const fy = params.financialYear.trim();
                qb.andWhere('(review.financialYear = :exactFy OR review.financialYear LIKE :likeFy)', {
                    exactFy: fy,
                    likeFy: `%${fy}%`,
                });
            }

            // 4. Quarter
            if (params?.quarter) {
                qb.andWhere('review.quarter = :quarter', {
                    quarter: params.quarter,
                });
            }

            // 5. Status
            if (params?.status) {
                qb.andWhere('review.status = :status', {
                    status: params.status,
                });
            }

            // 6. Assigner ID
            if (params?.assignerId?.trim()) {
                qb.andWhere('review.assignerId = :assignerId', {
                    assignerId: params.assignerId.trim(),
                });
            }

            // 7. Employee Type
            if (params?.employeeType) {
                qb.andWhere('review.employeeType = :employeeType', {
                    employeeType: params.employeeType,
                });
            }

            // 8. Assigned By
            if (params?.assignedBy) {
                qb.andWhere('review.assignedBy = :assignedBy', {
                    assignedBy: params.assignedBy,
                });
            }

            // 9. General keyword search across review and employee records
            if (params?.q?.trim()) {
                const keyword = `%${params.q.trim()}%`;
                const empMatches = await this.employeeDetailsRepository
                    .createQueryBuilder('emp')
                    .where('emp.fullName LIKE :keyword OR emp.department LIKE :keyword OR emp.employeeId LIKE :keyword', {
                        keyword,
                    })
                    .select('emp.employeeId', 'employeeId')
                    .getRawMany();
                const matchedEmpIds = empMatches.map((e) => e.employeeId).filter(Boolean);

                if (matchedEmpIds.length > 0) {
                    qb.andWhere(
                        '(review.employeeId IN (:...matchedEmpIds) OR review.employeeId LIKE :keyword OR review.financialYear LIKE :keyword OR review.quarter LIKE :keyword OR review.status LIKE :keyword OR review.assignerId LIKE :keyword OR review.description LIKE :keyword)',
                        { matchedEmpIds, keyword },
                    );
                } else {
                    qb.andWhere(
                        '(review.employeeId LIKE :keyword OR review.financialYear LIKE :keyword OR review.quarter LIKE :keyword OR review.status LIKE :keyword OR review.assignerId LIKE :keyword OR review.description LIKE :keyword)',
                        { keyword },
                    );
                }
            }

            qb.orderBy('review.id', 'DESC');

            const total = await qb.getCount();

            if (params?.page && params?.limit) {
                const skip = (params.page - 1) * params.limit;
                qb.skip(skip).take(params.limit);
            }

            const reviews = await qb.getMany();
            const enriched = await this.enrichReviewsWithEmployeeDetails(reviews);

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
     * Search reviews by keyword or filters (getBySearch).
     * Supports search by employeeId, name, department, financialYear, quarter, status, and q.
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
     * Find a single quarterly review by ID (getById).
     */
    async findOne(id: number): Promise<EnrichedQuarterlyReview> {
        const review = await this.reviewRepository.findOne({
            where: { id },
        });

        if (!review) {
            throw new NotFoundException(`Quarterly review with ID ${id} not found`);
        }

        let employeeName: string | null = null;
        let department: string | null = null;

        if (review.employeeId) {
            try {
                const emp = await this.employeeDetailsRepository.findOne({
                    where: { employeeId: review.employeeId },
                    select: ['employeeId', 'fullName', 'department'],
                });
                if (emp) {
                    employeeName = emp.fullName;
                    department = emp.department;
                }
            } catch (err) {
                this.logger.warn(`Could not fetch employee details for ID ${review.employeeId}: ${err.message}`);
            }
        }

        return this.enrichReview(review, employeeName, department);
    }

    /**
     * Update a quarterly review.
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

        if (updateDto.assignedDate) {
            review.assignedDate = new Date(updateDto.assignedDate);
        }
        if (updateDto.deadlineDate) {
            review.deadlineDate = new Date(updateDto.deadlineDate);
        }

        // Auto-recalculate performanceIndex if scores changed and performanceIndex not explicitly provided
        if (updateDto.performanceIndex !== undefined) {
            review.performanceIndex = updateDto.performanceIndex;
        } else {
            const mergedScores = {
                productivity: updateDto.productivity ?? review.productivity,
                ownershipResponsibility: updateDto.ownershipResponsibility ?? review.ownershipResponsibility,
                teamCollaboration: updateDto.teamCollaboration ?? review.teamCollaboration,
                qualityOfWork: updateDto.qualityOfWork ?? review.qualityOfWork,
                communication: updateDto.communication ?? review.communication,
                innovationProblemSolving: updateDto.innovationProblemSolving ?? review.innovationProblemSolving,
            };
            const recomputedIndex = this.calculatePerformanceIndex(mergedScores);
            if (recomputedIndex !== undefined) {
                review.performanceIndex = recomputedIndex;
            }
        }

        Object.assign(review, updateDto);

        const updated = await this.reviewRepository.save(review);
        const enrichedList = await this.enrichReviewsWithEmployeeDetails([updated]);
        return enrichedList[0];
    }

    /**
     * Delete a quarterly review by ID.
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
     * Batch enrich reviews with employee details (name, department) safely without collation mismatch.
     */
    private async enrichReviewsWithEmployeeDetails(
        reviews: QuaterlyReview[],
    ): Promise<EnrichedQuarterlyReview[]> {
        if (!reviews.length) return [];

        const employeeIds = Array.from(
            new Set(reviews.map((r) => r.employeeId).filter(Boolean)),
        );

        const employeeMap = new Map<string, { fullName: string; department: string }>();

        if (employeeIds.length > 0) {
            try {
                const employees = await this.employeeDetailsRepository.find({
                    where: { employeeId: In(employeeIds) },
                    select: ['employeeId', 'fullName', 'department'],
                });
                employees.forEach((emp) => {
                    employeeMap.set(emp.employeeId, {
                        fullName: emp.fullName,
                        department: emp.department,
                    });
                });
            } catch (err) {
                this.logger.warn(`Could not fetch employee details for enrichment: ${err.message}`);
            }
        }

        return reviews.map((r) => {
            const empInfo = employeeMap.get(r.employeeId);
            return this.enrichReview(
                r,
                empInfo?.fullName || null,
                empInfo?.department || null,
            );
        });
    }

    /**
     * Dynamically calculate average scores, overdue status, and optional employee info.
     */
    private enrichReview(
        review: QuaterlyReview,
        employeeName?: string | null,
        department?: string | null,
    ): EnrichedQuarterlyReview {
        const scores = [
            review.productivity,
            review.ownershipResponsibility,
            review.teamCollaboration,
            review.qualityOfWork,
            review.communication,
            review.innovationProblemSolving,
        ].filter((score): score is number => typeof score === 'number' && !isNaN(score));

        let overallAverageScore: number | null = null;
        if (scores.length > 0) {
            const sum = scores.reduce((acc, curr) => acc + curr, 0);
            overallAverageScore = Number((sum / scores.length).toFixed(2));
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadline = new Date(review.deadlineDate);
        deadline.setHours(0, 0, 0, 0);

        const isOverdue =
            review.status !== QuarterlyReviewStatus.COMPLETED &&
            deadline.getTime() < today.getTime();

        return {
            ...review,
            employeeName: employeeName ?? (review as any).employeeName ?? null,
            department: department ?? (review as any).department ?? null,
            overallAverageScore,
            isOverdue,
        };
    }

    /**
     * Dynamically calculates performance index (0-100) based on evaluation metrics.
     */
    private calculatePerformanceIndex(scoresObj: {
        productivity?: number;
        ownershipResponsibility?: number;
        teamCollaboration?: number;
        qualityOfWork?: number;
        communication?: number;
        innovationProblemSolving?: number;
    }): number | undefined {
        const scores = [
            scoresObj.productivity,
            scoresObj.ownershipResponsibility,
            scoresObj.teamCollaboration,
            scoresObj.qualityOfWork,
            scoresObj.communication,
            scoresObj.innovationProblemSolving,
        ].filter((score): score is number => typeof score === 'number' && !isNaN(score));

        if (scores.length === 0) return undefined;

        // Scale to percentage (10 points max per category)
        const sum = scores.reduce((acc, curr) => acc + curr, 0);
        const maxPossible = scores.length * 10;
        return Math.round((sum / maxPossible) * 100);
    }
}

// Aliases
export const MasterQuaterlyReviewService = QuaterlyReviewService;
export type MasterQuaterlyReviewService = QuaterlyReviewService;
export const QuarterlyReviewService = QuaterlyReviewService;
