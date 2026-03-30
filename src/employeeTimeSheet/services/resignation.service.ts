import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resignation } from '../entities/resignation.entity';
import { ResignationStatus } from '../enums/resignation-status.enum';
import { CreateResignationDto } from '../dto/resignation.dto';
import { UpdateResignationStatusDto } from '../dto/resignation.dto';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import { EmailService } from '../../email/email.service';
import { getNotificationEmailTemplate } from '../../common/mail/email-templates';

@Injectable()
export class ResignationService {
  private readonly logger = new Logger(ResignationService.name);

  constructor(
    @InjectRepository(Resignation)
    private readonly resignationRepository: Repository<Resignation>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateResignationDto): Promise<Resignation> {
    this.logger.log(`[CREATE] Resignation for employee: ${dto.employeeId}`);
    const resignation = this.resignationRepository.create({
      employeeId: dto.employeeId,
      submittedDate: dto.submittedDate,
      proposedLastWorkingDate: null,
      reason: dto.reason.trim(),
      status: ResignationStatus.PENDING_MANAGER,
      noticePeriod: dto.noticePeriod ?? null,
      handoverTo: dto.handoverTo ?? null,
      handoverDescription: dto.handoverDescription ?? null,
      comments: dto.comments ?? null,
      ccEmails: dto.ccEmails?.length ? JSON.stringify(dto.ccEmails) : null,
    });
    return await this.resignationRepository.save(resignation);
  }

  async findAll(filters: {
    employeeId?: string;
    department?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    managerName?: string;
    managerId?: string;
  }): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const { employeeId, department, status, search, page = 1, limit = 10, managerName, managerId } = filters;
    this.logger.log(`[FETCH] Resignations - employeeId=${employeeId}, status=${status}, page=${page}`);

    const qb = this.resignationRepository
      .createQueryBuilder('r')
      .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = r.employeeId')
      .select([
        'r.id AS id',
        'r.employeeId AS employeeId',
        'r.submittedDate AS submittedDate',
        'r.reason AS reason',
        'r.status AS status',
        'r.managerApprovalStatus AS managerStatus',
        'r.managerReviewedBy AS managerReviewedBy',
        'r.managerReviewedAt AS managerReviewedAt',
        'r.managerComments AS managerComments',
        'r.hrApprovalStatus AS finalStatus',
        'r.finalReviewedBy AS finalReviewedBy',
        'r.finalReviewedAt AS finalReviewedAt',
        'r.finalComments AS finalComments',
        'r.noticePeriodStartDate AS noticePeriodStartDate',
        'r.noticePeriodEndDate AS noticePeriodEndDate',
        'r.noticePeriodDays AS noticePeriodDays',
        'r.ccEmails AS ccEmails',
        'r.createdAt AS createdAt',
        'r.updatedAt AS updatedAt',
        'ed.fullName AS fullName',
        'ed.department AS department',
        'ed.designation AS designation',
      ]);

