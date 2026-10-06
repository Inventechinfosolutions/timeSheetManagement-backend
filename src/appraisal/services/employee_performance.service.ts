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
import { EmployeePerformance } from '../entities/employee_performance.entity';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import {
  CreateEmployeePerformanceDto,
  QueryEmployeePerformanceDto,
  SearchEmployeePerformanceDto,
  UpdateEmployeePerformanceDto,
  SubmitReviewDto,
  RequestEditPermissionDto,
  RespondEditPermissionDto,
} from '../dto/employee_performance.dto';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { QuarterlyReviewStatus } from '../enums/quarterly_review.enums';
import { EditRequestStatus } from '../enums/edit_request.enums';

export interface EnrichedEmployeePerformance extends EmployeePerformance {
  averageCollaborationScore?: number | null;
  employeeName?: string | null;
  department?: string | null;
  designation?: string | null;
  canRequestEdit?: boolean;
  isEditWindowActive?: boolean;
}

@Injectable()
export class EmployeePerformanceService {
  private readonly logger = new Logger(EmployeePerformanceService.name);

  constructor(
    @InjectRepository(EmployeePerformance)
    private readonly performanceRepository: Repository<EmployeePerformance>,
    @InjectRepository(QuarterlyReview)
    private readonly reviewRepository: Repository<QuarterlyReview>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
  ) {}

