import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import dayjs from 'dayjs';
import { AttendenceEditRequest } from '../entities/attendence-edit-request.entity';
import { AttendenceEditRequestStatus } from '../enums/attendence-edit-request-status.enum';
import { AttendanceStatus } from '../enums/attendance-status.enum';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import {
  ManagerMapping,
  ManagerMappingStatus,
} from '../../managerMapping/entities/managerMapping.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationsService } from '../../notifications/Services/notifications.service';
import { MasterDepartmentService } from '../../master/service/master-department.service';
import { LockType } from '../../master/enums/lock-type.enum';
import {
  AttendenceEditRequestResponseDto,
  CreateAttendenceEditRequestDto,
} from '../dto/attendence-edit-request.dto';
import { EmailService } from '../../email/email.service';
import { getGeneralNotificationTemplate } from '../../common/mail/templates';
import { hasAdminAccess, isCeoUser } from '../../users/utils/admin-access';
import { UserType } from '../../users/enums/user-type.enum';

export interface AttendenceEditRequestQuery {
  managerId?: string;
  department?: string;
  status?: string;
  lockType?: string;
  role?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AttendenceEditRequestService {
  private readonly logger = new Logger(AttendenceEditRequestService.name);

  constructor(
    @InjectRepository(AttendenceEditRequest)
    private readonly requestRepo: Repository<AttendenceEditRequest>,
    @InjectRepository(EmployeeAttendance)
    private readonly attendanceRepo: Repository<EmployeeAttendance>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepo: Repository<ManagerMapping>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly masterDepartmentService: MasterDepartmentService,
    private readonly emailService: EmailService,
  ) {}

  parseDates(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((d) => dayjs(d).format('YYYY-MM-DD')).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  formatDateList(dates: string[]): string {
    return dates.join(', ');
  }

  toResponse(
    entity: AttendenceEditRequest,
    extra?: { fullName?: string; department?: string; lockType?: string },
  ): AttendenceEditRequestResponseDto {
    return {
      id: entity.id,
      employeeId: entity.employeeId,
      requestDates: this.parseDates(entity.requestDates),
      status: entity.status,
      reason: entity.reason,
      reviewedBy: entity.reviewedBy,
      reviewedAt: entity.reviewedAt,
      submittedDate: entity.submittedDate
        ? dayjs(entity.submittedDate).format('YYYY-MM-DD')
        : entity.createdAt
          ? dayjs(entity.createdAt).format('YYYY-MM-DD')
          : null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      fullName: extra?.fullName,
      department: extra?.department,
      lockType: extra?.lockType || entity.lockType || LockType.WEEKLY,
    };
  }

  async getApprovedDates(employeeId: string): Promise<string[]> {
    const requests = await this.requestRepo.find({
      where: {
        employeeId,
        status: AttendenceEditRequestStatus.APPROVED,
      },
    });
    const dates = new Set<string>();
    requests.forEach((req) =>
      this.parseDates(req.requestDates).forEach((d) => dates.add(d)),
    );
    return Array.from(dates);
  }

  async getPendingDates(employeeId: string): Promise<string[]> {
    const requests = await this.requestRepo.find({
      where: {
        employeeId,
        status: AttendenceEditRequestStatus.PENDING,
      },
    });
    const dates = new Set<string>();
    requests.forEach((req) =>
      this.parseDates(req.requestDates).forEach((d) => dates.add(d)),
    );
    return Array.from(dates);
  }

  async hasApprovedAccess(
    employeeId: string,
    workingDate: Date | string,
  ): Promise<boolean> {
    const dateStr = dayjs(workingDate).format('YYYY-MM-DD');
    const approved = await this.getApprovedDates(employeeId);
    return approved.includes(dateStr);
  }

  private isLockedAttendanceValue(value?: AttendanceStatus | string | null) {
    return String(value || '').toLowerCase() === AttendanceStatus.LOCKED.toLowerCase();
  }

  async assertCanEditLockedDay(
    employeeId: string,
    workingDate: Date | string,
    currentStatus?: AttendanceStatus | string | null,
    firstHalf?: AttendanceStatus | string | null,
    secondHalf?: AttendanceStatus | string | null,
  ): Promise<void> {
    const isLocked =
      this.isLockedAttendanceValue(currentStatus) ||
      this.isLockedAttendanceValue(firstHalf) ||
      this.isLockedAttendanceValue(secondHalf);
    if (!isLocked) return;
    const allowed = await this.hasApprovedAccess(employeeId, workingDate);
    if (!allowed) {
      throw new BadRequestException(
        'This date is Locked. Request Edit Access from your manager to update it.',
      );
    }
  }

  async createForEmployee(
    employeeId: string,
    dto: CreateAttendenceEditRequestDto,
    actorId?: string,
    actor?: any,
  ): Promise<AttendenceEditRequestResponseDto> {
    await this.assertCanRaiseFor(actor || { loginId: actorId }, employeeId);
    const requested = Array.from(
      new Set(
        (dto.requestDates || [])
          .map((d) => dayjs(d).format('YYYY-MM-DD'))
          .filter((d) => d && d !== 'Invalid Date'),
      ),
    );

    if (requested.length === 0) {
      throw new BadRequestException('Select at least one Locked date.');
    }

    // Employees raising for themselves are limited to the current month; managers/admins raising on behalf are not.
    const isSelfRequest = !actorId || String(actorId).toLowerCase() === String(employeeId).toLowerCase();
    if (isSelfRequest) {
      const currentMonth = dayjs().format('YYYY-MM');
      const outsideMonth = requested.filter((d) => !d.startsWith(currentMonth));
      if (outsideMonth.length > 0) {
        throw new BadRequestException(
          `Edit Access can only be requested for Locked dates in the current month (${dayjs().format('MMMM YYYY')}).`,
        );
      }
    }

    const pendingDates = new Set(await this.getPendingDates(employeeId));
    const datesToSave = requested.filter((d) => !pendingDates.has(d));

    if (datesToSave.length === 0) {
      throw new BadRequestException(
        'All selected dates are already in a pending Edit Access request.',
      );
    }

    const records = await this.attendanceRepo.find({
      where: { employeeId },
    });
    const lockedByDate = new Map<string, EmployeeAttendance>();
    records.forEach((r) => {
      const key = dayjs(r.workingDate).format('YYYY-MM-DD');
      if (r.status === AttendanceStatus.LOCKED) {
        lockedByDate.set(key, r);
      }
    });

    const onlyLocked = datesToSave.filter((d) => lockedByDate.has(d));
    if (onlyLocked.length === 0) {
      throw new BadRequestException(
        'Only Locked dates can be requested for Edit Access.',
      );
    }

    const lockType = await this.getEmployeeLockType(employeeId);
    const entity = this.requestRepo.create({
      employeeId,
      requestDates: JSON.stringify(onlyLocked),
      status: AttendenceEditRequestStatus.PENDING,
      reason: dto.reason || null,
      submittedDate: dayjs().format('YYYY-MM-DD'),
      lockType,
      createdBy: actorId || employeeId,
    });
    const saved = await this.requestRepo.save(entity);

    await this.notifyManagersOnSubmit(employeeId, onlyLocked, actorId);

    this.logger.log(
      `Edit Access request ${saved.id} created for ${employeeId}: ${onlyLocked.join(',')}`,
    );
    return this.toResponse(saved);
  }

  async findMine(employeeId: string): Promise<AttendenceEditRequestResponseDto[]> {
    const rows = await this.requestRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findForReviewer(
    user: any,
    query: AttendenceEditRequestQuery = {},
  ): Promise<{
    items: AttendenceEditRequestResponseDto[];
    lockType: string;
    meta: {
      totalItems: number;
      itemCount: number;
      itemsPerPage: number;
      totalPages: number;
      currentPage: number;
    };
  }> {
    const isAdmin = hasAdminAccess(user);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const empty = {
      items: [] as AttendenceEditRequestResponseDto[],
      lockType: LockType.WEEKLY as string,
      meta: {
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: limit,
        totalPages: 0,
        currentPage: page,
      },
    };

    let employeeIds: string[] | null = null;
    if (isCeoUser(user)) {
      employeeIds = await this.getManagerEmployeeIds();
      if (employeeIds.length === 0) return empty;
    } else if (!isAdmin) {
      employeeIds = await this.getVisibleEmployeeIds(user?.loginId, user);
      if (employeeIds.length === 0) return empty;
    } else if (query.managerId) {
      employeeIds = await this.getVisibleEmployeeIds(query.managerId, user);
    }

    const roleFilter = (query.role || '').trim();
    if (roleFilter) {
      const roleIds = await this.getEmployeeIdsByRole(roleFilter);
      if (roleIds.length === 0) return empty;
      if (employeeIds) {
        const allowed = new Set(roleIds);
        employeeIds = employeeIds.filter((id) => allowed.has(id));
        if (employeeIds.length === 0) return empty;
      } else {
        employeeIds = roleIds;
      }
    }

    const qb = this.requestRepo.createQueryBuilder('req');

    if (employeeIds) {
      qb.andWhere('req.employeeId IN (:...employeeIds)', { employeeIds });
    }

    const department =
      query.department && query.department !== 'All'
        ? query.department.trim()
        : '';
    if (department) {
      const scopedIds = await this.getEmployeeIdsByFilters(department, '');
      if (scopedIds.length === 0) {
        return {
          ...empty,
          lockType: await this.resolveLockType(user, department, isAdmin),
        };
      }
      qb.andWhere('req.employeeId IN (:...scopedIds)', { scopedIds });
    }

    const lockType =
      query.lockType && query.lockType !== 'All' ? query.lockType.trim() : '';
    if (lockType) {
      qb.andWhere('req.lockType = :lockType', { lockType });
    }

    const status =
      query.status && query.status !== 'All' ? query.status.trim() : '';
    if (status) {
      qb.andWhere('req.status = :status', { status });
    }

    qb.orderBy('req.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, totalItems] = await qb.getManyAndCount();
    const items = await this.enrichRequests(rows);
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;
    const resolvedLockType = await this.resolveLockType(
      user,
      department,
      isAdmin,
    );

    return {
      items,
      lockType: resolvedLockType,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async approve(
    id: number,
    reviewer: any,
  ): Promise<AttendenceEditRequestResponseDto> {
    const request = await this.getReviewableRequest(id, reviewer);
    if (request.status !== AttendenceEditRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved.');
    }

    request.status = AttendenceEditRequestStatus.APPROVED;
    request.reviewedBy = reviewer?.loginId || reviewer?.aliasLoginName || null;
    request.reviewedAt = new Date();
    request.updatedBy = request.reviewedBy || 'system';
    const saved = await this.requestRepo.save(request);

    const dates = this.parseDates(saved.requestDates);
    await this.unlockApprovedDates(saved.employeeId, dates);
    await this.notifyReviewOutcome(saved, reviewer, 'Approved', dates);
    return this.toResponse(saved);
  }

  async reject(
    id: number,
    reviewer: any,
    reason?: string,
  ): Promise<AttendenceEditRequestResponseDto> {
    const request = await this.getReviewableRequest(id, reviewer);
    if (request.status !== AttendenceEditRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected.');
    }

    request.status = AttendenceEditRequestStatus.REJECTED;
    request.reason = reason || request.reason;
    request.reviewedBy = reviewer?.loginId || reviewer?.aliasLoginName || null;
    request.reviewedAt = new Date();
    request.updatedBy = request.reviewedBy || 'system';
    const saved = await this.requestRepo.save(request);

    const dates = this.parseDates(saved.requestDates);
    await this.notifyReviewOutcome(saved, reviewer, 'Rejected', dates);
    return this.toResponse(saved);
  }

  private async unlockApprovedDates(
    employeeId: string,
    dates: string[],
  ): Promise<void> {
    if (dates.length === 0) return;
    const dateSet = new Set(dates);
    const records = await this.attendanceRepo.find({ where: { employeeId } });
    const toSave = records.filter((row) => {
      const key = dayjs(row.workingDate).format('YYYY-MM-DD');
      return dateSet.has(key) && row.status === AttendanceStatus.LOCKED;
    });
    toSave.forEach((row) => {
      row.status = AttendanceStatus.NOT_UPDATED;
      row.firstHalf = AttendanceStatus.NOT_UPDATED;
      row.secondHalf = AttendanceStatus.NOT_UPDATED;
      row.totalHours = null;
      row.workLocation = null;
    });
    if (toSave.length > 0) {
      await this.attendanceRepo.save(toSave);
      this.logger.log(
        `Unlocked ${toSave.length} Locked day(s) to Not Updated for ${employeeId}: ${dates.join(',')}`,
      );
    }
  }

  private async getReviewableRequest(
    id: number,
    reviewer: any,
  ): Promise<AttendenceEditRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Edit Access request ${id} not found`);
    }

    if (isCeoUser(reviewer)) {
      const employee = await this.employeeRepo.findOne({
        where: { employeeId: request.employeeId },
      });
      if (!employee || String(employee.role || '').toUpperCase() !== UserType.MANAGER) {
        throw new ForbiddenException(
          'CEO can review access tickets only for managers',
        );
      }
      return request;
    }

    const isAdmin = hasAdminAccess(reviewer);
    if (!isAdmin) {
      const allowedIds = await this.getVisibleEmployeeIds(
        reviewer?.loginId,
        reviewer,
      );
      if (!allowedIds.includes(request.employeeId)) {
        throw new ForbiddenException(
          'You can only review requests for yourself or mapped employees.',
        );
      }
    }
    return request;
  }

  private async assertCanRaiseFor(actor: any, targetEmployeeId: string): Promise<void> {
    const actorId = actor?.loginId;
    if (!targetEmployeeId) {
      throw new BadRequestException('Employee is required.');
    }
    if (actorId && actorId === targetEmployeeId) return;
    if (hasAdminAccess(actor)) return;

    const mapped = await this.getVisibleEmployeeIds(actorId, actor);
    if (!mapped.includes(targetEmployeeId)) {
      throw new ForbiddenException(
        'You can only raise Edit Access for yourself or mapped employees.',
      );
    }
  }

  private async enrichRequests(
    rows: AttendenceEditRequest[],
  ): Promise<AttendenceEditRequestResponseDto[]> {
    if (rows.length === 0) return [];
    const ids = Array.from(new Set(rows.map((r) => r.employeeId)));
    const employees = await this.employeeRepo.find({
      where: { employeeId: In(ids) },
    });
    const empMap = new Map(employees.map((e) => [e.employeeId, e]));
    const departments = await this.masterDepartmentService.findAll();
    const deptLock = new Map(
      departments.map((d) => [
        (d.departmentName || '').trim().toLowerCase(),
        d.lockType || LockType.WEEKLY,
      ]),
    );

    return rows.map((r) => {
      const emp = empMap.get(r.employeeId);
      const dept = (emp?.department || '').toString().trim().toLowerCase();
      return this.toResponse(r, {
        fullName: emp?.fullName,
        department: emp?.department,
        lockType: r.lockType || deptLock.get(dept) || LockType.WEEKLY,
      });
    });
  }

  private async getEmployeeLockType(employeeId: string): Promise<LockType> {
    const employee = await this.employeeRepo.findOne({
      where: { employeeId },
    });
    const dept = (employee?.department || '').toString().trim().toLowerCase();
    if (!dept) return LockType.WEEKLY;
    const departments = await this.masterDepartmentService.findAll();
    const match = departments.find(
      (d) => (d.departmentName || '').trim().toLowerCase() === dept,
    );
    return match?.lockType || LockType.WEEKLY;
  }

  private async resolveLockType(
    user: any,
    department: string,
    isAdmin: boolean,
  ): Promise<string> {
    const departments = await this.masterDepartmentService.findAll();
    const findLock = (name: string) =>
      departments.find(
        (d) =>
          (d.departmentName || '').trim().toLowerCase() ===
          name.trim().toLowerCase(),
      )?.lockType || LockType.WEEKLY;

    if (department) return findLock(department);
    if (!isAdmin && user?.loginId) {
      const details = await this.employeeRepo.findOne({
        where: { employeeId: user.loginId },
      });
      if (details?.department) {
        return findLock(String(details.department));
      }
    }
    return LockType.WEEKLY;
  }

  private async getEmployeeIdsByFilters(
    department: string,
    lockType: string,
  ): Promise<string[]> {
    let allowedDepartments: string[] | null = null;
    if (lockType) {
      const departments = await this.masterDepartmentService.findAll();
      allowedDepartments = departments
        .filter((d) => (d.lockType || LockType.WEEKLY) === lockType)
        .map((d) => (d.departmentName || '').trim().toLowerCase())
        .filter(Boolean);
      if (allowedDepartments.length === 0) return [];
    }

    const employees = await this.employeeRepo.find({
      select: ['employeeId', 'department'],
    });
    return employees
      .filter((emp) => {
        const dept = (emp.department || '').toString().trim().toLowerCase();
        if (department && dept !== department.toLowerCase()) return false;
        if (allowedDepartments && !allowedDepartments.includes(dept)) {
          return false;
        }
        return true;
      })
      .map((emp) => emp.employeeId);
  }

  private async getManagerEmployeeIds(): Promise<string[]> {
    return this.getEmployeeIdsByRole(UserType.MANAGER);
  }

  private async getEmployeeIdsByRole(role: string): Promise<string[]> {
    const roles = role
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean) as UserType[];
    if (roles.length === 0) return [];
    const rows = await this.employeeRepo.find({
      where: { role: In(roles) },
      select: ['employeeId'],
    });
    return rows.map((row) => row.employeeId).filter(Boolean);
  }

  private async getVisibleEmployeeIds(
    managerId: string | undefined,
    user?: any,
  ): Promise<string[]> {
    const id = (managerId || '').trim();
    if (!id) return [];
    const ids = new Set<string>([id]);

    const details = await this.employeeRepo.findOne({
      where: { employeeId: id },
    });
    if (details?.department) {
      const teammates = await this.employeeRepo.find({
        where: { department: details.department },
        select: ['employeeId'],
      });
      teammates.forEach((e) => ids.add(e.employeeId));
    }

    const names = [id, user?.aliasLoginName, details?.fullName]
      .filter(Boolean)
      .map((n) => String(n).toLowerCase());
    if (names.length > 0) {
      const mapped = await this.managerMappingRepo
        .createQueryBuilder('m')
        .select('m.employee_id', 'employeeId')
        .where('m.status = :status', { status: ManagerMappingStatus.ACTIVE })
        .andWhere('LOWER(m.manager_name) IN (:...names)', { names })
        .getRawMany();
      mapped.forEach((row) => {
        if (row.employeeId) ids.add(row.employeeId);
      });
    }

    return Array.from(ids);
  }

  private async notifyPerson(
    employeeId: string,
    title: string,
    message: string,
    type: string,
  ): Promise<void> {
    await this.notificationsService.createNotification({
      employeeId,
      title,
      message,
      type,
    });
    const details =
      (await this.employeeRepo.findOne({ where: { employeeId } })) ||
      (await this.employeeRepo.findOne({ where: { fullName: employeeId } }));
    if (!details?.email) {
      this.logger.warn(`[ACCESS_EMAIL] No email found for recipient: ${employeeId}`);
      return;
    }
    const html = getGeneralNotificationTemplate({
      recipientName: details.fullName || 'Team member',
      title,
      message: `${message}\n\nRegards,\nWorksphere Team`,
    });
    this.logger.log(
      `[ACCESS_EMAIL] Sending "${title}" email to ${details.email} (${employeeId})`,
    );
    await this.emailService.sendEmail(details.email, title, message, html);
    this.logger.log(
      `[ACCESS_EMAIL] Queued "${title}" email for ${details.email}`,
    );
  }

  private async notifyManagersOnSubmit(
    employeeId: string,
    dates: string[],
    actorId?: string,
  ): Promise<void> {
    try {
      const employee = await this.employeeRepo.findOne({
        where: { employeeId },
      });
      const displayName = employee?.fullName || employeeId;
      const dateList = this.formatDateList(dates);
      const raisedBySelf = !actorId || actorId === employeeId;

      await this.notifyPerson(
        employeeId,
        'Edit Access Request Submitted',
        raisedBySelf
          ? `Your Edit Access request was submitted for: ${dateList}`
          : `An Edit Access request was raised on your behalf for: ${dateList}`,
        'alert',
      );

      const mappings = await this.managerMappingRepo
        .createQueryBuilder('m')
        .select(['m.manager_name AS managerName', 'm.manager_id AS managerId'])
        .where('m.employee_id = :employeeId', { employeeId })
        .andWhere('m.status = :status', { status: ManagerMappingStatus.ACTIVE })
        .getRawMany();

      const notified = new Set<string>([employeeId]);
      for (const mapping of mappings) {
        let managerId = mapping.managerId;
        if (!managerId) {
          const manager = await this.userRepo.findOne({
            where: [
              { aliasLoginName: mapping.managerName },
              { loginId: mapping.managerName },
            ],
          });
          managerId = manager?.loginId || mapping.managerName;
        }
        if (!managerId || notified.has(managerId)) continue;
        notified.add(managerId);
        await this.notifyPerson(
          managerId,
          'Edit Access Request',
          `${displayName} requested Edit Access for: ${dateList}`,
          'alert',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to notify managers for Edit Access submit: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async notifyReviewOutcome(
    request: AttendenceEditRequest,
    reviewer: any,
    outcome: 'Approved' | 'Rejected',
    dates: string[],
  ): Promise<void> {
    try {
      const dateList = this.formatDateList(dates);
      const actor =
        reviewer?.aliasLoginName || reviewer?.loginId || 'Reviewer';
      const employee = await this.employeeRepo.findOne({
        where: { employeeId: request.employeeId },
      });
      const displayName = employee?.fullName || request.employeeId;

      // Auto-mark previous "Edit Access Request Submitted" notification as read so employee inbox only shows latest outcome
      await this.notificationsService.markByTitleAsRead(
        request.employeeId,
        'Edit Access Request Submitted',
      );

      await this.notifyPerson(
        request.employeeId,
        `Edit Access ${outcome}`,
        `Your Edit Access request was ${outcome.toLowerCase()} by ${actor} for: ${dateList}`,
        outcome === 'Approved' ? 'success' : 'alert',
      );

      const actorId = reviewer?.loginId;
      if (actorId && actorId !== request.employeeId) {
        await this.notifyPerson(
          actorId,
          `Edit Access ${outcome}`,
          `You ${outcome.toLowerCase()} Edit Access for ${displayName}: ${dateList}`,
          outcome === 'Approved' ? 'success' : 'alert',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to notify Edit Access ${outcome}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