    if (employeeId) {
      qb.andWhere('r.employeeId = :employeeId', { employeeId });
    }
    if (department && department !== 'All') {
      qb.andWhere('ed.department = :department', { department });
    }
    if (status && status !== 'All') {
      qb.andWhere('r.status = :status', { status });
    }
    if (search && search.trim() !== '') {
      const pattern = `%${search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(ed.fullName) LIKE :pattern OR LOWER(r.employeeId) LIKE :pattern OR LOWER(r.reason) LIKE :pattern)',
        { pattern },
      );
    }
    if (managerName || managerId) {
      qb.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = r.employeeId AND mm.status = :mmStatus', {
        mmStatus: ManagerMappingStatus.ACTIVE,
      });
      qb.andWhere(
        '(mm.managerName = :managerName OR mm.managerName = :managerIdOrName OR r.employeeId = :exactManagerId)',
        {
          managerName: managerName || '',
          managerIdOrName: managerId || managerName || '',
          exactManagerId: managerId || '',
        },
      );
    }

    const total = await qb.getCount();
    const data = await qb
      .orderBy('r.updatedAt', 'DESC')
      .addOrderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    return {
      data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByEmployeeId(employeeId: string, status?: string, page = 1, limit = 10) {
    return this.findAll({ employeeId, status, page, limit });
  }

  async findOne(id: number): Promise<any> {
    const result = await this.resignationRepository
      .createQueryBuilder('r')
      .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = r.employeeId')
      .where('r.id = :id', { id })
      .select([
        'r.id AS id',
        'r.employeeId AS employeeId',
        'r.submittedDate AS submittedDate',
        'r.reason AS reason',
        'r.status AS status',
        'r.managerApprovalStatus AS managerStatus',
        'r.managerReviewedBy AS managerReviewedBy',
        'r.managerReviewedAt AS managerReviewedAt',
        'r.managerComments AS managerComments',
        'r.hrApprovalStatus AS finalStatus',
        'r.finalReviewedBy AS finalReviewedBy',
        'r.finalReviewedAt AS finalReviewedAt',
        'r.finalComments AS finalComments',
        'r.noticePeriodStartDate AS noticePeriodStartDate',
        'r.noticePeriodEndDate AS noticePeriodEndDate',
        'r.noticePeriodDays AS noticePeriodDays',
        'r.ccEmails AS ccEmails',
        'r.createdAt AS createdAt',
        'r.updatedAt AS updatedAt',
        'ed.fullName AS fullName',
        'ed.department AS department',
        'ed.designation AS designation',
        'ed.email AS email',
      ])
      .getRawOne();

    if (!result) {
      throw new NotFoundException(`Resignation with ID ${id} not found`);
    }
    return result;
  }

  async updateStatus(
    id: number,
    dto: UpdateResignationStatusDto,
    actor: { name: string; role?: string; userType?: string; employeeId?: string },
  ): Promise<Resignation> {
    const resignation = await this.resignationRepository.findOne({ where: { id } });
    if (!resignation) {
      throw new NotFoundException(`Resignation with ID ${id} not found`);
    }

    if (![ResignationStatus.APPROVED, ResignationStatus.REJECTED].includes(dto.status)) {
      throw new ForbiddenException('Only APPROVED or REJECTED status updates are allowed for review action');
    }
    if (!dto.comments?.trim()) {
      throw new ForbiddenException('comments is required for all approvals/rejections');
    }

    const actorRole = this.resolveActorRole(actor?.role, actor?.userType);
    if (actorRole === 'MANAGER') {
      this.validateManagerTransition(resignation, dto);
      if (dto.status === ResignationStatus.APPROVED) {
        resignation.status = ResignationStatus.PENDING_HR_ADMIN;
        resignation.managerApprovalStatus = ResignationStatus.MANAGER_APPROVED;
      } else {
        resignation.status = ResignationStatus.REJECTED;
        resignation.managerApprovalStatus = ResignationStatus.MANAGER_REJECTED;
      }

      resignation.managerReviewedBy = actor?.name || null;
      resignation.managerReviewedAt = new Date();
      resignation.managerComments = dto.comments.trim();
      this.appendAuditLog(resignation, actor, 'MANAGER', dto.status, dto.comments.trim());
      return await this.resignationRepository.save(resignation);
    }

    if (actorRole === 'HR_ADMIN') {
      this.validateHrAdminTransition(resignation, dto);
      resignation.finalReviewedBy = actor?.name || null;
      resignation.finalReviewedAt = new Date();
      resignation.finalComments = dto.comments.trim();
      resignation.hrApprovalStatus = dto.status;
      resignation.finalExitStatus = dto.status;

      if (dto.status === ResignationStatus.APPROVED) {
        resignation.noticePeriodStartDate = dto.noticePeriodStartDate!;
        resignation.noticePeriodEndDate = dto.noticePeriodEndDate!;
        resignation.noticePeriodDays = this.calculateNoticePeriodDays(dto.noticePeriodStartDate!, dto.noticePeriodEndDate!);
        resignation.status = ResignationStatus.APPROVED;
      } else {
        resignation.status = ResignationStatus.REJECTED;
      }

      this.appendAuditLog(resignation, actor, 'HR_ADMIN', dto.status, dto.comments.trim(), dto.noticePeriodStartDate, dto.noticePeriodEndDate);
      const saved = await this.resignationRepository.save(resignation);
      if (dto.status === ResignationStatus.APPROVED) {
        await this.sendFinalApprovalEmail(saved);
      }
      return saved;
    }

    throw new ForbiddenException('Only manager or HR/Admin can review resignation status');
  }

  async withdraw(id: number, employeeId: string): Promise<Resignation> {
    const resignation = await this.resignationRepository.findOne({ where: { id } });
    if (!resignation) {
      throw new NotFoundException(`Resignation with ID ${id} not found`);
    }
    if (resignation.employeeId !== employeeId) {
      throw new ForbiddenException('Only the applicant can withdraw this resignation');
    }
    if (resignation.status !== ResignationStatus.PENDING_MANAGER) {
      throw new ForbiddenException(`Only PENDING_MANAGER resignations can be withdrawn. Current status: ${resignation.status}`);
    }
    resignation.status = ResignationStatus.WITHDRAWN;
    return await this.resignationRepository.save(resignation);
  }

  /** Returns basic employee details + reporting manager for the resignation form (Basic Employee Details section). */
  async getResignationFormContext(employeeId: string): Promise<{
    employee: {
      employeeId: string;
      fullName: string;
      department: string;
      designation: string;
      reportingManager: string | null;
    };
  }> {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId },
      select: ['employeeId', 'fullName', 'department', 'designation'],
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
    const mapping = await this.managerMappingRepository.findOne({
      where: { employeeId, status: ManagerMappingStatus.ACTIVE },
    });
    const reportingManager = mapping?.managerName ?? null;
    return {
      employee: {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        department: employee.department ?? '',
        designation: employee.designation ?? '',
        reportingManager,
      },
    };
  }

  private validateManagerTransition(resignation: Resignation, dto: UpdateResignationStatusDto): void {
    if (resignation.status !== ResignationStatus.PENDING_MANAGER) {
      throw new ForbiddenException(`Manager action allowed only at PENDING_MANAGER stage. Current status: ${resignation.status}`);
    }
    if (dto.noticePeriodStartDate || dto.noticePeriodEndDate) {
      throw new ForbiddenException('Manager cannot provide noticePeriodStartDate/noticePeriodEndDate');
    }
  }

  private validateHrAdminTransition(resignation: Resignation, dto: UpdateResignationStatusDto): void {
    if (resignation.status !== ResignationStatus.PENDING_HR_ADMIN) {
      throw new ForbiddenException(`HR/Admin action allowed only at PENDING_HR_ADMIN stage. Current status: ${resignation.status}`);
    }
    if (dto.status === ResignationStatus.APPROVED) {
      if (!dto.noticePeriodStartDate || !dto.noticePeriodEndDate) {
        throw new ForbiddenException('noticePeriodStartDate and noticePeriodEndDate are required for HR/Admin approval');
      }
      if (new Date(dto.noticePeriodEndDate).getTime() < new Date(dto.noticePeriodStartDate).getTime()) {
        throw new ForbiddenException('noticePeriodEndDate must be greater than or equal to noticePeriodStartDate');
      }
    }
  }

  private calculateNoticePeriodDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / dayMs);
  }

  private resolveActorRole(role?: string, userType?: string): 'MANAGER' | 'HR_ADMIN' | 'UNKNOWN' {
    const roleUpper = (role || '').toUpperCase();
    const userTypeUpper = (userType || '').toUpperCase();
    if (userTypeUpper === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER)) {
      return 'MANAGER';
    }
    if (userTypeUpper === UserType.ADMIN || roleUpper.includes('ADMIN') || roleUpper.includes('HR')) {
      return 'HR_ADMIN';
    }
    return 'UNKNOWN';
  }

  private appendAuditLog(
    resignation: Resignation,
    actor: { name: string; role?: string; userType?: string; employeeId?: string },
    stage: 'MANAGER' | 'HR_ADMIN',
    action: ResignationStatus,
    comments: string,
    noticePeriodStartDate?: string,
    noticePeriodEndDate?: string,
  ): void {
    const prev = resignation.auditLog ? JSON.parse(resignation.auditLog) : [];
    prev.push({
      at: new Date().toISOString(),
      actorUserId: actor?.employeeId || null,
      actorName: actor?.name || null,
      actorRole: actor?.role || actor?.userType || null,
      stage,
      action,
      comments,
      changedFields: {
        noticePeriodStartDate: noticePeriodStartDate ?? null,
        noticePeriodEndDate: noticePeriodEndDate ?? null,
        status: resignation.status,
      },
    });
    resignation.auditLog = JSON.stringify(prev);
  }

  private async sendFinalApprovalEmail(resignation: Resignation): Promise<void> {
    try {
      const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId: resignation.employeeId } });
      if (!employee?.email) return;

      const recipients = [employee.email];
      const adminEmail = (process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME)?.trim();
      const hrEmail = (process.env.HR_EMAIL || '').trim();
      if (adminEmail) recipients.push(adminEmail);
      if (hrEmail) recipients.push(hrEmail);

      const cc = resignation.ccEmails ? JSON.parse(resignation.ccEmails) : [];
      for (const ccEmail of cc) {
        if (ccEmail && typeof ccEmail === 'string') recipients.push(ccEmail);
      }

      const uniqueRecipients = Array.from(new Set(recipients.map((e) => e.toLowerCase())));
      const subject = `Resignation Approved - ${employee.fullName}`;
      const text = `Your resignation has been approved. Notice period: ${resignation.noticePeriodDays ?? 0} days.`;
      const html = getNotificationEmailTemplate(
        'Resignation Approved',
        `Hello ${employee.fullName},\n\nYour resignation request has been approved.\nNotice Start Date: ${resignation.noticePeriodStartDate}\nNotice End Date: ${resignation.noticePeriodEndDate}\nNotice Period: ${resignation.noticePeriodDays ?? 0} days\nReviewed By: ${resignation.finalReviewedBy || 'HR/Admin'}\nRemarks: ${resignation.finalComments || '-'}`,
      );

      for (const email of uniqueRecipients) {
        await this.emailService.sendEmail(email, subject, text, html);
      }
    } catch (error) {
      this.logger.error(`[RESIGNATION_APPROVAL_EMAIL] Failed: ${error.message}`);
    }
  }
}