  /**
   * FR-03: Save Draft (Create or Resume Draft)
   * An employee can save incomplete submission and resume later.
   */
  async saveDraft(dto: CreateEmployeePerformanceDto): Promise<EnrichedEmployeePerformance> {
    try {
      this.logger.log(
        `Saving draft performance for: ${dto.employeeId}, Quarter: ${dto.quarter}, FY: ${dto.financialYear}`,
      );

      let record = await this.performanceRepository.findOne({
        where: {
          employeeId: dto.employeeId,
          quarter: dto.quarter,
          financialYear: dto.financialYear,
        },
      });

      if (record) {
        // Check if edit permission window has expired
        if (
          record.editRequestStatus === EditRequestStatus.APPROVED &&
          record.editAllowedUntil &&
          new Date().getTime() > new Date(record.editAllowedUntil).getTime()
        ) {
          record.status = EmployeePerformanceStatus.SUBMITTED;
          record.editRequestStatus = EditRequestStatus.NONE;
          await this.performanceRepository.save(record);
          throw new BadRequestException(
            `The edit window granted by your manager expired on ${new Date(record.editAllowedUntil).toLocaleString()}. Editing is locked.`,
          );
        }

        if (
          record.status === EmployeePerformanceStatus.SUBMITTED ||
          record.status === EmployeePerformanceStatus.REVIEWED
        ) {
          throw new BadRequestException(
            'This quarterly submission is already submitted and locked. You must request edit permission.',
          );
        }
        Object.assign(record, dto, {
          status: EmployeePerformanceStatus.DRAFT,
          lastModifiedDate: new Date(),
          lastModifiedBy: dto.employeeId,
        });
      } else {
        record = this.performanceRepository.create({
          ...dto,
          status: EmployeePerformanceStatus.DRAFT,
          lastModifiedDate: new Date(),
          lastModifiedBy: dto.employeeId,
        });
      }

      const saved = await this.performanceRepository.save(record);

      // Keep QuarterlyReview status in sync if review exists
      const review = await this.reviewRepository.findOne({
        where: {
          employeeId: dto.employeeId,
          quarter: dto.quarter,
          financialYear: dto.financialYear,
        },
      });
      if (review && review.status === QuarterlyReviewStatus.NOT_STARTED) {
        review.status = QuarterlyReviewStatus.DRAFT;
        review.performanceId = saved.id;
        await this.reviewRepository.save(review);
      }

      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      return enriched[0];
    } catch (error) {
      this.logger.error(`Error saving draft performance: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to save draft: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * FR-04: Submit Review
   * Validates mandatory fields, locks editing, changes status to SUBMITTED.
   */
  async submitReview(dto: SubmitReviewDto): Promise<EnrichedEmployeePerformance> {
    try {
      this.logger.log(
        `Submitting review for: ${dto.employeeId}, Quarter: ${dto.quarter}, FY: ${dto.financialYear}`,
      );

      const record = await this.performanceRepository.findOne({
        where: {
          employeeId: dto.employeeId,
          quarter: dto.quarter,
          financialYear: dto.financialYear,
        },
      });

      if (!record) {
        throw new NotFoundException(
          'No draft found for this quarter. Please fill in the submission before submitting.',
        );
      }

      if (record.status === EmployeePerformanceStatus.SUBMITTED) {
        throw new BadRequestException('This quarterly submission is already submitted.');
      }
      if (record.status === EmployeePerformanceStatus.REVIEWED) {
        throw new BadRequestException('This review has already been evaluated by your manager.');
      }

      // Validate Section requirements
      if (!record.majorProjects?.trim()) {
        throw new BadRequestException('Section A: Major Projects is required before submission.');
      }
      if (!record.responsibilitiesHandled?.trim()) {
        throw new BadRequestException('Section A: Responsibilities Handled is required before submission.');
      }
      if (!record.deliverablesCompleted?.trim()) {
        throw new BadRequestException('Section A: Deliverables Completed is required before submission.');
      }
      if (!record.keyAccomplishments?.trim()) {
        throw new BadRequestException('Section B: Key Accomplishments is required before submission.');
      }
      if (!record.challengesFaced?.trim()) {
        throw new BadRequestException('Section C: Challenges Faced is required before submission.');
      }
      if (!record.skillsAcquired?.trim()) {
        throw new BadRequestException('Section D: Skills Acquired is required before submission.');
      }
      if (!record.plannedDeliverables?.trim()) {
        throw new BadRequestException('Section E: Planned Deliverables for Next Quarter is required.');
      }

      record.status = EmployeePerformanceStatus.SUBMITTED;
      record.submittedAt = new Date();
      record.lastModifiedDate = new Date();
      record.lastModifiedBy = dto.employeeId;

      const saved = await this.performanceRepository.save(record);

      // Sync with QuarterlyReview
      let review = await this.reviewRepository.findOne({
        where: {
          employeeId: dto.employeeId,
          quarter: dto.quarter,
          financialYear: dto.financialYear,
        },
      });

      if (review) {
        review.status = QuarterlyReviewStatus.SUBMITTED;
        review.submittedDate = new Date();
        review.performanceId = saved.id;
        await this.reviewRepository.save(review);
      } else {
        // Auto-create QuarterlyReview master if it wasn't pre-assigned
        const emp = await this.employeeDetailsRepository.findOne({
          where: { employeeId: dto.employeeId },
        });
        const mapping = await this.managerMappingRepository.findOne({
          where: { employeeId: dto.employeeId },
        });

        review = this.reviewRepository.create({
          employeeId: dto.employeeId,
          employeeName: emp?.fullName || dto.employeeId,
          department: emp?.department || '',
          designation: emp?.designation || '',
          financialYear: dto.financialYear,
          quarter: dto.quarter,
          status: QuarterlyReviewStatus.SUBMITTED,
          submittedDate: new Date(),
          performanceId: saved.id,
          assignerId: mapping?.managerId || 'MANAGER',
          managerName: mapping?.managerName || 'Reporting Manager',
        });
        await this.reviewRepository.save(review);
      }

      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      return enriched[0];
    } catch (error) {
      this.logger.error(`Error submitting review: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to submit review: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Request Edit Permission within 1 Day (Option A: Direct on EmployeePerformance)
   * Allows employee to ask manager for edit access after submission.
   */
  async requestEditPermission(dto: RequestEditPermissionDto): Promise<EnrichedEmployeePerformance> {
    try {
      const record = await this.performanceRepository.findOne({
        where: { id: dto.performanceId, employeeId: dto.employeeId },
      });

      if (!record) {
        throw new NotFoundException('Performance submission not found.');
      }

      if (record.status !== EmployeePerformanceStatus.SUBMITTED) {
        throw new BadRequestException('Edit request can only be submitted for a SUBMITTED review.');
      }

      // 1-Day Window verification (24 hours)
      const submittedAt = record.submittedAt || record.createdAt;
      const now = new Date();
      const diffMs = now.getTime() - new Date(submittedAt).getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (diffMs > oneDayMs) {
        throw new BadRequestException(
          'Edit request window has expired. You can only request edit permission within 1 day (24 hours) of submission.',
        );
      }

      if (record.editRequestStatus === EditRequestStatus.PENDING) {
        throw new BadRequestException(
          'An edit request is already pending approval from your manager.',
        );
      }

      record.editRequestStatus = EditRequestStatus.PENDING;
      record.editRequestedAt = new Date();
      record.editRequestReason = dto.reason || 'Edit requested after submission';

      const saved = await this.performanceRepository.save(record);
      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      return enriched[0];
    } catch (error) {
      this.logger.error(`Error requesting edit permission: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to request edit: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Manager responds to Edit Permission request (Approve or Reject)
   */
  async respondEditPermission(dto: RespondEditPermissionDto): Promise<EnrichedEmployeePerformance> {
    try {
      const targetId = dto.performanceId || dto.requestId;
      const record = await this.performanceRepository.findOne({
        where: { id: targetId },
      });

      if (!record) {
        throw new NotFoundException(`Performance submission with ID ${targetId} not found.`);
      }

      if (record.editRequestStatus !== EditRequestStatus.PENDING) {
        throw new BadRequestException('This submission does not have a pending edit request.');
      }

      record.editRequestStatus = dto.approved ? EditRequestStatus.APPROVED : EditRequestStatus.REJECTED;
      record.editRespondedAt = new Date();
      record.editResponseNote = dto.responseNote || null;

      // If approved, unlock the performance submission back to DRAFT and set allowed until deadline
      if (dto.approved) {
        record.status = EmployeePerformanceStatus.DRAFT;
        record.editAllowedUntil = dto.editAllowedUntil
          ? new Date(dto.editAllowedUntil)
          : new Date(Date.now() + 24 * 60 * 60 * 1000); // Defaults to 24 hours if not specified

        const review = await this.reviewRepository.findOne({
          where: {
            employeeId: record.employeeId,
            quarter: record.quarter,
            financialYear: record.financialYear,
          },
        });
        if (review) {
          review.status = QuarterlyReviewStatus.DRAFT;
          await this.reviewRepository.save(review);
        }
      }

      const saved = await this.performanceRepository.save(record);
      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      return enriched[0];
    } catch (error) {
      this.logger.error(`Error responding to edit request: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to process edit request: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all submissions with active edit requests
   */
  async getEditRequests(managerId?: string, employeeId?: string): Promise<EnrichedEmployeePerformance[]> {
    const qb = this.performanceRepository.createQueryBuilder('ep')
      .where('ep.editRequestStatus != :none', { none: EditRequestStatus.NONE });

    if (employeeId?.trim()) {
      qb.andWhere('ep.employeeId = :employeeId', { employeeId: employeeId.trim() });
    }

    if (managerId?.trim()) {
      const mappings = await this.managerMappingRepository.find({
        where: { managerId: managerId.trim() },
      });
      const empIds = mappings.map((m) => m.employeeId).filter(Boolean);
      if (empIds.length > 0) {
        qb.andWhere('ep.employeeId IN (:...empIds)', { empIds });
      } else {
        return [];
      }
    }

    qb.orderBy('ep.editRequestedAt', 'DESC');
    const records = await qb.getMany();
    return await this.enrichPerformancesWithEmployeeDetails(records);
  }

  /**
   * Create standard performance record
   */
  async create(createDto: CreateEmployeePerformanceDto): Promise<EnrichedEmployeePerformance> {
    return this.saveDraft(createDto);
  }

  /**
   * Get all performance records with optional filters
   */
  async findAll(query?: QueryEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    return this.getByParams(query);
  }

  /**
   * Get performance records matching parameters
   */
  async getByParams(params?: QueryEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    try {
      const qb = this.performanceRepository.createQueryBuilder('ep');

      if (params?.employeeId?.trim()) {
        const empId = params.employeeId.trim();
        qb.andWhere('(ep.employeeId = :exactEmpId OR ep.employeeId LIKE :likeEmpId)', {
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
        qb.andWhere('ep.employeeId IN (:...matchedIds)', { matchedIds });
      }

      if (params?.quarter) {
        qb.andWhere('ep.quarter = :quarter', { quarter: params.quarter });
      }

      if (params?.financialYear?.trim()) {
        const fy = params.financialYear.trim();
        qb.andWhere('(ep.financialYear = :exactFy OR ep.financialYear LIKE :likeFy)', {
          exactFy: fy,
          likeFy: `%${fy}%`,
        });
      }

      if (params?.status) {
        qb.andWhere('ep.status = :status', { status: params.status });
      }

      if (params?.q?.trim()) {
        const keyword = `%${params.q.trim()}%`;
        qb.andWhere(
          '(ep.employeeId LIKE :keyword OR ep.majorProjects LIKE :keyword OR ep.keyAccomplishments LIKE :keyword OR ep.financialYear LIKE :keyword OR ep.status LIKE :keyword)',
          { keyword },
        );
      }

      qb.orderBy('ep.id', 'DESC');

      const total = await qb.getCount();

      if (params?.page && params?.limit) {
        const skip = (params.page - 1) * params.limit;
        qb.skip(skip).take(params.limit);
      }

      const records = await qb.getMany();
      const enriched = await this.enrichPerformancesWithEmployeeDetails(records);

      return {
        data: enriched,
        total,
        page: params?.page,
        limit: params?.limit,
      };
    } catch (error) {
      this.logger.error(`Error in getByParams performance: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch performance records: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search performance records
   */
  async getBySearch(searchDto: SearchEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    return this.getByParams(searchDto);
  }

  /**
   * Find a single performance record by ID
   */
  async findOne(id: number): Promise<EnrichedEmployeePerformance> {
    const record = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }

    const enriched = await this.enrichPerformancesWithEmployeeDetails([record]);
    return enriched[0];
  }

  /**
   * Update an employee performance record (Guarded by Submission Lock)
   */
  async update(
    id: number,
    updateDto: UpdateEmployeePerformanceDto,
  ): Promise<EnrichedEmployeePerformance> {
    const record = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }

    // Expiry check if edit was previously approved
    if (
      record.editRequestStatus === EditRequestStatus.APPROVED &&
      record.editAllowedUntil &&
      new Date().getTime() > new Date(record.editAllowedUntil).getTime()
    ) {
      record.status = EmployeePerformanceStatus.SUBMITTED;
      record.editRequestStatus = EditRequestStatus.NONE;
      await this.performanceRepository.save(record);
      throw new BadRequestException(
        `The edit window granted by your manager expired on ${new Date(record.editAllowedUntil).toLocaleString()}. Editing is locked.`,
      );
    }

    // Lock check
    if (
      record.status === EmployeePerformanceStatus.SUBMITTED ||
      record.status === EmployeePerformanceStatus.REVIEWED
    ) {
      throw new BadRequestException(
        'Submission is locked. You cannot edit a submitted or reviewed evaluation without manager approval.',
      );
    }

    Object.assign(record, updateDto, {
      lastModifiedDate: new Date(),
    });

    const updated = await this.performanceRepository.save(record);
    const enrichedList = await this.enrichPerformancesWithEmployeeDetails([updated]);
    return enrichedList[0];
  }

  /**
   * Delete a performance record
   */
  async remove(id: number): Promise<{ success: boolean; message: string }> {
    const record = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }

    await this.performanceRepository.remove(record);
    return {
      success: true,
      message: `Employee performance record with ID ${id} deleted successfully`,
    };
  }

  /**
   * Helper: Batch enrich with employee details and calculate 1-day edit eligibility
   */
  private async enrichPerformancesWithEmployeeDetails(
    records: EmployeePerformance[],
  ): Promise<EnrichedEmployeePerformance[]> {
    if (!records.length) return [];

    const employeeIds = Array.from(
      new Set(records.map((r) => r.employeeId).filter(Boolean)),
    );

    const employeeMap = new Map<string, { fullName: string; department: string; designation: string }>();

    if (employeeIds.length > 0) {
      try {
        const employees = await this.employeeDetailsRepository.find({
          where: { employeeId: In(employeeIds) },
          select: ['employeeId', 'fullName', 'department', 'designation'],
        });
        employees.forEach((emp) => {
          employeeMap.set(emp.employeeId, {
            fullName: emp.fullName,
            department: emp.department,
            designation: emp.designation,
          });
        });
      } catch (err) {
        this.logger.warn(`Could not fetch employee details for enrichment: ${err.message}`);
      }
    }

    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    return records.map((r) => {
      const empInfo = employeeMap.get(r.employeeId);

      // Check if employee is eligible to request edit within 1 day
      let canRequestEdit = false;
      if (r.status === EmployeePerformanceStatus.SUBMITTED && r.submittedAt) {
        const diffMs = now.getTime() - new Date(r.submittedAt).getTime();
        canRequestEdit = diffMs <= oneDayMs;
      }

      // Check if granted edit window is currently active
      const isEditWindowActive = !!(
        r.editRequestStatus === EditRequestStatus.APPROVED &&
        r.editAllowedUntil &&
        now.getTime() <= new Date(r.editAllowedUntil).getTime()
      );

      return {
        ...r,
        employeeName: empInfo?.fullName || null,
        department: empInfo?.department || null,
        designation: empInfo?.designation || null,
        canRequestEdit,
        isEditWindowActive,
      };
    });
  }
}

// Backward compatibility alias
export const MasterEmployeePerformanceService = EmployeePerformanceService;
export type MasterEmployeePerformanceService = EmployeePerformanceService;
