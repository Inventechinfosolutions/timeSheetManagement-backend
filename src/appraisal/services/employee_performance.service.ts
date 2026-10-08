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
import { AppraisalNoticeService } from './appraisal_notice.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { BufferedFile } from '../../common/s3-client/file.model';
import { PerformanceAttachment } from '../entities/employee_performance.entity';
import {
  APPRAISAL_EDIT_WINDOW_HOURS,
  EDIT_REQUEST_DEFAULT_REASON,
  DRAFT_ON_SAVE_STATUSES,
  LOCKED_PERFORMANCE_STATUSES,
  SUBMITTABLE_PERFORMANCE_STATUSES,
  appraisalWindowMs,
} from '../constants/appraisal.constants';

export interface PerformanceListMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

export interface EnrichedEmployeePerformance extends EmployeePerformance {
  averageCollaborationScore?: number | null;
  employeeName?: string | null;
  department?: string | null;
  designation?: string | null;
  canRequestEdit?: boolean;
  isEditWindowActive?: boolean;
  assignedBy?: string | null;
  assignedDate?: Date | string | null;
  deadlineDate?: Date | string | null;
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
    private readonly noticeService: AppraisalNoticeService,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  /**
   * FR-03: Save Draft (Create or Resume Draft)
   * An employee can save incomplete submission and resume later.
   */
  async saveDraft(dto: CreateEmployeePerformanceDto): Promise<EnrichedEmployeePerformance> {
    return this.writePerformance(dto, true);
  }

