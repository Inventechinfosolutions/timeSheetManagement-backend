import { Injectable, ConflictException, ForbiddenException, NotFoundException, Logger, InternalServerErrorException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In, Brackets, Between, DeepPartial } from 'typeorm';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { AttendanceStatus } from '../enums/attendance-status.enum';
import { LeaveRequestStatus } from '../enums/leave-notification-status.enum';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmploymentType } from '../enums/employment-type.enum';
import { EmailService } from '../../email/email.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { LeaveRequestType } from '../enums/leave-request-type.enum';
import { WorkLocation } from '../enums/work-location.enum';
import { HalfDayType } from '../enums/half-day-type.enum';
import { ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import dayjs from 'dayjs';
import { EmployeeAttendanceService } from './employeeAttendance.service';
import {
  getRequestNotificationTemplate,
  getStatusUpdateTemplate,
  getCancellationTemplate,
  getEmployeeReceiptTemplate,
  getRejectionConfirmationTemplate,
  getCancellationRejectionConfirmationTemplate,
  getApprovalConfirmationTemplate,
  getCancellationApprovalConfirmationTemplate
} from '../../common/mail/templates';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationsService } from '../../notifications/Services/notifications.service';
import { MasterHolidays } from '../../master/models/master-holidays.entity';
import { LeaveRequestDto } from '../dto/leave-request.dto';