  private async writePerformance(
    dto: CreateEmployeePerformanceDto,
    asDraft: boolean,
  ): Promise<EnrichedEmployeePerformance> {
    try {
      this.logger.log(
        `Saving performance for: ${dto.employeeId}, Quarter: ${dto.quarter}, FY: ${dto.financialYear}, draft: ${asDraft}`,
      );

      let record = await this.performanceRepository.findOne({
        where: {
          employeeId: dto.employeeId,
          quarter: dto.quarter,
          financialYear: dto.financialYear,
        },
      });

      let nextStatus = asDraft
        ? EmployeePerformanceStatus.DRAFT
        : EmployeePerformanceStatus.NOT_STARTED;
      if (record) {
        record = await this.lockIfGrantExpired(record);

        if (LOCKED_PERFORMANCE_STATUSES.includes(record.status)) {
          throw new BadRequestException(
            'This quarterly submission is locked. You must request edit permission.',
          );
        }
        const keepStatus =
          record.status === EmployeePerformanceStatus.EDIT_GRANTED ||
          record.status === EmployeePerformanceStatus.APPROVED_FOR_EDITING ||
          record.status === EmployeePerformanceStatus.ALLOWED_TO_EDIT;
        nextStatus = keepStatus
          ? record.status
          : asDraft || DRAFT_ON_SAVE_STATUSES.includes(record.status)
            ? EmployeePerformanceStatus.DRAFT
            : record.status;
        const draftFields = { ...dto };
        if (draftFields.attachments == null) {
          delete draftFields.attachments;
        }
        if (draftFields.projects == null) {
          delete draftFields.projects;
        }
        Object.assign(record, draftFields, {
          status: nextStatus,
          lastModifiedDate: new Date(),
          lastModifiedBy: dto.employeeId,
        });
      } else {
        record = this.performanceRepository.create({
          ...dto,
          status: nextStatus,
          lastModifiedDate: new Date(),
          lastModifiedBy: dto.employeeId,
        });
      }

      const saved = await this.performanceRepository.save(record);
      await this.linkPerformanceToReview(saved.employeeId, saved.quarter, saved.financialYear, saved.id);

      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      return enriched[0];
    } catch (error) {
      const caught = this.caughtError(error);
      this.logger.error(`Error saving draft performance: ${caught.message}`, caught.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to save draft: ${caught.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * FR-04: Submit Review
   * Validates mandatory fields, locks editing, changes status to SUBMITTED.
   */
  async submitReview(id: number, dto: SubmitReviewDto): Promise<EnrichedEmployeePerformance> {
    try {
      this.logger.log(
        `Submitting review ${id} for: ${dto.employeeId}, Quarter: ${dto.quarter}, FY: ${dto.financialYear}`,
      );

      let record = await this.performanceRepository.findOne({ where: { id } });

      if (!record) {
        throw new NotFoundException(
          'No draft found for this quarter. Please fill in the submission before submitting.',
        );
      }
      if (
        record.employeeId !== dto.employeeId ||
        record.quarter !== dto.quarter ||
        record.financialYear !== dto.financialYear
      ) {
        throw new BadRequestException('This submission does not match the selected quarter.');
      }

      record = await this.lockIfGrantExpired(record);

      if (
        record.status === EmployeePerformanceStatus.SUBMITTED ||
        record.status === EmployeePerformanceStatus.RE_SUBMITTED
      ) {
        throw new BadRequestException('This quarterly submission is already submitted.');
      }
      if (
        record.status === EmployeePerformanceStatus.REVIEWED ||
        record.status === EmployeePerformanceStatus.COMPLETED
      ) {
        throw new BadRequestException('This review has already been evaluated by your manager.');
      }
      if (!SUBMITTABLE_PERFORMANCE_STATUSES.includes(record.status)) {
        throw new BadRequestException(
          'This quarterly submission is locked. You must request edit permission.',
        );
      }
      const resubmitting = record.status === EmployeePerformanceStatus.APPROVED_FOR_EDITING;

      // Validate Section requirements
      const savedProjects = (record.projects || []).filter(
        (project) => project.title?.trim() && project.description?.trim() && project.challenge?.trim(),
      );
      if (savedProjects.length === 0) {
        throw new BadRequestException('Add at least one project before submission.');
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

      const submittedAt = resubmitting ? record.submittedAt || new Date() : new Date();
      record.status = resubmitting
        ? EmployeePerformanceStatus.RE_SUBMITTED
        : EmployeePerformanceStatus.SUBMITTED;
      record.submittedAt = submittedAt;
      record.lastModifiedDate = new Date();
      record.lastModifiedBy = dto.employeeId;
      record.editAllowedUntil = null;

      const saved = await this.performanceRepository.save(record);

      // Sync with QuarterlyReview
      let review = await this.reviewRepository.findOne({
        where: {
          employeeId: dto.employeeId,
          quarter: dto.quarter,
          financialYear: dto.financialYear,
        },
      });

      const reviewStatus = resubmitting
        ? QuarterlyReviewStatus.RE_SUBMITTED
        : QuarterlyReviewStatus.PERFORMANCE_RECEIVED;
      if (review) {
        if (!resubmitting || !review.submittedDate) {
          review.submittedDate = submittedAt;
        }
        review.performanceId = saved.id;
        review.status = reviewStatus;
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
          status: QuarterlyReviewStatus.PERFORMANCE_RECEIVED,
          submittedDate: submittedAt,
          performanceId: saved.id,
          assignerId: mapping?.managerId || 'MANAGER',
          managerName: mapping?.managerName || 'Reporting Manager',
        });
        await this.reviewRepository.save(review);
      }

      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: dto.employeeId },
      });
      const notice = {
        employeeId: dto.employeeId,
        employeeName: employee?.fullName || dto.employeeId,
        quarter: dto.quarter,
        financialYear: dto.financialYear,
      };
      await this.noticeService.notifyEmployeeOfSubmission(notice);
      await this.noticeService.notifyManagerOfSubmission(notice);

      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      return enriched[0];
    } catch (error) {
      const caught = this.caughtError(error);
      this.logger.error(`Error submitting review: ${caught.message}`, caught.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to submit review: ${caught.message}`,
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

      const review = await this.reviewRepository.findOne({
        where: {
          employeeId: record.employeeId,
          quarter: record.quarter,
          financialYear: record.financialYear,
        },
      });
      if (
        review?.status === QuarterlyReviewStatus.COMPLETED ||
        review?.status === QuarterlyReviewStatus.REVIEWED
      ) {
        throw new BadRequestException('This review is completed. You can only view it.');
      }
      if (record.status === EmployeePerformanceStatus.RE_SUBMITTED) {
        throw new BadRequestException('This submission cannot be edited again.');
      }
      if (
        record.status === EmployeePerformanceStatus.COMPLETED ||
        record.status === EmployeePerformanceStatus.REVIEWED
      ) {
        throw new BadRequestException('This review is completed. You can only view it.');
      }
      if (record.status === EmployeePerformanceStatus.REQUESTED_FOR_EDIT) {
        throw new BadRequestException(
          'An edit request is already pending approval from your manager.',
        );
      }

      const missedDeadline = record.status === EmployeePerformanceStatus.NOT_UPDATED;
      if (missedDeadline) {
        record.status = EmployeePerformanceStatus.REQUESTED_FOR_EDIT;
        record.editRequestedAt = new Date();
        record.editRequestReason = dto.reason || EDIT_REQUEST_DEFAULT_REASON;
      } else if (record.status === EmployeePerformanceStatus.SUBMITTED) {
        const submittedAt = record.submittedAt || record.createdAt;
        const diffMs = Date.now() - new Date(submittedAt).getTime();
        if (diffMs > appraisalWindowMs(APPRAISAL_EDIT_WINDOW_HOURS)) {
          throw new BadRequestException(
            'Edit request window has expired. You can request an edit within 2 days of submission.',
          );
        }
        record.status = EmployeePerformanceStatus.REQUESTED_FOR_EDIT;
        record.editRequestedAt = new Date();
        record.editRequestReason = dto.reason || EDIT_REQUEST_DEFAULT_REASON;
      } else {
        throw new BadRequestException('Edit request can only be submitted for a submitted review.');
      }

      const saved = await this.performanceRepository.save(record);
      if (saved.status === EmployeePerformanceStatus.REQUESTED_FOR_EDIT && !missedDeadline) {
        await this.setReviewStatus(
          saved.employeeId,
          saved.quarter,
          saved.financialYear,
          QuarterlyReviewStatus.REQUESTED_FOR_EDIT,
          saved.id,
        );
      } else {
        await this.linkPerformanceToReview(saved.employeeId, saved.quarter, saved.financialYear, saved.id);
      }
      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      await this.noticeService.notifyManagerOfEditRequest({
        employeeId: saved.employeeId,
        employeeName: enriched[0].employeeName || saved.employeeId,
        quarter: saved.quarter,
        financialYear: saved.financialYear,
      });
      return enriched[0];
    } catch (error) {
      const caught = this.caughtError(error);
      this.logger.error(`Error requesting edit permission: ${caught.message}`, caught.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to request edit: ${caught.message}`,
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

      if (record.status !== EmployeePerformanceStatus.REQUESTED_FOR_EDIT) {
        throw new BadRequestException('This submission does not have a pending edit request.');
      }

      const review = await this.reviewRepository.findOne({
        where: {
          employeeId: record.employeeId,
          quarter: record.quarter,
          financialYear: record.financialYear,
        },
      });
      record.editRespondedAt = new Date();
      record.editResponseNote = dto.responseNote || null;

      const missedDeadline =
        review?.status === QuarterlyReviewStatus.ASSIGNED ||
        review?.status === QuarterlyReviewStatus.NOT_STARTED;
      if (dto.approved) {
        record.status = missedDeadline
          ? EmployeePerformanceStatus.ALLOWED_TO_EDIT
          : EmployeePerformanceStatus.APPROVED_FOR_EDITING;
        record.editAllowedUntil = null;
      } else {
        record.status = missedDeadline
          ? EmployeePerformanceStatus.NOT_UPDATED
          : EmployeePerformanceStatus.SUBMITTED;
        record.editAllowedUntil = null;
      }

      const saved = await this.performanceRepository.save(record);
      if (saved.status === EmployeePerformanceStatus.APPROVED_FOR_EDITING) {
        await this.setReviewStatus(
          saved.employeeId,
          saved.quarter,
          saved.financialYear,
          QuarterlyReviewStatus.APPROVED_FOR_EDITING,
          saved.id,
        );
      } else if (!dto.approved && !missedDeadline) {
        await this.setReviewStatus(
          saved.employeeId,
          saved.quarter,
          saved.financialYear,
          QuarterlyReviewStatus.PERFORMANCE_RECEIVED,
          saved.id,
        );
      } else {
        await this.linkPerformanceToReview(saved.employeeId, saved.quarter, saved.financialYear, saved.id);
      }
      const enriched = await this.enrichPerformancesWithEmployeeDetails([saved]);
      if (dto.approved) {
        await this.noticeService.notifyEmployeeOfEditGrant({
          employeeId: saved.employeeId,
          employeeName: enriched[0].employeeName || saved.employeeId,
          quarter: saved.quarter,
          financialYear: saved.financialYear,
          editAllowedUntil: saved.editAllowedUntil,
        });
      }
      return enriched[0];
    } catch (error) {
      const caught = this.caughtError(error);
      this.logger.error(`Error responding to edit request: ${caught.message}`, caught.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to process edit request: ${caught.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all submissions with active edit requests
   */
  async getEditRequests(
    managerId?: string,
    employeeId?: string,
    q?: string,
  ): Promise<EnrichedEmployeePerformance[]> {
    const qb = this.performanceRepository.createQueryBuilder('ep')
      .where('ep.status IN (:...editStatuses)', {
        editStatuses: [
          EmployeePerformanceStatus.REQUESTED_FOR_EDIT,
          EmployeePerformanceStatus.APPROVED_FOR_EDITING,
          EmployeePerformanceStatus.ALLOWED_TO_EDIT,
        ],
      });

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

    if (q?.trim()) {
      const keyword = `%${q.trim()}%`;
      const matchedEmployees = await this.employeeDetailsRepository
        .createQueryBuilder('emp')
        .where('emp.fullName LIKE :keyword OR emp.employeeId LIKE :keyword', { keyword })
        .select('emp.employeeId', 'employeeId')
        .getRawMany();
      const matchedIds = matchedEmployees.map((row) => row.employeeId).filter(Boolean);

      if (matchedIds.length > 0) {
        qb.andWhere(
          '(ep.employeeId LIKE :keyword OR ep.employeeId IN (:...matchedIds) OR ep.editRequestReason LIKE :keyword OR ep.financialYear LIKE :keyword)',
          { keyword, matchedIds },
        );
      } else {
        qb.andWhere(
          '(ep.employeeId LIKE :keyword OR ep.editRequestReason LIKE :keyword OR ep.financialYear LIKE :keyword)',
          { keyword },
        );
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
    return this.writePerformance(createDto, false);
  }

  /**
   * Get all performance records with optional filters
   */
  async findAll(query?: QueryEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    meta: PerformanceListMeta;
  }> {
    return this.getByParams(query);
  }

  /**
   * Get performance records matching parameters
   */
  async getByParams(params?: QueryEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    meta: PerformanceListMeta;
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
          return { data: [], meta: this.listMeta(0, 0, params?.page, params?.limit) };
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
          '(ep.employeeId LIKE :keyword OR ep.projects LIKE :keyword OR ep.keyAccomplishments LIKE :keyword OR ep.financialYear LIKE :keyword OR ep.status LIKE :keyword)',
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
      const enriched = await this.attachReviewAssignment(
        await this.enrichPerformancesWithEmployeeDetails(records),
      );

      return {
        data: enriched,
        meta: this.listMeta(total, enriched.length, params?.page, params?.limit),
      };
    } catch (error) {
      const caught = this.caughtError(error);
      this.logger.error(`Error in getByParams performance: ${caught.message}`, caught.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch performance records: ${caught.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search performance records
   */
  async getBySearch(searchDto: SearchEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    meta: PerformanceListMeta;
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

    const [withReview] = await this.attachReviewAssignment([record]);
    return withReview;
  }

  /**
   * Update an employee performance record (Guarded by Submission Lock)
   */
  async update(
    id: number,
    updateDto: UpdateEmployeePerformanceDto,
  ): Promise<EnrichedEmployeePerformance> {
    let record = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }

    record = await this.lockIfGrantExpired(record);

    if (LOCKED_PERFORMANCE_STATUSES.includes(record.status)) {
      throw new BadRequestException(
        'Submission is locked. You cannot edit a submitted or reviewed evaluation without manager approval.',
      );
    }

    const fields = { ...updateDto };
    delete fields.status;
    if (fields.attachments == null) {
      delete fields.attachments;
    }
    if (fields.projects == null) {
      delete fields.projects;
    }
    const nextStatus = DRAFT_ON_SAVE_STATUSES.includes(record.status)
      ? EmployeePerformanceStatus.DRAFT
      : record.status;
    Object.assign(record, fields, {
      status: nextStatus,
      lastModifiedDate: new Date(),
    });

    const updated = await this.performanceRepository.save(record);
    const enrichedList = await this.enrichPerformancesWithEmployeeDetails([updated]);
    return enrichedList[0];
  }

  /**
   * Upload one file to MinIO and store its object key on the performance row.
   */
  async addAttachment(id: number, file: BufferedFile | undefined): Promise<PerformanceAttachment> {
    let record = await this.performanceRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }
    record = await this.lockIfGrantExpired(record);
    if (LOCKED_PERFORMANCE_STATUSES.includes(record.status)) {
      throw new BadRequestException(
        'Submission is locked. You cannot edit a submitted or reviewed evaluation without manager approval.',
      );
    }
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Choose a file to upload.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Each file must be 10 MB or smaller.');
    }

    const details = new DocumentMetaInfo();
    details.refId = id;
    details.refType = ReferenceType.PROJECT_DOCUMENT;
    details.entityId = id;
    details.entityType = EntityType.PROJECT;

    const uploaded = await this.documentUploaderService.uploadImage(file, details);
    const attachment: PerformanceAttachment = {
      fileName: file.originalname || uploaded.fileName,
      fileUrl: uploaded.image_url,
      fileSize: file.size,
      fileType: file.mimetype,
      objectKey: uploaded.key,
    };
    return attachment;
  }

  /**
   * Remove one stored file from MinIO and from the performance attachments list.
   */
  async removeAttachment(id: number, objectKey: string): Promise<PerformanceAttachment[]> {
    let record = await this.performanceRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }
    record = await this.lockIfGrantExpired(record);
    if (LOCKED_PERFORMANCE_STATUSES.includes(record.status)) {
      throw new BadRequestException(
        'Submission is locked. You cannot edit a submitted or reviewed evaluation without manager approval.',
      );
    }
    if (!objectKey) {
      throw new BadRequestException('Choose an attachment to remove.');
    }
    const current = record.attachments || [];
    const next = current.filter((item) => item.objectKey !== objectKey);
    const projects = (record.projects || []).map((project) => ({
      ...project,
      attachments: (project.attachments || []).filter((item) => item.objectKey !== objectKey),
    }));
    const removedFromColumn = next.length !== current.length;
    const removedFromProject = JSON.stringify(projects) !== JSON.stringify(record.projects || []);
    if (!removedFromColumn && !removedFromProject) {
      await this.documentUploaderService.deleteMinioDoc(objectKey);
      return current;
    }
    await this.documentUploaderService.deleteMinioDoc(objectKey);
    record.attachments = next;
    record.projects = projects;
    record.lastModifiedDate = new Date();
    const saved = await this.performanceRepository.save(record);
    return saved.attachments || [];
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

  private listMeta(
    totalItems: number,
    itemCount: number,
    page?: number,
    limit?: number,
  ): PerformanceListMeta {
    const currentPage = page && page > 0 ? page : 1;
    const itemsPerPage = limit && limit > 0 ? limit : Math.max(itemCount, 1);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / itemsPerPage);
    return {
      totalItems,
      itemCount,
      itemsPerPage,
      totalPages,
      currentPage,
    };
  }

  private caughtError(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }
    return { message: 'Unknown error' };
  }

  private async setReviewStatus(
    employeeId: string,
    quarter: EmployeePerformance['quarter'],
    financialYear: string,
    status: QuarterlyReviewStatus,
    performanceId: number,
  ): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { employeeId, quarter, financialYear },
    });
    if (!review) {
      return;
    }
    review.status = status;
    review.performanceId = performanceId;
    await this.reviewRepository.save(review);
  }

  private async linkPerformanceToReview(
    employeeId: string,
    quarter: EmployeePerformance['quarter'],
    financialYear: string,
    performanceId: number,
  ): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { employeeId, quarter, financialYear },
    });
    if (!review || review.performanceId === performanceId) {
      return;
    }
    review.performanceId = performanceId;
    await this.reviewRepository.save(review);
  }

  private async lockIfGrantExpired(record: EmployeePerformance): Promise<EmployeePerformance> {
    const allowedUntil = record.editAllowedUntil;
    const grantOpen = record.status === EmployeePerformanceStatus.EDIT_GRANTED;
    const expired =
      !!allowedUntil && Date.now() > new Date(allowedUntil).getTime();

    if (!grantOpen || !expired || !allowedUntil) {
      return record;
    }

    const deadline = new Date(allowedUntil).toLocaleString();
    record.status = EmployeePerformanceStatus.SUBMITTED;
    record.editAllowedUntil = null;
    await this.performanceRepository.save(record);
    throw new BadRequestException(
      `The edit window granted by your manager expired on ${deadline}. Editing is locked.`,
    );
  }

  private async attachReviewAssignment(
    records: EnrichedEmployeePerformance[],
  ): Promise<EnrichedEmployeePerformance[]> {
    if (!records.length) {
      return records;
    }

    const reviews = await this.reviewRepository.find({
      where: records.map((record) => ({
        employeeId: record.employeeId,
        quarter: record.quarter,
        financialYear: record.financialYear,
      })),
      select: ['employeeId', 'quarter', 'financialYear', 'assignerId', 'assignedDate', 'deadlineDate'],
    });
    const assignerIds = Array.from(new Set(reviews.map((review) => review.assignerId).filter(Boolean)));
    const assigners = assignerIds.length
      ? await this.employeeDetailsRepository.find({
          where: { employeeId: In(assignerIds) },
          select: ['employeeId', 'fullName'],
        })
      : [];
    const nameById = new Map(assigners.map((person) => [person.employeeId, person.fullName]));
    const reviewByKey = new Map(
      reviews.map((review) => [`${review.employeeId}|${review.quarter}|${review.financialYear}`, review]),
    );

    return records.map((record) => {
      const review = reviewByKey.get(`${record.employeeId}|${record.quarter}|${record.financialYear}`);
      return {
        ...record,
        assignedBy: review ? nameById.get(review.assignerId) || null : null,
        assignedDate: review?.assignedDate ?? null,
        deadlineDate: review?.deadlineDate ?? null,
      };
    });
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
        const caught = this.caughtError(err);
        this.logger.warn(`Could not fetch employee details for enrichment: ${caught.message}`);
      }
    }

    const now = new Date();
    const requestWindowMs = appraisalWindowMs(APPRAISAL_EDIT_WINDOW_HOURS);

    return records.map((r) => {
      const empInfo = employeeMap.get(r.employeeId);

      let canRequestEdit = false;
      if (r.status === EmployeePerformanceStatus.SUBMITTED && r.submittedAt) {
        const diffMs = now.getTime() - new Date(r.submittedAt).getTime();
        canRequestEdit = diffMs <= requestWindowMs;
      }

      const isEditWindowActive = !!(
        r.status === EmployeePerformanceStatus.EDIT_GRANTED &&
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