@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  // Helper to check if weekend based on department
  private async _isWeekend(date: dayjs.Dayjs, employeeId: string): Promise<boolean> {
    try {
      // Always block Sunday (0) and Saturday (6)
      const day = date.day();
      const isWknd = day === 0 || day === 6;
      if (isWknd) {
        this.logger.debug(`[WEEKEND_CHECK] Date ${date.format('YYYY-MM-DD')} is a weekend for employee ${employeeId}`);
      }
      return isWknd;
    } catch (error) {
      this.logger.error(`[WEEKEND_CHECK] Failed for ${employeeId} on ${date.format('YYYY-MM-DD')}: ${error.message}`);
      return false; // Default to not weekend on error
    }
  }

  // Helper: recalculate and persist monthStatus for an employee based on a date in their month
  private async _recalcMonthStatus(employeeId: string, refDate: string | Date): Promise<void> {
    this.logger.log(`[MONTH_STATUS] Triggering recalc for employee: ${employeeId}, refDate: ${refDate}`);
    try {
      // [DB_TRUTH]: Delegate all status recalculations to EmployeeAttendanceService.
      await this.employeeAttendanceService.triggerMonthStatusRecalc(employeeId, refDate);
      this.logger.log(`[MONTH_STATUS] Recalc triggered successfully for ${employeeId}`);
    } catch (err) {
      this.logger.error(`[MONTH_STATUS] Delegation failed for ${employeeId}: ${err.message}`, err.stack);
    }
  }

  constructor(
    @InjectRepository(LeaveRequest)
    private leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(EmployeeDetails)
    private employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(EmployeeAttendance)
    private employeeAttendanceRepository: Repository<EmployeeAttendance>,
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
    @InjectRepository(ManagerMapping)
    private managerMappingRepository: Repository<ManagerMapping>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(MasterHolidays)
    private masterHolidayRepository: Repository<MasterHolidays>,
    private emailService: EmailService,
    private documentUploaderService: DocumentUploaderService,
    private notificationsService: NotificationsService,
    private employeeAttendanceService: EmployeeAttendanceService,
  ) { }

  // Helper to check if holiday
  private async _isHoliday(date: dayjs.Dayjs): Promise<boolean> {
    const dateStr = date.format('YYYY-MM-DD');
    try {
      // Using QueryBuilder for robust Date comparison in MySQL
      const holiday = await this.masterHolidayRepository.createQueryBuilder('h')
        .where('h.date = :dateStr', { dateStr })
        .getOne();

      const exists = !!holiday;
      if (exists) {
        this.logger.debug(`[HOLIDAY_CHECK] Date ${dateStr} is a holiday: ${holiday.name}`);
      }
      return exists;
    } catch (error) {
      this.logger.error(`[HOLIDAY_CHECK] Failed for ${dateStr}: ${error.message}`, error.stack);
      return false; // Default to not holiday on error
    }
  }

  /**
   * Calculate total working hours based on firstHalf and secondHalf values
   * @param firstHalf - Activity for first half ('Work From Home', 'Client Visit', 'Office', 'Leave', etc.)
   * @param secondHalf - Activity for second half
   * @param providedHours - Optional hours provided by user
   * @returns Total working hours (0, 6, or 9)
   */
  private calculateTotalHours(firstHalf: string | null, secondHalf: string | null, providedHours?: number | null): number {
    try {
      // 1. If user provided a specific value, respect it
      if (providedHours !== undefined && providedHours !== null && providedHours > 0) {
        return Number(providedHours);
      }

      // 2. Otherwise use system defaults based on activities
      const isWork = (half: string | null): boolean => {
        if (!half || half === AttendanceStatus.LEAVE || half === AttendanceStatus.ABSENT) return false;
        const normalized = half.toLowerCase();
        return normalized.includes(WorkLocation.OFFICE.toLowerCase()) ||
          normalized.includes(WorkLocation.WFH.toLowerCase()) ||
          normalized.includes(WorkLocation.WORK_FROM_HOME.toLowerCase()) ||
          normalized.includes(WorkLocation.CLIENT_VISIT.toLowerCase()) ||
          normalized.includes(WorkLocation.PRESENT.toLowerCase());
      };

      const h1Work = isWork(firstHalf);
      const h2Work = isWork(secondHalf);

      if (h1Work && h2Work) return 9;
      if (h1Work || h2Work) return 6;
      return 0;
    } catch (error) {
      this.logger.error(`[CALC_HOURS] Error calculating hours: ${error.message}`);
      return 0; // Default to 0 on error
    }
  }


  async create(data: LeaveRequestDto) {
    this.logger.log(`Starting creation of leave request for employee: ${data.employeeId}, Type: ${data.requestType}`);
    try {
      // Check for overlapping dates based on request type
      if (data.fromDate && data.toDate && data.requestType) {
        this.logger.debug(`[CREATE] Checking for overlaps: ${data.fromDate} to ${data.toDate}`);
        const requestType = data.requestType;

        let conflictingTypes: string[] = [];

        if (requestType === LeaveRequestType.APPLY_LEAVE || requestType === LeaveRequestType.LEAVE) {
          conflictingTypes = [LeaveRequestType.APPLY_LEAVE, LeaveRequestType.LEAVE];
        } else if (requestType === LeaveRequestType.WORK_FROM_HOME) {
          conflictingTypes = [LeaveRequestType.APPLY_LEAVE, LeaveRequestType.LEAVE, LeaveRequestType.WORK_FROM_HOME];
        } else if (requestType === LeaveRequestType.CLIENT_VISIT) {
          conflictingTypes = [LeaveRequestType.APPLY_LEAVE, LeaveRequestType.LEAVE, LeaveRequestType.CLIENT_VISIT];
        } else if (requestType === LeaveRequestType.HALF_DAY) {
          conflictingTypes = [LeaveRequestType.APPLY_LEAVE, LeaveRequestType.LEAVE, LeaveRequestType.HALF_DAY];
        } else {
          conflictingTypes = [requestType];
        }

        const existingRequests = await this.leaveRequestRepository.find({
          where: {
            employeeId: data.employeeId,
            status: In([LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED, LeaveRequestStatus.REQUEST_MODIFIED]),
            requestType: In(conflictingTypes),
            fromDate: LessThanOrEqual(data.toDate),
            toDate: MoreThanOrEqual(data.fromDate),
          },
        });

        for (const existing of existingRequests) {
          const existingIsFull = !existing.isHalfDay;
          const existingConsumesFirst = existingIsFull || (existing.firstHalf && existing.firstHalf !== WorkLocation.OFFICE);
          const existingConsumesSecond = existingIsFull || (existing.secondHalf && existing.secondHalf !== WorkLocation.OFFICE);

          const newWantsFirst = !data.isHalfDay || data.halfDayType === HalfDayType.FIRST_HALF;
          const newWantsSecond = !data.isHalfDay || data.halfDayType === HalfDayType.SECOND_HALF;

          if ((newWantsFirst && existingConsumesFirst) || (newWantsSecond && existingConsumesSecond)) {
            const existingTypeLabel = existingIsFull ? HalfDayType.FULL_DAY :
              (existingConsumesFirst && !existingConsumesSecond) ? HalfDayType.FIRST_HALF :
                (!existingConsumesFirst && existingConsumesSecond) ? HalfDayType.SECOND_HALF : HalfDayType.SPLIT_DAY;

            this.logger.warn(`[CREATE] Conflict detected for employee ${data.employeeId}: Existing ${existingTypeLabel} request on ${existing.fromDate}`);
            throw new ConflictException(
              `Conflict: Request already exists for ${existing.fromDate} to ${existing.toDate} (${existingTypeLabel})`,
            );
          }
        }
      }

      if (!data.submittedDate) {
        data.submittedDate = dayjs().format('YYYY-MM-DD');
      }

      // Calculate duration
      if (data.fromDate && data.toDate) {
        const start = dayjs(data.fromDate);
        const end = dayjs(data.toDate);

        let workingDays = 0;
        const diff = end.diff(start, 'day');

        for (let i = 0; i <= diff; i++) {
          const current = start.add(i, 'day');
          const isWeekend = await this._isWeekend(current, data.employeeId);
          const isHoliday = await this._isHoliday(current);

          if (!isWeekend && !isHoliday) {
            workingDays++;
          }
        }

        if (data.isHalfDay) {
          data.duration = workingDays * 0.5;
        } else {
          data.duration = workingDays;
        }
        this.logger.debug(`[CREATE] Calculated duration: ${data.duration} days`);
      }

      // --- LOGIC: Populate firstHalf and secondHalf ---
      if (data.isHalfDay) {
        const mainType = (data.requestType === LeaveRequestType.APPLY_LEAVE || data.requestType === LeaveRequestType.HALF_DAY ? AttendanceStatus.LEAVE : data.requestType) || WorkLocation.OFFICE;
        const otherHalf = data.otherHalfType || WorkLocation.OFFICE;

        if (data.halfDayType === HalfDayType.FIRST_HALF) {
          data.firstHalf = mainType;
          data.secondHalf = otherHalf;
        } else if (data.halfDayType === HalfDayType.SECOND_HALF) {
          data.firstHalf = otherHalf;
          data.secondHalf = mainType;
        }
      } else {
        const mainType = (data.requestType === LeaveRequestType.APPLY_LEAVE || data.requestType === LeaveRequestType.HALF_DAY ? AttendanceStatus.LEAVE : data.requestType) || WorkLocation.OFFICE;
        data.firstHalf = mainType;
        data.secondHalf = mainType;
      }

      const leaveRequest = this.leaveRequestRepository.create({
        ...data,
        fromDate: data.fromDate,
        toDate: data.toDate,
      } as unknown as DeepPartial<LeaveRequest>) as LeaveRequest;

      const savedRequest = await this.leaveRequestRepository.save(leaveRequest);
      this.logger.log(`[CREATE] Successfully saved leave request ID: ${savedRequest.id} for employee: ${data.employeeId}`);

      // --- NOTIFICATIONS ---
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: data.employeeId },
        });

        if (employee) {
          const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
          const requestTypeLabel = (data.requestType === LeaveRequestType.APPLY_LEAVE ? AttendanceStatus.LEAVE : data.requestType) || 'Request';
          const subject = `New ${requestTypeLabel} Request - ${employee.fullName}`;

          const htmlContent = getRequestNotificationTemplate({
            employeeName: employee.fullName || 'Employee',
            employeeId: employee.employeeId,
            requestType: requestTypeLabel,
            title: data.title || 'No Title',
            fromDate: data.fromDate?.toString() || '',
            toDate: data.toDate?.toString() || '',
            duration: data.duration || 0,
            status: LeaveRequestStatus.PENDING,
            description: data.description || 'N/A'
          });

          if (adminEmail) {
            await this.emailService.sendEmail(
              adminEmail,
              subject,
              `New request from ${employee.fullName}`,
              htmlContent,
              employee.email,
            );
            this.logger.log(`[CREATE] Notification sent to Admin (${adminEmail}) for request from ${employee.fullName}`);
          }
        }
      } catch (error) {
        this.logger.error(`[CREATE] Failed to send admin notification: ${error.message}`);
      }

      // Link orphaned documents
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: savedRequest.employeeId }
        });

        if (employee) {
          const updateResult = await this.documentRepo.update(
            {
              entityType: EntityType.LEAVE_REQUEST,
              entityId: employee.id,
              refId: 0
            },
            {
              refId: savedRequest.id
            }
          );
          if (updateResult && typeof updateResult.affected === 'number' && updateResult.affected > 0) {
            this.logger.log(`[CREATE] Linked ${updateResult.affected} orphaned documents for request ${savedRequest.id}`);
          }
        }
      } catch (error) {
        this.logger.error(`[CREATE] Failed to link orphaned documents for request ${savedRequest.id}: ${error.message}`);
      }

      await this.notifyManagerOfRequest(savedRequest).catch(e => this.logger.error(`[CREATE] notifyManagerOfRequest failed: ${e.message}`));
      await this.notifyEmployeeOfSubmission(savedRequest).catch(e => this.logger.error(`[CREATE] notifyEmployeeOfSubmission failed: ${e.message}`));

      return savedRequest;
    } catch (error) {
      this.logger.error(`[CREATE] Failed for employee ${data.employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to create leave request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  getLeaveDurationTypes() {
    return [
      { label: 'Full Day Application', value: HalfDayType.FULL_DAY },
      { label: 'Half Day Application', value: HalfDayType.HALF_DAY }
    ];
  }

  async findUnifiedRequests(
    filters: {
      employeeId?: string;
      department?: string;
      status?: string;
      search?: string;
      month?: string;
      year?: string;
      page?: number;
      limit?: number;
      managerName?: string;
      managerId?: string;
    }
  ) {
    this.logger.log(`[FETCH] Starting unified request fetch. Filters: ${JSON.stringify(filters)}`);
    try {
      const { employeeId, department, status, search, month = 'All', year = 'All', page = 1, limit = 10, managerName, managerId } = filters;

      const query = this.leaveRequestRepository.createQueryBuilder('lr')
        .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = lr.employeeId')
        .select([
          'lr.id AS id',
          'lr.employeeId AS employeeId',
          'lr.requestType AS requestType',
          'lr.fromDate AS fromDate',
          'lr.toDate AS toDate',
          'lr.title AS title',
          'lr.description AS description',
          'lr.status AS status',
          'lr.isRead AS isRead',
          'lr.submittedDate AS submittedDate',
          'lr.duration AS duration',
          'lr.createdAt AS createdAt',
          'lr.requestModifiedFrom AS requestModifiedFrom',
          'lr.firstHalf AS firstHalf',
          'lr.secondHalf AS secondHalf',
          'lr.isHalfDay AS isHalfDay',
          'ed.department AS department',
          'ed.fullName AS fullName'
        ]);

      // 1. Employee Filter
      if (employeeId) {
        query.andWhere('lr.employeeId = :employeeId', { employeeId });
      }

      // 2. Manager Filter (from Upstream)
      if (managerName || managerId) {
        const { ManagerMapping } = require('../../managerMapping/entities/managerMapping.entity');
        query.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = lr.employeeId');
        query.andWhere(
          '(lr.employeeId = :exactManagerId OR (mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery))',
          {
            exactManagerId: managerId,
            managerNameQuery: `%${managerName}%`,
            managerIdQuery: `%${managerId}%`
          }
        );
        query.andWhere('(mm.status = :mmStatus OR lr.employeeId = :exactManagerId)', {
          mmStatus: ManagerMappingStatus.ACTIVE,
          exactManagerId: managerId
        });
      }

      // 3. Department Filter
      if (department && department !== 'All') {
        query.andWhere('ed.department = :department', { department });
      }

      // 4. Status Filter
      if (status && status !== 'All') {
        query.andWhere('lr.status = :status', { status });
      }

      // 5. Search Filter
      if (search && search.trim() !== '') {
        query.andWhere(new Brackets(qb => {
          const searchPattern = `%${search.toLowerCase()}%`;
          qb.where('LOWER(ed.fullName) LIKE :searchPattern', { searchPattern })
            .orWhere('LOWER(lr.employeeId) LIKE :searchPattern', { searchPattern })
            .orWhere('LOWER(lr.title) LIKE :searchPattern', { searchPattern });
        }));
      }

      // 6. Date Boundaries Filter
      if (year !== 'All' || month !== 'All') {
        if (year !== 'All' && month !== 'All') {
          const monthInt = parseInt(month);
          const yearInt = parseInt(year);
          const monthStart = `${year}-${month.padStart(2, '0')}-01`;
          const lastDay = new Date(yearInt, monthInt, 0).getDate();
          const monthEnd = `${year}-${month.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

          query.andWhere('lr.fromDate <= :monthEnd', { monthEnd })
            .andWhere('lr.toDate >= :monthStart', { monthStart });
        } else if (year !== 'All' && month === 'All') {
          const yearStart = `${year}-01-01`;
          const yearEnd = `${year}-12-31`;
          query.andWhere('lr.fromDate <= :yearEnd', { yearEnd })
            .andWhere('lr.toDate >= :yearStart', { yearStart });
        } else if (year === 'All' && month !== 'All') {
          const m = parseInt(month);
          query.andWhere(new Brackets(qb => {
            qb.where('MONTH(lr.fromDate) = :m', { m })
              .orWhere('MONTH(lr.toDate) = :m', { m });
          }));
        }
      }

      const total = await query.getCount();

      const data = await query
        .addSelect(`CASE 
          WHEN lr.status = '${LeaveRequestStatus.PENDING}' THEN 1 
          WHEN lr.status = '${LeaveRequestStatus.REQUESTING_FOR_MODIFICATION}' THEN 2
          WHEN lr.status = '${LeaveRequestStatus.REQUESTING_FOR_CANCELLATION}' THEN 2
          WHEN lr.status = '${LeaveRequestStatus.APPROVED}' THEN 3
          WHEN lr.status = '${LeaveRequestStatus.CANCELLATION_APPROVED}' THEN 4
          WHEN lr.status = '${LeaveRequestStatus.CANCELLATION_REJECTED}' THEN 5
          WHEN lr.status = '${LeaveRequestStatus.MODIFICATION_APPROVED}' THEN 4
          WHEN lr.status = '${LeaveRequestStatus.MODIFICATION_CANCELLED}' THEN 5
          WHEN lr.status = '${LeaveRequestStatus.CANCELLATION_REVERTED}' THEN 5
          WHEN lr.status = '${LeaveRequestStatus.REQUEST_MODIFIED}' THEN 6
          WHEN lr.status = '${LeaveRequestStatus.REJECTED}' THEN 6
          WHEN lr.status = '${LeaveRequestStatus.CANCELLED}' THEN 7
          ELSE 8 
        END`, 'priority')
        .orderBy('priority', 'ASC')
        .addOrderBy('lr.id', 'DESC')
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany();

      this.logger.log(`[FETCH] Retrieved ${data.length} requests out of ${total} total`);
      return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`[FETCH] Unified fetch failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to fetch requests: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll(department?: string, status?: string, search?: string, page: number = 1, limit: number = 10, managerName?: string, managerId?: string) {
    this.logger.log(`[FETCH] findAll: Dept=${department}, Status=${status}, Page=${page}`);
    try {
      return await this.findUnifiedRequests({ department, status, search, page, limit, managerName, managerId });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to fetch all requests: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findByEmployeeId(employeeId: string, status?: string, page: number = 1, limit: number = 10) {
    this.logger.log(`[FETCH] findByEmployeeId: ID=${employeeId}, Status=${status}`);
    try {
      return await this.findUnifiedRequests({ employeeId, status, page, limit });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to fetch employee requests: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findOne(id: number) {
    this.logger.log(`[FETCH] findOne: ID=${id}`);
    try {
      const result = await this.leaveRequestRepository.createQueryBuilder('lr')
        .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = lr.employeeId')
        .where('lr.id = :id', { id })
        .select([
          'lr.id AS id',
          'lr.employeeId AS employeeId',
          'lr.requestType AS requestType',
          'lr.fromDate AS fromDate',
          'lr.toDate AS toDate',
          'lr.title AS title',
          'lr.description AS description',
          'lr.status AS status',
          'lr.isRead AS isRead',
          'lr.submittedDate AS submittedDate',
          'lr.duration AS duration',
          'lr.createdAt AS createdAt',
          'lr.requestModifiedFrom AS requestModifiedFrom',
          'lr.firstHalf AS firstHalf',
          'lr.secondHalf AS secondHalf',
          'lr.isHalfDay AS isHalfDay',
          'ed.department AS department',
          'ed.fullName AS fullName'
        ])
        .getRawOne();

      if (!result) {
        this.logger.warn(`[FETCH] Request with ID ${id} not found`);
        throw new NotFoundException(`Leave request with ID ${id} not found`);
      }

      return result;
    } catch (error) {
      this.logger.error(`[FETCH] findOne failed for ID ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to fetch request: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findUnread(managerName?: string) {
    this.logger.log(`[FETCH] findUnread: Manager=${managerName || 'All'}`);
    try {
      const qb = this.leaveRequestRepository.createQueryBuilder('lr')
        .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = lr.employeeId')
        .where('lr.isRead = :isRead', { isRead: false })
        .select([
          'lr.id AS id',
          'lr.employeeId AS employeeId',
          'lr.requestType AS requestType',
          'lr.fromDate AS fromDate',
          'lr.toDate AS toDate',
          'lr.title AS title',
          'lr.status AS status',
          'lr.createdAt AS createdAt',
          'lr.requestModifiedFrom AS requestModifiedFrom',
          'ed.fullName AS employeeName'
        ])
        .addSelect(`CASE 
          WHEN lr.status = '${LeaveRequestStatus.PENDING}' THEN 1 
          WHEN lr.status = '${LeaveRequestStatus.REQUESTING_FOR_CANCELLATION}' THEN 2
          WHEN lr.status = '${LeaveRequestStatus.APPROVED}' THEN 3
          WHEN lr.status = '${LeaveRequestStatus.CANCELLATION_APPROVED}' THEN 4
          WHEN lr.status = '${LeaveRequestStatus.REQUEST_MODIFIED}' THEN 5
          WHEN lr.status = '${LeaveRequestStatus.REJECTED}' THEN 5
          WHEN lr.status = '${LeaveRequestStatus.CANCELLED}' THEN 6
          ELSE 7 
        END`, 'priority');

      if (managerName) {
        qb.innerJoin(ManagerMapping, 'mm', 'mm.employeeId = lr.employeeId AND mm.status = :mStatus', { mStatus: ManagerMappingStatus.ACTIVE })
          .andWhere('mm.managerName = :managerName', { managerName });
      }

      const requests = await qb.orderBy('priority', 'ASC')
        .addOrderBy('lr.id', 'DESC')
        .getRawMany();

      this.logger.log(`[FETCH] Retrieved ${requests.length} unread requests`);
      return requests;
    } catch (error) {
      this.logger.error(`[FETCH] findUnread failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to fetch unread requests: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async markAsRead(id: number) {
    this.logger.log(`[UPDATE] markAsRead: ID=${id}`);
    try {
      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        this.logger.warn(`[UPDATE] markAsRead failed: Request ${id} not found`);
        throw new NotFoundException('Leave request not found');
      }
      request.isRead = true;
      const saved = await this.leaveRequestRepository.save(request);
      this.logger.log(`[UPDATE] Successfully marked request ${id} as read`);
      return saved;
    } catch (error) {
      this.logger.error(`[UPDATE] markAsRead failed for ID ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to mark request as read: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // --- Partial Cancellation Logic ---

  async getCancellableDates(id: number, employeeId: string, user?: any) {
    this.logger.log(`[CANCEL] getCancellableDates: ID=${id}, Employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request) {
        this.logger.warn(`[CANCEL] Request ${id} not found for employee ${employeeId}`);
        throw new NotFoundException('Request not found');
      }
      if (request.status !== LeaveRequestStatus.APPROVED) {
        this.logger.warn(`[CANCEL] Request ${id} is not in APPROVED status. Current status: ${request.status}`);
        throw new ForbiddenException('Only approved requests can be checked for cancellation');
      }

      const startDate = dayjs(request.fromDate);
      const endDate = dayjs(request.toDate);
      const diffDays = endDate.diff(startDate, 'day');

      const results: { date: string; isCancellable: boolean; reason: string }[] = [];
      const now = dayjs();

      const roleUpper = (user?.role || '').toUpperCase();
      const isPrivileged = user && (user.userType === UserType.ADMIN || user.userType === UserType.MANAGER || roleUpper.includes(UserType.ADMIN) || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER));

      const existingCancellations = await this.leaveRequestRepository.find({
        where: {
          employeeId,
          requestType: request.requestType,
          status: In([
            LeaveRequestStatus.REQUESTING_FOR_CANCELLATION,
            LeaveRequestStatus.CANCELLATION_APPROVED,
            LeaveRequestStatus.REQUESTING_FOR_MODIFICATION,
            LeaveRequestStatus.MODIFICATION_APPROVED,
          ]),
        },
      });

      for (let i = 0; i <= diffDays; i++) {
        const currentDate = startDate.add(i, 'day');

        const isWknd = await this._isWeekend(currentDate, employeeId);
        if (isWknd) continue;

        const isHol = await this._isHoliday(currentDate);
        if (isHol) continue;

        const currentStr = currentDate.format('YYYY-MM-DD');
        const isAlreadyCancelled = existingCancellations.some((c) => {
          const cStart = dayjs(c.fromDate);
          const cEnd = dayjs(c.toDate);
          return (currentDate.isSame(cStart, 'day') || currentDate.isAfter(cStart, 'day')) &&
            (currentDate.isSame(cEnd, 'day') || currentDate.isBefore(cEnd, 'day'));
        });

        if (isAlreadyCancelled) continue;

        const deadline = currentDate.hour(18).minute(30).second(0);
        const isCancellable = isPrivileged || now.isBefore(deadline);

        results.push({
          date: currentDate.format('YYYY-MM-DD'),
          isCancellable,
          reason: isCancellable
            ? (isPrivileged ? 'Admin/Manager Bypass' : `Deadline: ${deadline.format('DD-MMM HH:mm')}`)
            : `Deadline passed (${deadline.format('DD-MMM HH:mm')})`,
        });
      }
      this.logger.log(`[CANCEL] Found ${results.length} cancellable dates for request ${id}`);
      return results;
    } catch (error) {
      this.logger.error(`[CANCEL] getCancellableDates failed for ID ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to get cancellable dates: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async cancelApprovedDates(
    id: number,
    employeeId: string,
    datesToCancel: string[],
    user?: any
  ) {
    this.logger.log(`[CANCEL] cancelApprovedDates: ID=${id}, DatesCount=${datesToCancel ? datesToCancel.length : 0}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request) {
        this.logger.warn(`[CANCEL] Request ${id} not found for employee ${employeeId}`);
        throw new NotFoundException('Request not found');
      }
      if (request.status !== LeaveRequestStatus.APPROVED) {
        this.logger.warn(`[CANCEL] Request ${id} must be APPROVED to cancel dates`);
        throw new ForbiddenException('Request must be approved');
      }

      if (!datesToCancel || datesToCancel.length === 0) {
        throw new BadRequestException('No dates provided for cancellation');
      }

      const roleUpper = (user?.role || '').toUpperCase();
      const isPrivileged = user && (user.userType === UserType.ADMIN || user.userType === UserType.MANAGER || roleUpper.includes(UserType.ADMIN) || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER));

      if (!isPrivileged) {
        const now = dayjs();
        for (const dateStr of datesToCancel) {
          const targetDate = dayjs(dateStr);
          const deadline = targetDate.hour(18).minute(30).second(0);
          if (now.isAfter(deadline)) {
            this.logger.warn(`[CANCEL] Deadline passed for date ${dateStr}. Current time: ${now.format()}`);
            throw new ForbiddenException(
              `Cancellation deadline passed for ${dateStr}. Cutoff was ${deadline.format('YYYY-MM-DD HH:mm')}`,
            );
          }
        }
      }

      const sortedDates = datesToCancel.sort();
      const ranges: { start: string; end: string; count: number }[] = [];

      let currentStart = sortedDates[0];
      let currentEnd = sortedDates[0];
      let count = 1;

      for (let i = 1; i < sortedDates.length; i++) {
        const date = sortedDates[i];
        const prevDate = sortedDates[i - 1];
        const diff = dayjs(date).diff(dayjs(prevDate), 'day');
        let isConsecutive = diff === 1;

        if (!isConsecutive && diff > 1) {
          let temp = dayjs(prevDate).add(1, 'day');
          let hasWorkDayGap = false;
          while (temp.isBefore(dayjs(date))) {
            const isWknd = await this._isWeekend(temp, employeeId);
            if (!isWknd) {
              hasWorkDayGap = true;
              break;
            }
            temp = temp.add(1, 'day');
          }
          if (!hasWorkDayGap) isConsecutive = true;
        }

        if (isConsecutive) {
          currentEnd = date;
          count++;
        } else {
          ranges.push({ start: currentStart, end: currentEnd, count });
          currentStart = date;
          currentEnd = date;
          count = 1;
        }
      }
      ranges.push({ start: currentStart, end: currentEnd, count });

      const createdRequests: LeaveRequest[] = [];

      for (const range of ranges) {
        const newRequest = this.leaveRequestRepository.create({
          ...(request as any),
          id: undefined,
          fromDate: range.start,
          toDate: range.end,
          status: LeaveRequestStatus.REQUESTING_FOR_CANCELLATION,
          isRead: false,
          isReadEmployee: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          duration: range.count,
        }) as unknown as LeaveRequest;

        const savedNew = await this.leaveRequestRepository.save(newRequest);
        await this.copyRequestDocuments(request.id, savedNew.id);

        createdRequests.push(savedNew);

        await this.notifyAdminOfCancellationRequest(savedNew, employeeId, range.count).catch(e => this.logger.error(`[CANCEL] notifyAdmin failed: ${e.message}`));
        await this.notifyManagerOfRequest(savedNew).catch(e => this.logger.error(`[CANCEL] notifyManager failed: ${e.message}`));
        await this.notifyEmployeeOfSubmission(savedNew).catch(e => this.logger.error(`[CANCEL] notifyEmployee failed: ${e.message}`));

        try {
          const mapping = await this.managerMappingRepository.findOne({ where: { employeeId, status: ManagerMappingStatus.ACTIVE } });
          if (mapping) {
            const manager = await this.userRepository.findOne({ where: { aliasLoginName: mapping.managerName } });
            if (manager && manager.loginId) {
              await this.notificationsService.createNotification({
                employeeId: manager.loginId,
                title: 'Cancellation Request',
                message: `${employeeId} requested to Cancel an approved Leave.`,
                type: 'alert'
              });
            }
          }
        } catch (e) {
          this.logger.error(`[CANCEL] App notification failed: ${e.message}`);
        }
      }

      this._recalcMonthStatus(employeeId, request.fromDate.toString()).catch(() => { });

      this.logger.log(`[CANCEL] Successfully created ${createdRequests.length} cancellation segments for request ${id}`);
      return createdRequests.length === 1 ? createdRequests[0] : createdRequests;
    } catch (error) {
      this.logger.error(`[CANCEL] cancelApprovedDates failed for ID ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to process cancellation: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async notifyAdminOfCancellationRequest(request: LeaveRequest, employeeId: string, totalDays?: number) {
    this.logger.log(`[NOTIFY] notifyAdminOfCancellationRequest: RequestID=${request.id}, Employee=${employeeId}`);
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
      });

      if (employee) {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
        if (adminEmail) {
          const requestTypeLabel = request.requestType === LeaveRequestType.APPLY_LEAVE ? AttendanceStatus.LEAVE : request.requestType;
          const subject = `Cancellation Request: ${requestTypeLabel} - ${employee.fullName}`;

          const displayDuration = totalDays || request.duration || 0;

          const htmlContent = getCancellationTemplate({
            employeeName: employee.fullName,
            employeeId: employee.employeeId,
            requestType: requestTypeLabel,
            title: request.title || 'No Title',
            fromDate: request.fromDate.toString(),
            toDate: request.toDate.toString(),
            duration: displayDuration,
            reason: request.description
          });

          await this.emailService.sendEmail(
            adminEmail,
            subject,
            `Cancellation requested by ${employee.fullName}`,
            htmlContent,
            employee.email
          );
          this.logger.log(`[NOTIFY] Cancellation notification sent to Admin (${adminEmail}) for ${employee.fullName}`);
        }
      }
    } catch (error) {
      this.logger.error(`[NOTIFY] notifyAdminOfCancellationRequest failed: ${error.message}`, error.stack);
    }
  }

  private async copyRequestDocuments(sourceRefId: number, targetRefId: number) {
    this.logger.log(`[DOCS] copyRequestDocuments: Source=${sourceRefId}, Target=${targetRefId}`);
    try {
      const originalDocs = await this.documentRepo.find({
        where: {
          refId: sourceRefId,
          entityType: EntityType.LEAVE_REQUEST
        },
      });

      if (originalDocs && originalDocs.length > 0) {
        const clonedDocs = originalDocs.map((doc) => {
          const { id, ...docData } = doc;
          return this.documentRepo.create({
            ...docData,
            refId: targetRefId,
            s3Key: doc.s3Key || doc.id.toString(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });

        await this.documentRepo.save(clonedDocs);
        this.logger.log(`[DOCS] Copied ${clonedDocs.length} documents from request ${sourceRefId} to ${targetRefId}`);
      }
    } catch (error) {
      this.logger.error(`[DOCS] copyRequestDocuments failed: ${error.message}`, error.stack);
    }
  }

  async undoCancellationRequest(id: number, employeeId: string) {
    this.logger.log(`[UNDO_CANCEL] Starting undo for request ID: ${id}, Employee: ${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });

      if (!request) {
        this.logger.warn(`[UNDO_CANCEL] Request with ID ${id} not found for employee ${employeeId}`);
        throw new NotFoundException('Request not found');
      }

      if (request.status !== LeaveRequestStatus.REQUESTING_FOR_CANCELLATION) {
        this.logger.warn(`[UNDO_CANCEL] Invalid request status for undo: ${request.status} (ID: ${id})`);
        throw new ForbiddenException('Only pending cancellation requests can be undone');
      }

      // Time Check: Next Day 10 AM
      const submissionTime = dayjs(request.submittedDate || request.createdAt);
      const deadline = submissionTime.add(1, 'day').hour(10).minute(0).second(0);
      const now = dayjs();

      if (now.isAfter(deadline)) {
        this.logger.warn(`[UNDO_CANCEL] Undo deadline passed at ${deadline.format()}. Current time: ${now.format()}`);
        throw new ForbiddenException(`Undo window closed. Deadline was ${deadline.format('DD-MMM HH:mm')}`);
      }

      // Revert Duration on Master Request
      const masterRequest = await this.leaveRequestRepository.findOne({
        where: {
          employeeId: request.employeeId,
          requestType: request.requestType,
          status: LeaveRequestStatus.APPROVED,
          fromDate: LessThanOrEqual(request.fromDate),
          toDate: MoreThanOrEqual(request.toDate),
        },
      });

      if (masterRequest) {
        const currentDuration = Number(masterRequest.duration || 0);
        const restoreDuration = Number(request.duration || 0);
        masterRequest.duration = currentDuration + restoreDuration;
        await this.leaveRequestRepository.save(masterRequest);
        this.logger.log(`[UNDO_CANCEL] Restored ${restoreDuration} days to master request ${masterRequest.id}`);
      }

      request.status = LeaveRequestStatus.CANCELLATION_REVERTED;
      const saved = await this.leaveRequestRepository.save(request);
      this.logger.log(`[UNDO_CANCEL] Successfully reverted cancellation request ID: ${id}`);

      // --- Email Notifications ---
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;

        if (employee) {
          // 1. Admin Email
          if (adminEmail) {
            const adminSubject = `Cancellation Reverted: ${request.requestType} - ${employee.fullName}`;
            const adminHtml = getCancellationTemplate({
              employeeName: employee.fullName,
              employeeId: employee.employeeId,
              requestType: request.requestType,
              title: request.title,
              fromDate: request.fromDate.toString(),
              toDate: request.toDate.toString(),
              duration: request.duration,
              actionType: 'revert',
            });
            await this.emailService.sendEmail(adminEmail, adminSubject, 'Cancellation Reverted', adminHtml);
            this.logger.log(`[UNDO_CANCEL] Revert notification sent to Admin (${adminEmail})`);
          }

          // 2. Manager Email
          const mapping = await this.managerMappingRepository.findOne({
            where: { employeeId: request.employeeId, status: ManagerMappingStatus.ACTIVE }
          });

          if (mapping) {
            const manager = await this.userRepository.findOne({
              where: { aliasLoginName: mapping.managerName }
            });

            const managerDetails = await this.employeeDetailsRepository.findOne({
              where: { email: manager?.loginId }
            }) || await this.employeeDetailsRepository.findOne({
              where: { fullName: mapping.managerName }
            });
            const managerEmail = managerDetails?.email || manager?.loginId;

            if (managerEmail && managerEmail.includes('@')) {
              const managerSubject = `Cancellation Reverted: ${request.requestType} - ${employee.fullName}`;
              const managerHtml = getCancellationTemplate({
                employeeName: employee.fullName,
                employeeId: employee.employeeId,
                requestType: request.requestType,
                title: request.title,
                fromDate: request.fromDate.toString(),
                toDate: request.toDate.toString(),
                duration: request.duration,
                actionType: 'revert',
              });
              await this.emailService.sendEmail(managerEmail, managerSubject, 'Cancellation Reverted', managerHtml);
              this.logger.log(`[UNDO_CANCEL] Revert notification sent to Manager (${managerEmail})`);
            }
          }

          // 3. Employee Email
          if (employee.email) {
            const empSubject = `Cancellation Reverted: ${request.requestType} - ${request.title}`;
            const empHtml = getStatusUpdateTemplate({
              employeeName: employee.fullName,
              requestType: request.requestType,
              title: request.title,
              fromDate: request.fromDate.toString(),
              toDate: request.toDate.toString(),
              duration: request.duration,
              status: 'Reverted',
              isCancellation: true,
              reviewedBy: ''
            });
            await this.emailService.sendEmail(employee.email, empSubject, 'Your cancellation request has been reverted.', empHtml);
            this.logger.log(`[UNDO_CANCEL] Revert confirmation sent to Employee (${employee.email})`);
          }
        }
      } catch (error) {
        this.logger.error(`[UNDO_CANCEL] Notification failure: ${error.message}`);
      }

      this._recalcMonthStatus(request.employeeId, request.fromDate.toString()).catch(() => { });

      return saved;
    } catch (error) {
      this.logger.error(`[UNDO_CANCEL] Failed for request ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to undo cancellation: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async markAllAsRead(managerName?: string) {
    this.logger.log(`[UPDATE] markAllAsRead: ManagerName=${managerName}`);
    try {
      if (managerName) {
        const subquery = this.managerMappingRepository.createQueryBuilder('mm')
          .select('mm.employeeId')
          .where('mm.managerName = :managerName', { managerName })
          .andWhere('mm.status = :mStatus', { mStatus: ManagerMappingStatus.ACTIVE });

        return await this.leaveRequestRepository.createQueryBuilder()
          .update()
          .set({ isRead: true })
          .where('isRead = :isRead', { isRead: false })
          .andWhere('employeeId IN (' + subquery.getQuery() + ')')
          .setParameters(subquery.getParameters())
          .execute();
      }
      return await this.leaveRequestRepository.update({ isRead: false }, { isRead: true });
    } catch (error) {
      this.logger.error(`[UPDATE] markAllAsRead failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to mark all as read: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async remove(id: number) {
    this.logger.log(`[DELETE] remove: ID=${id}`);
    try {
      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        this.logger.warn(`[DELETE] Request ${id} not found`);
        throw new NotFoundException('Leave request not found');
      }
      if (request.status !== LeaveRequestStatus.PENDING) {
        this.logger.warn(`[DELETE] Request ${id} is not PENDING. Status: ${request.status}`);
        throw new ForbiddenException('Only pending leave requests can be deleted');
      }

      // --- Admin Notification Logic (Before Deletion) ---
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });

        if (employee) {
          const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;

          if (adminEmail) {
            const requestTypeLabel =
              request.requestType === LeaveRequestType.APPLY_LEAVE ? AttendanceStatus.LEAVE : request.requestType;
            const subject = `Request Reverted Back: ${requestTypeLabel} Request - ${employee.fullName}`;

            const htmlContent = getCancellationTemplate({
              employeeName: employee.fullName,
              employeeId: employee.employeeId,
              requestType: requestTypeLabel,
              title: request.title || 'No Title',
              fromDate: request.fromDate.toString(),
              toDate: request.toDate.toString(),
              duration: request.duration || 0,
              reason: request.description,
              actionType: 'revert_back'
            });

            await this.emailService.sendEmail(
              adminEmail,
              subject,
              `Request Reverted Back by ${employee.fullName}`,
              htmlContent,
            );
            this.logger.log(`[DELETE] Revert back notification sent to admin: ${adminEmail}`);
          }
        }
      } catch (notifyError) {
        this.logger.error(`[DELETE] Failed to send admin notification for request ${id}: ${notifyError.message}`);
      }

      // Mark as CANCELLED (as per the existing file requirement: "Instead of deleting, mark as Cancelled so Admin gets a notification")
      request.status = LeaveRequestStatus.CANCELLED;
      request.isRead = false;
      const result = await this.leaveRequestRepository.save(request);

      this.logger.log(`[DELETE] Successfully marked request ${id} as CANCELLED`);

      // Trigger month recalculation
      this._recalcMonthStatus(request.employeeId, request.fromDate.toString()).catch(() => { });

      return result;
    } catch (error) {
      this.logger.error(`[DELETE] remove failed for ID ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to remove request: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Leave balance: entitlement (18 full timer / 12 intern), used (approved leave in year), pending, balance */
  /** Leave balance: entitlement (18 full timer / 12 intern), used (approved leave in year), pending, balance */
  async getLeaveBalance(employeeId: string, year: string) {
    this.logger.log(`[STATS] getLeaveBalance: Employee=${employeeId}, Year=${year}`);
    try {
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        throw new BadRequestException('Valid year is required');
      }
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
        select: ['id', 'employeeId', 'designation', 'employmentType', 'joiningDate', 'conversionDate'],
      });
      if (!employee) {
        this.logger.warn(`[STATS] Employee ${employeeId} not found`);
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }

      // Explicit employment type: FULL_TIMER = 18, INTERN = 12. Else infer from designation (contains "intern").
      const isIntern =
        employee.employmentType === EmploymentType.INTERN ||
        (employee.designation || '').toLowerCase().includes(EmploymentType.INTERN.toLowerCase());

      // Prorate entitlement for the year based on status and conversion date
      const joinDate = dayjs(employee.joiningDate);
      const joinMonth = joinDate.isValid() ? joinDate.month() + 1 : 1;
      const joinYear = joinDate.isValid() ? joinDate.year() : yearNum;

      const convDate = (employee as any).conversionDate ? dayjs((employee as any).conversionDate) : null;

      let entitlement = 0;

      if (yearNum < joinYear) {
        entitlement = 0;
      } else {
        for (let m = 1; m <= 12; m++) {
          if (yearNum === joinYear && m < joinMonth) continue;

          let monthlyAccrual = isIntern ? 1.0 : 1.5;

          if (convDate && convDate.isValid()) {
            const cMonth = convDate.month() + 1;
            const cYear = convDate.year();

            if (yearNum > cYear || (yearNum === cYear && m >= cMonth)) {
              monthlyAccrual = 1.5;
              if (yearNum === cYear && m === cMonth && convDate.date() > 10) {
                monthlyAccrual = 1.0;
              }
            } else {
              monthlyAccrual = 1.0;
            }
          }

          if (yearNum === joinYear && m === joinMonth && joinDate.date() > 10) {
            monthlyAccrual = 0;
          }

          entitlement += monthlyAccrual;
        }
      }

      const leaveTypes = [LeaveRequestType.APPLY_LEAVE, LeaveRequestType.LEAVE];

      const usedResult = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .select('SUM(lr.duration)', 'total')
        .where('lr.employeeId = :employeeId', { employeeId })
        .andWhere(new Brackets(qb => {
          qb.where('lr.requestType IN (:...leaveTypes)', { leaveTypes })
            .orWhere('lr.firstHalf = :leave', { leave: AttendanceStatus.LEAVE })
            .orWhere('lr.secondHalf = :leave', { leave: AttendanceStatus.LEAVE });
        }))
        .andWhere('lr.status = :status', { status: LeaveRequestStatus.APPROVED })
        .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
        .andWhere('lr.toDate >= :yearStart', { yearStart })
        .getRawOne();

      const used = parseFloat(usedResult?.total || '0');

      const pendingResult = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .select('SUM(lr.duration)', 'total')
        .where('lr.employeeId = :employeeId', { employeeId })
        .andWhere(new Brackets(qb => {
          qb.where('lr.requestType IN (:...leaveTypes)', { leaveTypes })
            .orWhere('lr.firstHalf = :leave', { leave: AttendanceStatus.LEAVE })
            .orWhere('lr.secondHalf = :leave', { leave: AttendanceStatus.LEAVE });
        }))
        .andWhere('lr.status = :status', { status: LeaveRequestStatus.PENDING })
        .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
        .andWhere('lr.toDate >= :yearStart', { yearStart })
        .getRawOne();

      const pending = parseFloat(pendingResult?.total || '0');
      const balance = Math.max(0, entitlement - used);

      this.logger.log(`[STATS] getLeaveBalance completed for ${employeeId}: Entitlement=${entitlement}, Used=${used}, Balance=${balance}`);
      return { employeeId, year: yearNum, entitlement, used, pending, balance };
    } catch (error) {
      this.logger.error(`[STATS] getLeaveBalance failed for ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to fetch leave balance: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getStats(employeeId: string, month: string = 'All', year: string = 'All') {
    this.logger.log(`[STATS] getStats: Employee=${employeeId}, Month=${month}, Year=${year}`);
    try {
      const requests = await this.leaveRequestRepository.find({
        where: { employeeId },
      });

      const filteredRequests = requests.filter((req: any) => {
        const dateToUse = req.submittedDate || req.createdAt;
        if (!dateToUse) return false;

        let reqDateStr = '';
        if (dateToUse instanceof Date) {
          const y = dateToUse.getFullYear();
          const m = dateToUse.getMonth() + 1;
          reqDateStr = `${y}-${m < 10 ? '0' + m : m}`;
        } else {
          reqDateStr = String(dateToUse).substring(0, 10);
        }

        const [reqYear, reqMonth] = reqDateStr.split('-');
        if (year !== 'All' && reqYear !== year) return false;
        if (month !== 'All' && parseInt(reqMonth) !== parseInt(month)) return false;
        return true;
      });

      const stats = {
        leave: { applied: 0, approved: 0, rejected: 0, cancelled: 0 },
        wfh: { applied: 0, approved: 0, rejected: 0, cancelled: 0 },
        clientVisit: { applied: 0, approved: 0, rejected: 0, cancelled: 0 },
        halfDay: { applied: 0, approved: 0, rejected: 0, cancelled: 0 },
      };

      filteredRequests.forEach((req) => {
        const status = req.status;
        if (
          status === LeaveRequestStatus.REQUEST_MODIFIED ||
          status === LeaveRequestStatus.CANCELLED ||
          status === LeaveRequestStatus.CANCELLATION_REVERTED
        ) {
          return;
        }

        const target =
          req.requestType === LeaveRequestType.APPLY_LEAVE
            ? stats.leave
            : req.requestType === LeaveRequestType.WORK_FROM_HOME
              ? stats.wfh
              : req.requestType === LeaveRequestType.CLIENT_VISIT
                ? stats.clientVisit
                : req.requestType === LeaveRequestType.HALF_DAY
                  ? stats.halfDay
                  : null;

        if (!target) return;

        if (status !== LeaveRequestStatus.CANCELLATION_APPROVED && status !== LeaveRequestStatus.REQUESTING_FOR_CANCELLATION) {
          target.applied++;
        }

        if (status === LeaveRequestStatus.APPROVED || status === LeaveRequestStatus.REQUESTING_FOR_CANCELLATION) {
          target.approved++;
        } else if (status === LeaveRequestStatus.REJECTED) {
          target.rejected++;
        } else if (status === LeaveRequestStatus.CANCELLATION_APPROVED) {
          target.cancelled++;
        }
      });

      this.logger.log(`[STATS] getStats completed for ${employeeId}`);
      return stats;
    } catch (error) {
      this.logger.error(`[STATS] getStats failed for ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to fetch stats: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateStatus(id: number, status: LeaveRequestStatus, employeeId?: string, reviewedBy?: string, reviewerEmail?: string) {
    this.logger.log(`[UPDATE_STATUS] id=${id}, status=${status}, reviewedBy=${reviewedBy}`);
    try {
      if (reviewerEmail && !reviewerEmail.includes('@')) {
        const reviewerEmp = await this.employeeDetailsRepository.findOne({ where: { employeeId: reviewerEmail } });
        if (reviewerEmp?.email) reviewerEmail = reviewerEmp.email;
      }
      if (!reviewerEmail || !reviewerEmail.includes('@')) {
        if (reviewedBy) {
          const mgr = await this.employeeDetailsRepository.findOne({ where: { fullName: reviewedBy } });
          if (mgr?.email) reviewerEmail = mgr.email;
        }
        if ((!reviewerEmail || !reviewerEmail.includes('@')) && (reviewedBy === UserType.ADMIN)) {
          reviewerEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
        }
      }

      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        this.logger.warn(`[UPDATE_STATUS] Request ${id} not found`);
        throw new NotFoundException('Leave request not found');
      }

      const previousStatus = request.status;
      request.status = status;
      if (reviewedBy) request.reviewedBy = reviewedBy;
      request.isRead = true;
      request.isReadEmployee = false;

      const savedRequest = await this.leaveRequestRepository.save(request);
      const attendanceUpdates: any[] = [];
      const reqType = request.requestType ? request.requestType.trim().toLowerCase() : '';

      if (status === LeaveRequestStatus.APPROVED || status === LeaveRequestStatus.MODIFICATION_APPROVED) {
        try {
          this.logger.log(`[UPDATE_STATUS] Processing Approval Automation for Request ID: ${id} (${reqType})`);
          const startDate = dayjs(request.fromDate);
          const endDate = dayjs(request.toDate);
          const diff = endDate.diff(startDate, 'day');

          for (let i = 0; i <= diff; i++) {
            const targetDate = startDate.add(i, 'day');
            const isWknd = await this._isWeekend(targetDate, request.employeeId);
            if (isWknd) continue;

            const startOfDay = targetDate.startOf('day').toDate();
            const endOfDay = targetDate.endOf('day').toDate();

            let attendance = await this.employeeAttendanceRepository.findOne({
              where: { employeeId: request.employeeId, workingDate: Between(startOfDay, endOfDay) }
            });

            const firstHalf = request.firstHalf || WorkLocation.OFFICE;
            const secondHalf = request.secondHalf || WorkLocation.OFFICE;
            const calculatedHours = this.calculateTotalHours(firstHalf, secondHalf);

            let derivedStatus = AttendanceStatus.FULL_DAY;
            if (calculatedHours === 9) {
              derivedStatus = AttendanceStatus.FULL_DAY;
            } else if (calculatedHours === 6) {
              derivedStatus = AttendanceStatus.HALF_DAY;
            } else if (calculatedHours === 0) {
              derivedStatus = AttendanceStatus.LEAVE;
            }

            if (!attendance) {
              attendance = this.employeeAttendanceRepository.create({
                employeeId: request.employeeId,
                workingDate: startOfDay,
                totalHours: calculatedHours,
                status: derivedStatus,
                firstHalf: firstHalf,
                secondHalf: secondHalf,
                sourceRequestId: request.id,
                workLocation: null,
              });
              await this.employeeAttendanceRepository.save(attendance);
              this.logger.log(`[UPDATE_STATUS] Created attendance record for ${targetDate.format('YYYY-MM-DD')}`);
            } else {
              await this.employeeAttendanceRepository.createQueryBuilder()
                .update(EmployeeAttendance)
                .set({
                  totalHours: calculatedHours,
                  status: derivedStatus,
                  firstHalf: firstHalf,
                  secondHalf: secondHalf,
                  sourceRequestId: request.id,
                  workLocation: null,
                })
                .where("id = :id", { id: attendance.id })
                .execute();
              this.logger.log(`[UPDATE_STATUS] Updated attendance record ${attendance.id}`);
            }

            attendanceUpdates.push({
              id: attendance.id,
              workingDate: targetDate.format('YYYY-MM-DD'),
              status: derivedStatus,
              totalHours: calculatedHours
            });
          }
        } catch (e) {
          this.logger.error(`[UPDATE_STATUS] Error in approval automation: ${e.message}`, e.stack);
        }
      }

      if (status === LeaveRequestStatus.REJECTED || status === LeaveRequestStatus.CANCELLED) {
        try {
          this.logger.log(`[UPDATE_STATUS] Processing Cleanup for request ${id}`);
          const query = this.employeeAttendanceRepository.createQueryBuilder().update(EmployeeAttendance);
          query.set({ sourceRequestId: () => 'NULL' });
          query.where(new Brackets(qb => {
            qb.where("sourceRequestId = :requestId", { requestId: id });
            if (request.requestModifiedFrom && !isNaN(Number(request.requestModifiedFrom))) {
              qb.orWhere("sourceRequestId = :parentId", { parentId: Number(request.requestModifiedFrom) });
            }
            if (status === LeaveRequestStatus.CANCELLED) {
              qb.orWhere(new Brackets(innerQb => {
                innerQb.where("employeeId = :employeeId", { employeeId: request.employeeId })
                  .andWhere("workingDate BETWEEN :startDate AND :endDate", {
                    startDate: dayjs(request.fromDate).format('YYYY-MM-DD'),
                    endDate: dayjs(request.toDate).format('YYYY-MM-DD')
                  });
              }));
            }
          }));

          const result = await query.execute();
          this.logger.log(`[UPDATE_STATUS] Unlocked ${result.affected ?? 0} records for request ${id}`);
          if (result.affected && result.affected > 0) {
            attendanceUpdates.push({ action: 'UNLOCKED', affectedCount: result.affected });
          }
        } catch (err) {
          this.logger.error(`[UPDATE_STATUS] Failed to unlock attendance for request ${id}: ${err.message}`);
        }
      }

      // Notifications
      try {
        const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId: request.employeeId } });
        if (employee) {
          if (status === LeaveRequestStatus.CANCELLED && previousStatus === LeaveRequestStatus.PENDING) {
            const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
            if (adminEmail) {
              const requestTypeLabel = request.requestType === LeaveRequestType.APPLY_LEAVE ? AttendanceStatus.LEAVE : request.requestType;
              const adminHtml = getCancellationTemplate({
                employeeName: employee.fullName,
                employeeId: employee.employeeId,
                requestType: requestTypeLabel,
                title: request.title || 'No Title',
                fromDate: request.fromDate.toString(),
                toDate: request.toDate.toString(),
                duration: request.duration || 0,
                reason: request.description,
                actionType: 'revert_back',
              });
              await this.emailService.sendEmail(adminEmail, `Request Cancelled: ${requestTypeLabel} - ${employee.fullName}`, `Request Cancelled by ${employee.fullName}`, adminHtml);
            }
          }

          if (employee.email) {
            const isCancellation = status === LeaveRequestStatus.CANCELLATION_APPROVED;
            const htmlContent = getStatusUpdateTemplate({
              employeeName: employee.fullName,
              requestType: request.requestType,
              title: request.title,
              fromDate: dayjs(request.fromDate).format('YYYY-MM-DD'),
              toDate: dayjs(request.toDate).format('YYYY-MM-DD'),
              duration: request.duration || 0,
              status: status as any,
              isCancellation,
              reviewedBy: status === LeaveRequestStatus.CANCELLED && previousStatus === LeaveRequestStatus.PENDING ? '' : request.reviewedBy,
              firstHalf: request.firstHalf,
              secondHalf: request.secondHalf
            });
            await this.emailService.sendEmail(employee.email, `${request.requestType} Request ${status}`, `Your request status: ${status}`, htmlContent);
          }
        }
      } catch (error) {
        this.logger.error(`[UPDATE_STATUS] Notification error: ${error.message}`);
      }

      // Reviewer confirmation
      if (reviewerEmail && reviewerEmail.includes('@')) {
        try {
          const emp = await this.employeeDetailsRepository.findOne({ where: { employeeId: request.employeeId } });
          if (emp) {
            let template, subject;
            if (status === LeaveRequestStatus.APPROVED || status === LeaveRequestStatus.MODIFICATION_APPROVED) {
              template = getApprovalConfirmationTemplate;
              subject = `Confirmation: You approved a request for ${emp.fullName}`;
            } else if (status === LeaveRequestStatus.REJECTED || status === LeaveRequestStatus.MODIFICATION_REJECTED || status === LeaveRequestStatus.MODIFICATION_CANCELLED) {
              template = getRejectionConfirmationTemplate;
              subject = `Confirmation: You rejected a request for ${emp.fullName}`;
            } else if (status === LeaveRequestStatus.CANCELLATION_APPROVED) {
              template = getCancellationApprovalConfirmationTemplate;
              subject = `Confirmation: You cancelled the approved ${request.requestType}`;
            }
            if (template) {
              const html = template({ reviewerName: reviewedBy || 'Reviewer', employeeName: emp.fullName, employeeId: emp.employeeId, requestType: request.requestType, startDate: dayjs(request.fromDate).format('YYYY-MM-DD'), endDate: dayjs(request.toDate).format('YYYY-MM-DD'), duration: request.duration || 0, dates: `${dayjs(request.fromDate).format('YYYY-MM-DD')} to ${dayjs(request.toDate).format('YYYY-MM-DD')}`, firstHalf: request.firstHalf, secondHalf: request.secondHalf });
              await this.emailService.sendEmail(reviewerEmail, subject, 'Request Status Confirmation', html);
            }
          }
        } catch (error) {
          this.logger.error(`[UPDATE_STATUS] Reviewer email failed: ${error.message}`);
        }
      }

      this._recalcMonthStatus(request.employeeId, String(request.fromDate)).catch(() => { });

      this.logger.log(`[UPDATE_STATUS] Successfully updated request ${id} to ${status}`);
      return {
        message: `Request ${status} successfully`,
        status, id,
        employeeId: request.employeeId,
        requestType: request.requestType,
        updatedRequest: { id: savedRequest.id, status: savedRequest.status, reviewedBy: savedRequest.reviewedBy },
        attendanceUpdates
      };
    } catch (error) {
      this.logger.error(`[UPDATE_STATUS] Failed for request ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message || 'Failed to update leave request status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * [NEW] Explicit Attendance Clearance API
   * Wipes attendance data for a cancelled request to make it visible in network logs.
   */
  async clearAttendanceForRequest(id: number) {
    this.logger.log(`[CLEAR_ATTENDANCE] id=${id}`);
    try {
      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        throw new NotFoundException('Leave request not found');
      }

      const query = this.employeeAttendanceRepository
        .createQueryBuilder()
        .update(EmployeeAttendance);

      query.set({
        status: () => 'NULL',
        totalHours: () => 'NULL',
        workLocation: () => 'NULL',
        sourceRequestId: () => 'NULL',
        firstHalf: () => 'NULL',
        secondHalf: () => 'NULL'
      });

      query.where(new Brackets(qb => {
        qb.where("sourceRequestId = :requestId", { requestId: id });
        if (request.requestModifiedFrom && !isNaN(Number(request.requestModifiedFrom))) {
          qb.orWhere("sourceRequestId = :parentId", { parentId: Number(request.requestModifiedFrom) });
        }
        qb.orWhere(new Brackets(innerQb => {
          innerQb.where("employeeId = :employeeId", { employeeId: request.employeeId })
            .andWhere("workingDate BETWEEN :startDate AND :endDate", {
              startDate: dayjs(request.fromDate).format('YYYY-MM-DD'),
              endDate: dayjs(request.toDate).format('YYYY-MM-DD')
            });
        }));
      }));

      const result = await query.execute();
      this.logger.log(`[CLEAR_ATTENDANCE] Result: ${result.affected} records affected.`);
      this._recalcMonthStatus(request.employeeId, request.fromDate.toString()).catch(() => { });

      return {
        success: true,
        affected: result.affected,
        employeeId: request.employeeId,
        clearedFields: ['status', 'totalHours', 'workLocation', 'sourceRequestId', 'firstHalf', 'secondHalf']
      };
    } catch (err) {
      this.logger.error(`[CLEAR_ATTENDANCE] Failed for request ${id}: ${err.message}`, err.stack);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to clear attendance', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async createModification(id: number, data: any) {
    this.logger.log(`[MODIFY] createModification for parent ${id}`);
    try {
      const parent = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!parent) throw new NotFoundException('Original request not found');

      const modification = new LeaveRequest();
      modification.employeeId = parent.employeeId;
      modification.requestType = parent.requestType;
      modification.fromDate = data.fromDate;
      modification.toDate = data.toDate;
      modification.status = data.overrideStatus || 'Request Modified';
      modification.title = parent.title;
      const descPrefix = data.overrideStatus === LeaveRequestStatus.APPROVED ? 'Split Segment' : 'Request Modified';
      modification.description = `${descPrefix}: ${parent.description || ''} (Modification due to ${data.sourceRequestType} conflict)`;
      modification.submittedDate = new Date().toISOString().slice(0, 10);
      modification.isRead = true;
      modification.isReadEmployee = false;
      modification.duration = data.duration || (dayjs(data.toDate).diff(dayjs(data.fromDate), 'day') + 1);
      modification.requestModifiedFrom = data.overrideStatus === LeaveRequestStatus.APPROVED ? parent.requestModifiedFrom : data.sourceRequestType;

      const savedModification = await this.leaveRequestRepository.save(modification);
      await this.copyRequestDocuments(parent.id, savedModification.id);

      if (modification.status === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION) {
        try {
          const mapping = await this.managerMappingRepository.findOne({ where: { employeeId: parent.employeeId, status: ManagerMappingStatus.ACTIVE } });
          if (mapping) {
            const manager = await this.userRepository.findOne({ where: { aliasLoginName: mapping.managerName } });
            if (manager && manager.loginId) {
              await this.notificationsService.createNotification({
                employeeId: manager.loginId,
                title: 'Modification Request',
                message: `${parent.employeeId} requested to Modify an approved Leave.`,
                type: 'alert'
              });
            }
          }
        } catch (e) {
          this.logger.error(`[MODIFY] App notification failed: ${e.message}`);
        }
      }

      this.logger.log(`[MODIFY] Created modification ${savedModification.id}`);
      return savedModification;
    } catch (error) {
      this.logger.error(`[MODIFY] createModification failed for ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to create modification', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // NEW: Dedicated API for Rejecting Cancellation
  async rejectCancellation(id: number, employeeId: string, reviewedBy?: string, reviewerEmail?: string) {
    this.logger.log(`[REJECT_CANCELLATION] id=${id}, employee=${employeeId}, reviewedBy=${reviewedBy}`);
    try {
      if (reviewerEmail && !reviewerEmail.includes('@')) {
        const reviewerEmp = await this.employeeDetailsRepository.findOne({ where: { employeeId: reviewerEmail } });
        if (reviewerEmp?.email) reviewerEmail = reviewerEmp.email;
      }
      if (!reviewerEmail || !reviewerEmail.includes('@')) {
        if (reviewedBy) {
          const mgr = await this.employeeDetailsRepository.findOne({ where: { fullName: reviewedBy } });
          if (mgr?.email) reviewerEmail = mgr.email;
        }
        if ((!reviewerEmail || !reviewerEmail.includes('@')) && (reviewedBy === UserType.ADMIN)) {
          reviewerEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
        }
      }

      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        throw new NotFoundException(`Leave request with ID ${id} not found`);
      }

      const checkStart = dayjs(request.fromDate).format('YYYY-MM-DD');
      const checkEnd = dayjs(request.toDate).format('YYYY-MM-DD');

      const overlapCount = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .where('lr.employeeId = :employeeId', { employeeId: request.employeeId })
        .andWhere('lr.id != :id', { id: request.id })
        .andWhere('lr.status = :status', { status: LeaveRequestStatus.APPROVED })
        .andWhere('DATE(lr.fromDate) <= DATE(:checkEnd)', { checkEnd })
        .andWhere('DATE(lr.toDate) >= DATE(:checkStart)', { checkStart })
        .getCount();

      if (overlapCount > 0) {
        request.status = LeaveRequestStatus.CANCELLATION_REJECTED;
      } else {
        request.status = LeaveRequestStatus.APPROVED;
      }

      request.isReadEmployee = false;
      if (reviewedBy) request.reviewedBy = reviewedBy;
      await this.leaveRequestRepository.save(request);

      try {
        const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId } });
        const employeeName = employee ? employee.fullName : 'Employee';
        const toEmail = employee?.email || (request.employeeId + '@inventechinfo.com');

        const emailBody = getStatusUpdateTemplate({
          employeeName: employeeName,
          requestType: request.requestType,
          title: request.title,
          fromDate: checkStart,
          toDate: checkEnd,
          duration: request.duration || 0,
          status: LeaveRequestStatus.CANCELLATION_REJECTED as any,
          isCancellation: true,
          reviewedBy: request.reviewedBy
        });

        await this.emailService.sendEmail(
          toEmail,
          `${request.requestType} Request ${LeaveRequestStatus.CANCELLATION_REJECTED}`,
          'Your cancellation request was rejected.',
          emailBody,
        );
      } catch (e) {
        this.logger.error(`[REJECT_CANCELLATION] Email failed: ${e.message}`);
      }

      if (reviewerEmail && reviewerEmail.includes('@')) {
        try {
          const emp = await this.employeeDetailsRepository.findOne({ where: { employeeId: request.employeeId } });
          if (emp) {
            const htmlContent = getCancellationRejectionConfirmationTemplate({
              reviewerName: reviewedBy || 'Reviewer',
              employeeName: emp.fullName,
              requestType: request.requestType,
              dates: `${checkStart} to ${checkEnd}`,
              reason: undefined
            });
            await this.emailService.sendEmail(reviewerEmail, `Confirmation: Cancellation Rejected for ${emp.fullName}`, 'Cancellation Rejection Confirmation', htmlContent);
          }
        } catch (error) {
          this.logger.error(`[REJECT_CANCELLATION] Reviewer confirmation failed: ${error.message}`);
        }
      }

      this._recalcMonthStatus(request.employeeId, String(request.fromDate)).catch(() => { });
      this.logger.log(`[REJECT_CANCELLATION] Successfully rejected cancellation for request ${id}`);
      return request;
    } catch (error) {
      this.logger.error(`[REJECT_CANCELLATION] Failed for request ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to reject cancellation', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Helper to revert attendance for the given range (when cancellation is approved)
  private async revertAttendance(employeeId: string, fromDate: string, toDate: string) {
    this.logger.log(`[REVERT_ATTENDANCE] Reverting for ${employeeId} from ${fromDate} to ${toDate}`);
    try {
      const startStr = dayjs(fromDate).format('YYYY-MM-DD');
      const endStr = dayjs(toDate).format('YYYY-MM-DD');

      const records = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(startStr as any, endStr as any),
        },
      });

      for (const record of records) {
        record.status = null;
        record.totalHours = null;
        record.workLocation = null;
        record.sourceRequestId = null;
        await this.employeeAttendanceRepository.save(record);
      }
      this.logger.log(`[REVERT_ATTENDANCE] Reverted ${records.length} records for ${employeeId}`);
    } catch (error) {
      this.logger.error(`[REVERT_ATTENDANCE] Failed for ${employeeId}: ${error.message}`, error.stack);
    }
  }

  async updateParentRequest(parentId: number, duration: number, fromDate: string, toDate: string) {
    this.logger.log(`[UPDATE_PARENT] id=${parentId}, duration=${duration}, from=${fromDate}, to=${toDate}`);
    try {
      if (!parentId) throw new BadRequestException('Parent ID is required');
      if (!fromDate) throw new BadRequestException('From Date is required');
      if (!toDate) throw new BadRequestException('To Date is required');

      const parentRequest = await this.leaveRequestRepository.findOne({ where: { id: parentId } });
      if (!parentRequest) throw new NotFoundException('Parent Request not found');

      parentRequest.duration = duration;
      parentRequest.fromDate = dayjs(fromDate).format('YYYY-MM-DD');
      parentRequest.toDate = dayjs(toDate).format('YYYY-MM-DD');

      const saved = await this.leaveRequestRepository.save(parentRequest);
      this.logger.log(`[UPDATE_PARENT] Successfully updated parent request ${parentId}`);
      return saved;
    } catch (error) {
      this.logger.error(`[UPDATE_PARENT] Failed for ${parentId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Update Failed: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async cancelApprovedRequest(id: number, employeeId: string) {
    this.logger.log(`[CANCEL_APPROVED] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({ where: { id, employeeId } });
      if (!request) throw new NotFoundException('Request not found');

      if (request.status !== LeaveRequestStatus.APPROVED) {
        throw new ForbiddenException('Only approved requests can be cancelled via this action');
      }

      const dateParts = request.fromDate.toString().split('-');
      const leaveStart = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 10, 0, 0);
      const now = new Date();

      if (now > leaveStart) {
        throw new ForbiddenException('Cannot cancel request after 10 AM on the start date.');
      }

      request.status = LeaveRequestStatus.REQUESTING_FOR_CANCELLATION;
      request.isRead = false;
      request.isReadEmployee = true;
      await this.leaveRequestRepository.save(request);

      try {
        const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId } });
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;

        if (employee && adminEmail) {
          const htmlContent = getCancellationTemplate({
            employeeName: employee.fullName,
            employeeId: employee.employeeId,
            requestType: request.requestType,
            title: request.title || 'No Title',
            fromDate: request.fromDate.toString(),
            toDate: request.toDate.toString(),
            duration: request.duration || 0,
            reason: request.description
          });
          await this.emailService.sendEmail(adminEmail, `Cancellation Requested: ${request.requestType} - ${employee.fullName}`, 'Cancellation Requested', htmlContent);
        }
      } catch (error) {
        this.logger.error(`[CANCEL_APPROVED] Admin notification failed: ${error.message}`);
      }

      await this.notifyManagerOfRequest(request);
      await this.notifyEmployeeOfSubmission(request);

      this._recalcMonthStatus(employeeId, request.fromDate.toString()).catch(() => { });
      this.logger.log(`[CANCEL_APPROVED] Successfully requested cancellation for request ${id}`);
      return request;
    } catch (error) {
      this.logger.error(`[CANCEL_APPROVED] Failed for ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to request cancellation', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findEmployeeUpdates(employeeId: string) {
    this.logger.log(`[UPDATES] Fetching for employee ${employeeId}`);
    try {
      return await this.leaveRequestRepository.find({
        where: {
          employeeId,
          isReadEmployee: false,
          status: In([
            LeaveRequestStatus.APPROVED,
            LeaveRequestStatus.REJECTED,
            LeaveRequestStatus.CANCELLATION_APPROVED,
            LeaveRequestStatus.CANCELLED,
            LeaveRequestStatus.REQUEST_MODIFIED,
            LeaveRequestStatus.CANCELLATION_REJECTED,
            LeaveRequestStatus.MODIFICATION_APPROVED,
            LeaveRequestStatus.MODIFICATION_REJECTED,
            LeaveRequestStatus.MODIFICATION_CANCELLED,
          ])
        },
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      this.logger.error(`[UPDATES] Failed for ${employeeId}: ${error.message}`);
      throw new HttpException('Failed to fetch employee updates', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async markEmployeeUpdateRead(id: number) {
    this.logger.log(`[UPDATES] Mark read: id=${id}`);
    try {
      return await this.leaveRequestRepository.update({ id }, { isReadEmployee: true });
    } catch (error) {
      this.logger.error(`[UPDATES] Failed to mark read for ${id}: ${error.message}`);
      throw new HttpException('Failed to update status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async uploadDocument(
    documents: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    this.logger.log(`[DOCS] Uploading ${documents.length} document(s) for leave request ${entityId}`);
    try {
      const uploadPromises = documents.map(async (doc) => {
        const details = new DocumentMetaInfo();
        details.refId = refId;
        details.refType = refType;
        details.entityId = entityId;
        details.entityType = entityType;

        return await this.documentUploaderService.uploadImage(doc, details);
      });

      const results = await Promise.all(uploadPromises);
      this.logger.log(`[DOCS] Successfully uploaded ${results.length} document(s)`);

      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error) {
      this.logger.error(`[DOCS] Upload failed: ${error.message}`, error.stack);
      throw new HttpException('Error uploading documents', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAllFiles(entityType: EntityType, entityId: number, refId: number, referenceType: ReferenceType) {
    this.logger.log(`[DOCS] Getting all files for entity ${entityType} ID ${entityId}`);
    try {
      return await this.documentUploaderService.getAllDocs(entityType, entityId, referenceType, refId);
    } catch (error) {
      this.logger.error(`[DOCS] Failed to get files: ${error.message}`);
      throw new HttpException('Failed to fetch documents', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async notifyManagerOfRequest(request: LeaveRequest) {
    this.logger.log(`[NOTIFY] Manager for request ${request.id} (${request.status})`);
    try {
      const mapping = await this.managerMappingRepository.findOne({
        where: { employeeId: request.employeeId, status: ManagerMappingStatus.ACTIVE }
      });

      if (mapping) {
        const manager = await this.userRepository.findOne({
          where: { aliasLoginName: mapping.managerName }
        });

        if (manager) {
          const actionText = request.status === LeaveRequestStatus.REQUESTING_FOR_CANCELLATION ? 'Cancellation' : request.status === LeaveRequestStatus.CANCELLED ? 'Reverted' : 'New';
          const emailActionText = request.status === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION ? 'Modification' : actionText;

          await this.notificationsService.createNotification({
            employeeId: manager.loginId,
            title: `${actionText} ${request.requestType} Request`,
            message: `${mapping.employeeName} has submitted ${actionText === 'New' ? 'a new' : 'a'} ${request.requestType} titled "${request.title}".`,
            type: 'alert'
          });

          const managerDetails = await this.employeeDetailsRepository.findOne({
            where: { email: manager.loginId }
          }) || await this.employeeDetailsRepository.findOne({
            where: { fullName: mapping.managerName }
          });

          const managerEmail = managerDetails?.email || manager.loginId;

          if (managerEmail && managerEmail.includes('@')) {
            const requester = await this.employeeDetailsRepository.findOne({
              where: { employeeId: request.employeeId }
            });

            const htmlContent = getRequestNotificationTemplate({
              employeeName: requester?.fullName || mapping.employeeName,
              employeeId: request.employeeId,
              requestType: request.requestType,
              title: request.title,
              fromDate: request.fromDate.toString(),
              toDate: request.toDate.toString(),
              duration: request.duration,
              status: request.status,
              recipientName: mapping.managerName,
              firstHalf: request.firstHalf,
              secondHalf: request.secondHalf
            });

            await this.emailService.sendEmail(
              managerEmail,
              `${emailActionText} Request: ${request.requestType} - ${mapping.employeeName}`,
              `${emailActionText} request submitted by ${mapping.employeeName}`,
              htmlContent
            );
            this.logger.log(`[NOTIFY] Email sent to manager ${managerEmail}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`[NOTIFY] notifyManagerOfRequest failed: ${error.message}`);
    }
  }

  private async notifyEmployeeOfSubmission(request: LeaveRequest) {
    this.logger.log(`[NOTIFY] Employee receipt for request ${request.id}`);
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: request.employeeId }
      });
      if (employee && employee.email) {
        const htmlContent = getEmployeeReceiptTemplate({
          employeeName: employee.fullName,
          requestType: request.requestType,
          title: request.title,
          fromDate: request.fromDate.toString(),
          toDate: request.toDate.toString(),
          duration: request.duration,
          status: request.status,
          description: request.description,
          firstHalf: request.firstHalf,
          secondHalf: request.secondHalf
        });
        await this.emailService.sendEmail(
          employee.email,
          `Submission Received: ${request.requestType} - ${request.title}`,
          `Your ${request.requestType} has been submitted.`,
          htmlContent
        );
        this.logger.log(`[NOTIFY] Receipt sent to ${employee.email}`);
      }
    } catch (error) {
      this.logger.error(`[NOTIFY] notifyEmployeeOfSubmission failed: ${error.message}`);
    }
  }

  async deleteDocument(entityType: EntityType, entityId: number, refId: number, key: string) {
    this.logger.log(`[DOCS] Deleting document with key ${key} for entity ${entityId}`);
    try {
      await this.validateEntity(entityType, entityId, refId);
      await this.documentUploaderService.deleteDoc(key);

      return {
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error) {
      this.logger.error(`[DOCS] Delete failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error deleting document', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async validateEntity(entityType: EntityType, entityId: number, refId: number) {
    try {
      if (entityType === EntityType.LEAVE_REQUEST) {
        if (refId !== 0) {
          const leaveRequest = await this.leaveRequestRepository.findOne({ where: { id: refId } });
          if (!leaveRequest) {
            throw new NotFoundException(`Leave request with ID ${refId} not found`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`[DOCS] Entity validation failed: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Validation error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async markAllEmployeeUpdatesRead(employeeId: string) {
    this.logger.log(`[UPDATES] Mark all read for: ${employeeId}`);
    try {
      return await this.leaveRequestRepository.update(
        { employeeId, isReadEmployee: false },
        { isReadEmployee: true }
      );
    } catch (error) {
      this.logger.error(`[UPDATES] Mark all read failed: ${error.message}`);
      throw new HttpException('Failed to update status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findMonthlyRequests(month: string, year: string, employeeId?: string, status?: string, page: number = 1, limit: number = 10) {
    return this.findUnifiedRequests({ month, year, employeeId, status, page, limit });
  }

  async modifyRequest(id: number, employeeId: string, updateData: { title?: string; description?: string; firstHalf?: string; secondHalf?: string; datesToModify?: string[] }) {
    this.logger.log(`[MODIFY_REQUEST] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({ where: { id, employeeId } });
      if (!request) throw new NotFoundException('Request not found or access denied');
      if (![LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED].includes(request.status)) throw new BadRequestException('Only Pending or Approved requests can be modified');

      if (updateData.datesToModify && updateData.datesToModify.length > 0) {
        if (request.status === LeaveRequestStatus.APPROVED) {
          return await this.modifyApprovedDates(id, employeeId, updateData.datesToModify, updateData);
        } else if (request.status === LeaveRequestStatus.PENDING) {
          const startDate = dayjs(request.fromDate);
          const endDate = dayjs(request.toDate);
          const totalDays = endDate.diff(startDate, 'day') + 1;
          if (updateData.datesToModify.length !== totalDays) {
            throw new BadRequestException('Partial modification is only allowed for Approved requests. For Pending requests, please edit the entire request.');
          }
        }
      }

      const updatedData: Partial<LeaveRequest> = { isModified: true, modificationCount: (request.modificationCount || 0) + 1, lastModifiedDate: new Date() };
      if (updateData.title !== undefined) updatedData.title = updateData.title;
      if (updateData.description !== undefined) updatedData.description = updateData.description;

      if (request.status === LeaveRequestStatus.APPROVED) {
        updatedData.status = LeaveRequestStatus.REQUESTING_FOR_MODIFICATION;
        updatedData.isRead = false;
      }

      if (updateData.firstHalf !== undefined) updatedData.firstHalf = updateData.firstHalf as WorkLocation | AttendanceStatus;
      if (updateData.secondHalf !== undefined) updatedData.secondHalf = updateData.secondHalf as WorkLocation | AttendanceStatus;

      if (updateData.firstHalf || updateData.secondHalf) {
        const newFirstHalf = updateData.firstHalf || request.firstHalf || request.requestType;
        const newSecondHalf = updateData.secondHalf || request.secondHalf || request.requestType;
        if (newFirstHalf === newSecondHalf) {
          updatedData.requestType = newFirstHalf;
          updatedData.isHalfDay = false;
        } else {
          const parts = [newFirstHalf, newSecondHalf].filter(h => h && h !== WorkLocation.OFFICE);
          updatedData.requestType = parts.join(' + ');
          updatedData.isHalfDay = true;
        }
      }

      await this.leaveRequestRepository.update({ id }, updatedData);
      const modifiedRequest = await this.leaveRequestRepository.findOne({ where: { id } });

      if (updatedData.status === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION) {
        const fullReq = await this.leaveRequestRepository.findOne({ where: { id } });
        if (fullReq) {
          await this.notifyAdminOfCancellationRequest(fullReq, employeeId);
          await this.notifyManagerOfRequest(fullReq);

          try {
            const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId } });
            if (employee?.email) {
              const htmlContent = getEmployeeReceiptTemplate({
                employeeName: employee.fullName,
                requestType: fullReq.requestType,
                title: fullReq.title,
                fromDate: dayjs(fullReq.fromDate).format('YYYY-MM-DD'),
                toDate: dayjs(fullReq.toDate).format('YYYY-MM-DD'),
                duration: fullReq.duration,
                status: fullReq.status,
                firstHalf: fullReq.firstHalf,
                secondHalf: fullReq.secondHalf
              });
              await this.emailService.sendEmail(employee.email, `Submission Received: Modification Request (${fullReq.requestType})`, 'Modification Request Notification', htmlContent);
            }
          } catch (e) {
            this.logger.error(`[MODIFY_REQUEST] Employee notification failed: ${e.message}`);
          }
        }
      }

      this.logger.log(`[MODIFY_REQUEST] Successfully modified request ${id}`);
      this._recalcMonthStatus(employeeId, request.fromDate.toString()).catch(() => { });

      return { success: true, modifiedRequest, message: 'Request modified successfully' };
    } catch (error) {
      this.logger.error(`[MODIFY_REQUEST] Failed for ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to modify request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async modifyApprovedDates(
    id: number,
    employeeId: string,
    datesToModify: string[],
    updateData: { title?: string; description?: string; firstHalf?: string; secondHalf?: string }
  ) {
    this.logger.log(`[MODIFY_APPROVED] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({ where: { id, employeeId } });
      if (!request) throw new NotFoundException('Request not found');

      const sortedDates = datesToModify.sort();
      const ranges: { start: string; end: string; count: number }[] = [];

      let currentStart = sortedDates[0];
      let currentEnd = sortedDates[0];
      let count = 1;

      for (let i = 1; i < sortedDates.length; i++) {
        const date = sortedDates[i];
        const prevDate = sortedDates[i - 1];
        const diff = dayjs(date).diff(dayjs(prevDate), 'day');
        let isConsecutive = diff === 1;

        if (!isConsecutive && diff > 1) {
          let temp = dayjs(prevDate).add(1, 'day');
          let hasWorkDayGap = false;
          while (temp.isBefore(dayjs(date))) {
            const isWknd = await this._isWeekend(temp, employeeId);
            if (!isWknd) {
              hasWorkDayGap = true;
              break;
            }
            temp = temp.add(1, 'day');
          }
          if (!hasWorkDayGap) isConsecutive = true;
        }

        if (isConsecutive) {
          currentEnd = date;
          count++;
        } else {
          ranges.push({ start: currentStart, end: currentEnd, count });
          currentStart = date;
          currentEnd = date;
          count = 1;
        }
      }
      ranges.push({ start: currentStart, end: currentEnd, count });

      const createdRequests: LeaveRequest[] = [];

      for (const range of ranges) {
        let newRequestType = request.requestType;
        let isHalfDay = request.isHalfDay;

        const fHalf = updateData.firstHalf || request.firstHalf || WorkLocation.OFFICE;
        const sHalf = updateData.secondHalf || request.secondHalf || WorkLocation.OFFICE;

        if (fHalf === sHalf) {
          newRequestType = fHalf;
          isHalfDay = false;
        } else {
          const parts = [fHalf, sHalf].filter(h => h && h !== WorkLocation.OFFICE);
          newRequestType = parts.join(' + ');
          isHalfDay = true;
        }

        const newRequest = this.leaveRequestRepository.create({
          ...(request as any),
          id: undefined,
          fromDate: range.start,
          toDate: range.end,
          status: LeaveRequestStatus.REQUESTING_FOR_MODIFICATION,
          title: updateData.title || request.title,
          description: updateData.description || request.description,
          firstHalf: fHalf,
          secondHalf: sHalf,
          requestType: newRequestType,
          isHalfDay: isHalfDay,
          isRead: false,
          isReadEmployee: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          duration: range.count,
          requestModifiedFrom: request.id.toString(),
          isModified: true,
          modificationCount: 1,
          lastModifiedDate: new Date()
        }) as unknown as LeaveRequest;

        const savedNew = await this.leaveRequestRepository.save(newRequest) as unknown as LeaveRequest;
        await this.copyRequestDocuments(request.id, savedNew.id);
        createdRequests.push(savedNew);

        await this.notifyManagerOfRequest(savedNew);
        await this.notifyEmployeeOfSubmission(savedNew as LeaveRequest);
      }

      this._recalcMonthStatus(employeeId, datesToModify[0]).catch(() => { });
      this.logger.log(`[MODIFY_APPROVED] Successfully created ${createdRequests.length} modification requests`);
      return { success: true, modifiedRequests: createdRequests, message: 'Modification requests created successfully' };
    } catch (error) {
      this.logger.error(`[MODIFY_APPROVED] Failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to create modification requests', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async undoModificationRequest(id: number, employeeId: string) {
    this.logger.log(`[UNDO_MODIFY] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({ where: { id, employeeId } });
      if (!request) throw new NotFoundException('Request not found');

      if (request.status !== LeaveRequestStatus.REQUESTING_FOR_MODIFICATION) {
        throw new BadRequestException('Only requests with status "Requesting for Modification" can be undone.');
      }

      request.status = LeaveRequestStatus.MODIFICATION_CANCELLED;
      await this.leaveRequestRepository.save(request);

      this._recalcMonthStatus(employeeId, String(request.fromDate)).catch(() => { });
      this.logger.log(`[UNDO_MODIFY] Successfully cancelled modification request ${id}`);

      return { success: true, message: 'Modification request undone successfully' };
    } catch (error) {
      this.logger.error(`[UNDO_MODIFY] Failed for ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to undo modification request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getMonthlyLeaveBalance(employeeId: string, month: number, year: number) {
    this.logger.log(`[BALANCE_MONTH] employeeId=${employeeId}, month=${month}, year=${year}`);
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
        select: ['id', 'employeeId', 'designation', 'employmentType', 'joiningDate', 'conversionDate'],
      });

      if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

      const isIntern =
        employee.employmentType === EmploymentType.INTERN ||
        (employee.designation || '').toLowerCase().includes(EmploymentType.INTERN.toLowerCase());

      let runningBalance = 0;
      let ytdUsed = 0;
      let ytdLop = 0;

      const targetMonthStats = { carryOver: 0, monthlyAccrual: 0, leavesTaken: 0, lop: 0, balance: 0, ytdUsed: 0, ytdLop: 0 };

      const joinDate = dayjs(employee.joiningDate);
      const joinMonth = joinDate.isValid() ? joinDate.month() + 1 : 1;
      const joinYear = joinDate.isValid() ? joinDate.year() : year;
      const calculationStartYear = Math.max(joinYear, 2024);

      const attendanceRecords = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(
            new Date(`${calculationStartYear}-01-01T00:00:00`),
            new Date(`${year}-12-31T23:59:59`),
          ),
        },
        order: { workingDate: 'ASC' },
      });

      const attendanceMap = new Map<string, EmployeeAttendance[]>();
      attendanceRecords.forEach((rec) => {
        const dateStr = rec.workingDate instanceof Date
          ? rec.workingDate.toISOString().split('T')[0]
          : String(rec.workingDate).split('T')[0];
        const [y, mStr] = dateStr.split('-');
        const key = `${y}-${parseInt(mStr)}`;
        let list = attendanceMap.get(key);
        if (!list) {
          list = [];
          attendanceMap.set(key, list);
        }
        list.push(rec);
      });

      for (let curYear = calculationStartYear; curYear <= year; curYear++) {
        ytdUsed = 0;
        ytdLop = 0;

        const startM = curYear === calculationStartYear ? joinMonth : 1;
        const endM = curYear === year ? month : 12;

        for (let m = startM; m <= endM; m++) {
          let isInternThisMonth = isIntern;
          const convDate = (employee as any).conversionDate ? dayjs((employee as any).conversionDate) : null;
          if (convDate && convDate.isValid()) {
            const convMonth = convDate.month() + 1;
            const convYear = convDate.year();
            if (curYear > convYear || (curYear === convYear && m >= convMonth)) {
              isInternThisMonth = false;
              if (curYear === convYear && m === convMonth && convDate.date() > 10) isInternThisMonth = true;
            } else {
              isInternThisMonth = true;
            }
          }

          if (curYear === year && m === month) targetMonthStats.carryOver = runningBalance;

          let effectiveAccrual = isInternThisMonth ? 1.0 : 1.5;
          if (curYear === joinYear && m === joinMonth && joinDate.date() > 10) effectiveAccrual = 0;

          runningBalance += effectiveAccrual;
          if (curYear === year && m === month) targetMonthStats.monthlyAccrual = effectiveAccrual;

          const attendance = attendanceMap.get(`${curYear}-${m}`) || [];
          const monthlyUsage = attendance.reduce((acc, rec) => {
            let dailyUsage = 0;
            const status = (rec.status || '').toLowerCase();
            if (rec.firstHalf || rec.secondHalf) {
              const processHalf = (half: string | null) => {
                if (!half) return 0;
                const h = half.toLowerCase();
                return (h.includes(AttendanceStatus.LEAVE.toLowerCase()) || h.includes(AttendanceStatus.ABSENT.toLowerCase())) ? 0.5 : 0;
              };
              dailyUsage = processHalf(rec.firstHalf) + processHalf(rec.secondHalf);
            } else {
              if (status.includes(AttendanceStatus.LEAVE.toLowerCase()) || status.includes(AttendanceStatus.ABSENT.toLowerCase())) {
                dailyUsage = 1;
              } else if (status.includes(AttendanceStatus.HALF_DAY.toLowerCase())) {
                dailyUsage = 0.5;
              }
            }
            return acc + dailyUsage;
          }, 0);

          const roundedUsage = Math.round(monthlyUsage * 10) / 10;
          runningBalance -= roundedUsage;
          if (curYear === year) ytdUsed += roundedUsage;

          let lop = 0;
          if (runningBalance < 0) {
            lop = Math.abs(runningBalance);
            runningBalance = 0;
          }

          if (curYear === year) ytdLop += lop;

          if (curYear === year && m === month) {
            targetMonthStats.leavesTaken = roundedUsage;
            targetMonthStats.lop = lop;
            targetMonthStats.balance = runningBalance;
            targetMonthStats.ytdUsed = ytdUsed;
            targetMonthStats.ytdLop = ytdLop;
          }

          if (isInternThisMonth) runningBalance = 0;
        }
      }

      this.logger.log(`[BALANCE_MONTH] Calculated: current=${targetMonthStats.balance}, ytdUsed=${targetMonthStats.ytdUsed}`);
      return targetMonthStats;
    } catch (error) {
      this.logger.error(`[BALANCE_MONTH] Calculation failed for ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to calculate monthly leave balance', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
