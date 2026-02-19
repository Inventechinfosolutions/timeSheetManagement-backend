import { Injectable, ConflictException, ForbiddenException, NotFoundException, Logger, InternalServerErrorException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In, Brackets, Between, DeepPartial } from 'typeorm';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { AttendanceStatus } from '../enums/attendance-status.enum';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmploymentType } from '../enums/employment-type.enum';
import { EmailService } from '../../email/email.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import dayjs from 'dayjs';
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
    
    // Always block Sunday (0) and Saturday (6)
    const day = date.day();
    if (day === 0 || day === 6) return true;

    return false;
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
  ) {}

  // Helper to check if holiday
  private async _isHoliday(date: dayjs.Dayjs): Promise<boolean> {
    const dateStr = date.format('YYYY-MM-DD');
    // Using QueryBuilder for robust Date comparison in MySQL
    const holiday = await this.masterHolidayRepository.createQueryBuilder('h')
      .where('h.date = :dateStr', { dateStr })
      .getOne();
    
    return !!holiday;
  }

  /**
   * Calculate total working hours based on firstHalf and secondHalf values
   * @param firstHalf - Activity for first half ('Work From Home', 'Client Visit', 'Office', 'Leave', etc.)
   * @param secondHalf - Activity for second half
   * @returns Total working hours (0, 6, or 9)
   * 
   * Logic:
   * - Work activity (WFH, CV, Office) = 6 hours per half
   * - Leave = 0 hours per half
   * - Total = firstHalf hours + secondHalf hours
   * 
   * Examples:
   * - WFH + Leave = 6 + 0 = 6 hours
   * - WFH + Client Visit = 6 + 6 = 9 hours
   * - Leave + Leave = 0 + 0 = 0 hours
   */
  private calculateTotalHours(firstHalf: string | null, secondHalf: string | null): number {
    const isWork = (half: string | null): boolean => {
      if (!half || half === 'Leave' || half === 'Absent') return false;
      const normalized = half.toLowerCase();
      return normalized.includes('office') || 
             normalized.includes('wfh') || 
             normalized.includes('work from home') || 
             normalized.includes('client visit') ||
             normalized.includes('present');
    };

    const h1Work = isWork(firstHalf);
    const h2Work = isWork(secondHalf);

    if (h1Work && h2Work) return 9;
    if (h1Work || h2Work) return 6;
    return 0;
  }


  async create(data: LeaveRequestDto) {
    try {
      // Check for overlapping dates based on request type
      if (data.fromDate && data.toDate && data.requestType) {
        const requestType = data.requestType;
        
        let conflictingTypes: string[] = [];
        
        if (requestType === 'Apply Leave' || requestType === 'Leave') {
          conflictingTypes = ['Apply Leave', 'Leave'];
        } else if (requestType === 'Work From Home') {
          conflictingTypes = ['Apply Leave', 'Leave', 'Work From Home'];
        } else if (requestType === 'Client Visit') {
          conflictingTypes = ['Apply Leave', 'Leave', 'Client Visit'];
        } else if (requestType === 'Half Day') {
          conflictingTypes = ['Apply Leave', 'Leave', 'Half Day'];
        } else {
          conflictingTypes = [requestType];
        }

        const existingRequests = await this.leaveRequestRepository.find({
          where: {
            employeeId: data.employeeId,
            status: In(['Pending', 'Approved', 'Request Modified']),
            requestType: In(conflictingTypes),
            fromDate: LessThanOrEqual(data.toDate),
            toDate: MoreThanOrEqual(data.fromDate),
          },
        });

        for (const existing of existingRequests) {
          // Determine which halves existing request consumes
          // Full Day consumes both. Half Day consumes based on columns.
          // Fallback: if columns are null/Office, assume not consumed unless it's Full Day.
          // Note: Legacy Full Day might have null columns, so we check !existing.isHalfDay.
          
          const existingIsFull = !existing.isHalfDay;
          const existingConsumesFirst = existingIsFull || (existing.firstHalf && existing.firstHalf !== 'Office');
          const existingConsumesSecond = existingIsFull || (existing.secondHalf && existing.secondHalf !== 'Office');

          // Determine which halves new request wants
          const newWantsFirst = !data.isHalfDay || data.halfDayType === 'First Half';
          const newWantsSecond = !data.isHalfDay || data.halfDayType === 'Second Half';

          if ((newWantsFirst && existingConsumesFirst) || (newWantsSecond && existingConsumesSecond)) {
               const existingTypeLabel = existingIsFull ? 'Full Day' : 
                                         (existingConsumesFirst && !existingConsumesSecond) ? 'First Half' : 
                                         (!existingConsumesFirst && existingConsumesSecond) ? 'Second Half' : 'Split Day';
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
      // Calculate duration (Exclude Weekends and Holidays)
      if (data.fromDate && data.toDate) {
        const start = dayjs(data.fromDate);
        const end = dayjs(data.toDate);
        
        let workingDays = 0;
        const diff = end.diff(start, 'day');
        
        for (let i = 0; i <= diff; i++) {
            const current = start.add(i, 'day');
            // Check for Weekend and Holiday using existing helper methods
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
      }

      // --- LOGIC: Populate firstHalf and secondHalf ---
      // We do this before creating the entity so it gets saved to the new columns
      if (data.isHalfDay) {
          const mainType = (data.requestType === 'Apply Leave' || data.requestType === 'Half Day' ? 'Leave' : data.requestType) || 'Office';
          // Access otherHalfType directly from DTO
          const otherHalf = data.otherHalfType || 'Office'; 
          
          if (data.halfDayType === 'First Half') {
              // First half is the MAIN request type
              data.firstHalf = mainType;
              data.secondHalf = otherHalf;
          } else if (data.halfDayType === 'Second Half') {
              // Second half is the MAIN request type
              data.firstHalf = otherHalf;
              data.secondHalf = mainType;
          }
      } else {
          // Full Day
          const mainType = (data.requestType === 'Apply Leave' || data.requestType === 'Half Day' ? 'Leave' : data.requestType) || 'Office';
          data.firstHalf = mainType;
          data.secondHalf = mainType;
      }

      const safeData = {
          ...data,
          fromDate: data.fromDate,
          toDate: data.toDate,
      };

      const leaveRequest = this.leaveRequestRepository.create(safeData as unknown as DeepPartial<LeaveRequest>) as LeaveRequest;
      const savedRequest = await this.leaveRequestRepository.save(leaveRequest);

      // --- NEW NOTIFICATION LOGIC ---
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: data.employeeId },
        });

        if (employee) {
          const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
          const requestTypeLabel = (data.requestType === 'Apply Leave' ? 'Leave' : data.requestType) || 'Request';
          const subject = `New ${requestTypeLabel} Request - ${employee.fullName}`;

          const htmlContent = getRequestNotificationTemplate({
            employeeName: employee.fullName || 'Employee',
            employeeId: employee.employeeId,
            requestType: requestTypeLabel,
            title: data.title || 'No Title',
            fromDate: data.fromDate?.toString() || '',
            toDate: data.toDate?.toString() || '',
            duration: data.duration || 0,
            status: 'Pending',
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
            this.logger.log(`Notification sent to Admin (${adminEmail}) for request from ${employee.fullName}`);
          }
        }
      } catch (error) {
        this.logger.error('Failed to send admin notification', error);
      }

      // Link orphaned documents (refId: 0) to the newly created request
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: savedRequest.employeeId }
        });

        if (employee) {
          await this.documentRepo.update(
            {
              entityType: EntityType.LEAVE_REQUEST,
              entityId: employee.id,
              refId: 0
            },
            {
              refId: savedRequest.id
            }
          );
        }
      } catch (error) {
        this.logger.error(`Failed to link orphaned documents for request ${savedRequest.id}: ${error.message}`);
      }

      // NEW: Notify Mapped Manager
      await this.notifyManagerOfRequest(savedRequest);

      // NEW: Notify Employee (Submission Receipt)
      await this.notifyEmployeeOfSubmission(savedRequest);

      return savedRequest;
    } catch (error) {
      this.logger.error(`Error creating leave request for employee ${data.employeeId}:`, error);
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      throw new HttpException(
        error.message || 'Failed to create leave request',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  getLeaveDurationTypes() {
    return [
      { label: 'Full Day Application', value: 'Full Day' },
      { label: 'Half Day Application', value: 'Half Day' }
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
          mmStatus: 'ACTIVE',
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
        WHEN lr.status = 'Pending' THEN 1 
        WHEN lr.status = 'Requesting for Modification' THEN 2
        WHEN lr.status = 'Requesting for Cancellation' THEN 2
        WHEN lr.status = 'Approved' THEN 3
        WHEN lr.status = 'Cancellation Approved' THEN 4
        WHEN lr.status = 'Cancellation Rejected' THEN 5
        WHEN lr.status = 'Modification Approved' THEN 4
        WHEN lr.status = 'Modification Cancelled' THEN 5
        WHEN lr.status = 'Request Modified' THEN 6
        WHEN lr.status = 'Rejected' THEN 6
        WHEN lr.status = 'Cancelled' THEN 7
        ELSE 8 
      END`, 'priority')
      .orderBy('priority', 'ASC')
      .addOrderBy('lr.id', 'DESC')
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

  async findAll(department?: string, status?: string, search?: string, page: number = 1, limit: number = 10, managerName?: string, managerId?: string) {
    return this.findUnifiedRequests({ department, status, search, page, limit, managerName, managerId });
  }

  async findByEmployeeId(employeeId: string, status?: string, page: number = 1, limit: number = 10) {
    return this.findUnifiedRequests({ employeeId, status, page, limit });
  }

  async findOne(id: number) {
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
      throw new NotFoundException(`Leave request with ID ${id} not found`);
    }

    return result;
  }

  async findUnread(managerName?: string) {
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
        WHEN lr.status = 'Pending' THEN 1 
        WHEN lr.status = 'Requesting for Cancellation' THEN 2
        WHEN lr.status = 'Approved' THEN 3
        WHEN lr.status = 'Cancellation Approved' THEN 4
        WHEN lr.status = 'Request Modified' THEN 5
        WHEN lr.status = 'Rejected' THEN 5
        WHEN lr.status = 'Cancelled' THEN 6
        ELSE 7 
      END`, 'priority');

    if (managerName) {
      qb.innerJoin(ManagerMapping, 'mm', 'mm.employeeId = lr.employeeId AND mm.status = :mStatus', { mStatus: 'ACTIVE' })
        .andWhere('mm.managerName = :managerName', { managerName });
    }

    return qb.orderBy('priority', 'ASC')
      .addOrderBy('lr.id', 'DESC')
      .getRawMany();
  }

  async markAsRead(id: number) {
    const request = await this.leaveRequestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    request.isRead = true;
    return this.leaveRequestRepository.save(request);
  }

  // --- Partial Cancellation Logic ---

  async getCancellableDates(id: number, employeeId: string) {
    const request = await this.leaveRequestRepository.findOne({
      where: { id, employeeId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'Approved')
      throw new ForbiddenException(
        'Only approved requests can be check for cancellation',
      );

    const startDate = dayjs(request.fromDate);
    const endDate = dayjs(request.toDate);
    const diffDays = endDate.diff(startDate, 'day');

    const results: { date: string; isCancellable: boolean; reason: string }[] =
      [];
    const now = dayjs();

    // Fetch overlapping cancellations to exclude them
    const existingCancellations = await this.leaveRequestRepository.find({
      where: {
        employeeId,
        requestType: request.requestType, // Only check cancellations of the same type
        status: In([
          'Requesting for Cancellation',
          'Cancellation Approved',
        ]),
      },
    });

    for (let i = 0; i <= diffDays; i++) {
      const currentDate = startDate.add(i, 'day');

      // URL: Exclude Weekends (Sat=6, Sun=0)
      // Check weekend via helper (async)
      const isWknd = await this._isWeekend(currentDate, employeeId);
      if (isWknd) {
        continue;
      }

      // Check for Holiday
      const isHol = await this._isHoliday(currentDate);
      if (isHol) {
        continue;
      }



      // Check if this date is already covered by a cancellation request
      const currentStr = currentDate.format('YYYY-MM-DD');
      const isAlreadyCancelled = existingCancellations.some((c) => {
        // Convert DB dates to Dayjs and then to string for safe comparison
        const cStart = dayjs(c.fromDate);
        const cEnd = dayjs(c.toDate);

        // ranges are inclusive
        return (
          (currentDate.isSame(cStart, 'day') ||
            currentDate.isAfter(cStart, 'day')) &&
          (currentDate.isSame(cEnd, 'day') || currentDate.isBefore(cEnd, 'day'))
        );
      });

      if (isAlreadyCancelled) {
        continue; // Skip already cancelled dates
      }

      // Rule: Cancel allowed until 6:30 PM (18:30) of the SAME day
      // Deadline = CurrentDate at 18:30:00
      const deadline = currentDate
        .hour(18)
        .minute(30)
        .second(0);

      const isCancellable = now.isBefore(deadline);

      results.push({
        date: currentDate.format('YYYY-MM-DD'),
        isCancellable,
        reason: isCancellable
          ? `Deadline: ${deadline.format('DD-MMM HH:mm')}`
          : `Deadline passed (${deadline.format('DD-MMM HH:mm')})`,
      });
    }
    return results;
  }

  async cancelApprovedDates(
    id: number,
    employeeId: string,
    datesToCancel: string[],
  ) {
    const request = await this.leaveRequestRepository.findOne({
      where: { id, employeeId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'Approved')
      throw new ForbiddenException('Request must be approved');

    if (!datesToCancel || datesToCancel.length === 0)
      throw new BadRequestException('No dates provided');

    // 1. Validate Timings Again
    const now = dayjs();
    for (const dateStr of datesToCancel) {
      const targetDate = dayjs(dateStr);
      const deadline = targetDate
        .hour(18)
        .minute(30)
        .second(0);
      if (now.isAfter(deadline)) {
        throw new ForbiddenException(
          `Cancellation deadline passed for ${dateStr}. Cutoff was ${deadline.format('YYYY-MM-DD HH:mm')}`,
        );
      }
    }

    // 2. Check if Full Cancellation
    const startDate = dayjs(request.fromDate);
    const endDate = dayjs(request.toDate);
    const totalDays = endDate.diff(startDate, 'day') + 1;

    if (datesToCancel.length === totalDays) {
      // FULL CANCEL
      request.status = 'Requesting for Cancellation';
      request.isRead = false;
      request.isReadEmployee = true;
      const saved = await this.leaveRequestRepository.save(request);
      
      // Notify Admin
      await this.notifyAdminOfCancellationRequest(saved, employeeId);
      
      // Notify Manager
      await this.notifyManagerOfRequest(saved);
      
      // Notify Employee (Submission Receipt)
      await this.notifyEmployeeOfSubmission(saved);

      // --- Notify Manager via App Notification ---
      try {
        const mapping = await this.managerMappingRepository.findOne({ where: { employeeId, status: 'ACTIVE' as any } });
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
         this.logger.error(`Failed to create app notification for manager: ${e.message}`);
      }
      
      return saved;
    } else {
      // PARTIAL CANCEL - Handle Non-Contiguous Dates by grouping them into ranges
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

        // Bridging weekends: If diff > 1, check if there are any working days in between
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
          if (!hasWorkDayGap) {
            isConsecutive = true;
          }
        }

        if (isConsecutive) {
          currentEnd = date;
          count++;
        } else {
          // Gap found, push current range and start new
          ranges.push({ start: currentStart, end: currentEnd, count });
          currentStart = date;
          currentEnd = date;
          count = 1;
        }
      }
      // Push the final range
      ranges.push({ start: currentStart, end: currentEnd, count });

      const createdRequests: LeaveRequest[] = [];

      // Create a request for each range
      for (const range of ranges) {
        const newRequest = this.leaveRequestRepository.create({
          ...request,
          id: undefined, // New ID
          fromDate: range.start,
          toDate: range.end,
          status: 'Requesting for Cancellation',
          isRead: false,
          isReadEmployee: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          duration: range.count,
        });
        
        const savedNew = await this.leaveRequestRepository.save(newRequest);
        
        // Copy documents from the original request to this new cancellation record
        await this.copyRequestDocuments(request.id, savedNew.id);
        
        createdRequests.push(savedNew);

        await this.notifyAdminOfCancellationRequest(savedNew, employeeId, range.count);
        
        // Notify Manager of this specific segment
        await this.notifyManagerOfRequest(savedNew);
        
        // Notify Employee (Submission Receipt) of this specific segment
        await this.notifyEmployeeOfSubmission(savedNew);

        // --- Notify Manager via App Notification ---
        try {
          const mapping = await this.managerMappingRepository.findOne({ where: { employeeId, status: 'ACTIVE' as any } });
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
          // Notify Admin (optional, if admin has an employee ID for notifications)
          // const admin = await this.userRepository.findOne({ where: { userType: 'ADMIN' } });
          // if (admin && admin.loginId) { ... }
        } catch (e) {
           this.logger.error(`Failed to create app notification for manager: ${e.message}`);
        }
      }

      // Updated Original Request Duration - REMOVED per requirements.
      // Duration should only update when Admin APPROVES the cancellation.
      // if (request.duration) {
      //   request.duration = Math.max(0, request.duration - datesToCancel.length);
      //   await this.leaveRequestRepository.save(request);
      // }

      return createdRequests.length === 1
        ? createdRequests[0]
        : createdRequests;
    }
  }

  private async notifyAdminOfCancellationRequest(request: LeaveRequest, employeeId: string, totalDays?: number) {
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
      });

      if (employee) {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
        if (adminEmail) {
          const requestTypeLabel = request.requestType === 'Apply Leave' ? 'Leave' : request.requestType;
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
          this.logger.log(`Cancellation notification sent to Admin for ${employee.fullName}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to send cancellation request notification to admin', error);
    }
  }

  private async copyRequestDocuments(sourceRefId: number, targetRefId: number) {
    try {
      const originalDocs = await this.documentRepo.find({
        where: {
          refId: sourceRefId,
          entityType: EntityType.LEAVE_REQUEST
        },
      });

      if (originalDocs && originalDocs.length > 0) {
        const clonedDocs = originalDocs.map((doc) => {
          // Destructure to remove the existing ID and link metadata
          const { id, ...docData } = doc;
          
          const newDoc = this.documentRepo.create({
            ...docData,
            refId: targetRefId,
            s3Key: doc.s3Key || doc.id, // Point to the same physical file
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          
          return newDoc;
        });

        await this.documentRepo.save(clonedDocs);
        this.logger.log(`Copied ${clonedDocs.length} documents from request ${sourceRefId} to new cancellation request ${targetRefId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to copy documents from ${sourceRefId} to ${targetRefId}: ${error.message}`);
    }
  }

  async undoCancellationRequest(id: number, employeeId: string) {
    const request = await this.leaveRequestRepository.findOne({
      where: { id, employeeId },
    });

    if (!request) throw new NotFoundException('Request not found');

    // Strict check: Only "Requesting for Cancellation" can be undone (meaning "I requested to cancel, now I want to undo that request")
    // BUT if it was ALREADY Approved or Rejected by Admin, it's too late/handled?
    // "Requesting for Cancellation" IS the status when Employee submits it. It waits for Admin.
    // So yes, this is the correct status to target.
    if (request.status !== 'Requesting for Cancellation') {
      throw new ForbiddenException(
        'Only pending cancellation requests can be undone',
      );
    }

    // Time Check: Next Day 10 AM
    const submissionTime = dayjs(request.submittedDate || request.createdAt);
    const deadline = submissionTime.add(1, 'day').hour(10).minute(0).second(0);
    const now = dayjs();

    if (now.isAfter(deadline)) {
      throw new ForbiddenException(
        `Undo window closed. Deadline was ${deadline.format('DD-MMM HH:mm')}`,
      );
    }

    // Revert Duration on Master Request
    const masterRequest = await this.leaveRequestRepository.findOne({
      where: {
        employeeId: request.employeeId,
        requestType: request.requestType,
        status: 'Approved',
        fromDate: LessThanOrEqual(request.fromDate),
        toDate: MoreThanOrEqual(request.toDate),
      },
    });

    if (masterRequest) {
      // Ensure numeric addition to avoid string concatenation issues (e.g., "2.5" + "1" = "2.51")
      const currentDuration = Number(masterRequest.duration || 0);
      const restoreDuration = Number(request.duration || 0);
      masterRequest.duration = currentDuration + restoreDuration;
      
      await this.leaveRequestRepository.save(masterRequest);
    }

    // Mark this request as Cancelled (invalidated)
    request.status = 'Cancelled';
    const saved = await this.leaveRequestRepository.save(request);

    // NOTE: Manager notification is sent in the custom email block below (not using generic notifyManagerOfRequest)

      // --- NEW: Email Notifications ---
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: request.employeeId },
      });
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;

      if (employee) {
        // 1. Admin Email (actionType: 'revert')
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
          await this.emailService.sendEmail(
            adminEmail,
            adminSubject,
            'Cancellation Reverted',
            adminHtml,
          );
        }

        // 2. Manager Email (NEW)
         const mapping = await this.managerMappingRepository.findOne({
          where: { employeeId: request.employeeId, status: 'ACTIVE' as any }
        });
        this.logger.log(`[REVERT-DEBUG] Manager mapping found: ${!!mapping}, EmployeeID: ${request.employeeId}`);

        if (mapping) {
           const manager = await this.userRepository.findOne({
            where: { aliasLoginName: mapping.managerName }
          });
          this.logger.log(`[REVERT-DEBUG] Manager user found: ${!!manager}, ManagerName: ${mapping.managerName}`);
          
          const managerDetails = await this.employeeDetailsRepository.findOne({
             where: { email: manager?.loginId }
          }) || await this.employeeDetailsRepository.findOne({
             where: { fullName: mapping.managerName }
          });
          const managerEmail = managerDetails?.email || manager?.loginId;
          this.logger.log(`[REVERT-DEBUG] Manager email resolved: ${managerEmail}`);

           if (managerEmail && managerEmail.includes('@')) {
               const managerSubject = `Cancellation Reverted: ${request.requestType} - ${employee.fullName}`;
               
               // Use the SAME template as Admin (getCancellationTemplate)
               const managerHtml = getCancellationTemplate({
                employeeName: employee.fullName,
                employeeId: employee.employeeId,
                requestType: request.requestType,
                title: request.title,
                fromDate: request.fromDate.toString(),
                toDate: request.toDate.toString(),
                duration: request.duration,
                actionType: 'revert', // Same as admin
              });
              this.logger.log(`[REVERT-DEBUG] Sending manager email to: ${managerEmail}`);
               await this.emailService.sendEmail(
                managerEmail,
                managerSubject,
                'Cancellation Reverted',
                managerHtml,
              );
              this.logger.log(`[REVERT-DEBUG] Manager email sent successfully to: ${managerEmail}`);
           } else {
              this.logger.warn(`[REVERT-DEBUG] Manager email not valid: ${managerEmail}`);
           }
        } else {
           this.logger.warn(`[REVERT-DEBUG] No active manager mapping found for employee: ${request.employeeId}`);
        }


        // 3. Employee Email ("Reverted")
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
            reviewedBy: '' // Explicitly undefined to remove "reviewed by [Name]"
          });
          await this.emailService.sendEmail(
            employee.email,
            empSubject,
            'Your cancellation request has been reverted.',
            empHtml,
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to send undo cancellation emails:', error);
    }

    return saved;
  }

  async markAllAsRead(managerName?: string) {
    if (managerName) {
      // For managers, we only mark as read their subordinates' requests
      const subquery = this.managerMappingRepository.createQueryBuilder('mm')
        .select('mm.employeeId')
        .where('mm.managerName = :managerName', { managerName })
        .andWhere('mm.status = :mStatus', { mStatus: 'ACTIVE' });

      return this.leaveRequestRepository.createQueryBuilder()
        .update()
        .set({ isRead: true })
        .where('isRead = :isRead', { isRead: false })
        .andWhere('employeeId IN (' + subquery.getQuery() + ')')
        .setParameters(subquery.getParameters())
        .execute();
    }
    return this.leaveRequestRepository.update({ isRead: false }, { isRead: true });
  }

  async remove(id: number) {
    const request = await this.leaveRequestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    if (request.status !== 'Pending') {
      throw new ForbiddenException('Only pending leave requests can be deleted');
    }

    // --- NEW: Admin Notification Logic (Before Deletion) ---
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: request.employeeId },
      });

      if (employee) {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;

        if (adminEmail) {
          const requestTypeLabel =
            request.requestType === 'Apply Leave' ? 'Leave' : request.requestType;
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
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to send cancellation email for request ${id}`,
        error,
      );
    }

    // CHANGED: Instead of deleting, mark as Cancelled so Admin gets a notification
    request.status = 'Cancelled';
    request.isRead = false; // Ensure Admin sees this in unread notifications
    return this.leaveRequestRepository.save(request);
  }

  /** Leave balance: entitlement (18 full timer / 12 intern), used (approved leave in year), pending, balance */
  async getLeaveBalance(employeeId: string, year: string) {
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
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    // Explicit employment type: FULL_TIMER = 18, INTERN = 12. Else infer from designation (contains "intern").
    const isIntern =
      employee.employmentType === EmploymentType.INTERN ||
      (employee.designation || '').toLowerCase().includes('intern');
    
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
        // Skip months before joining
        if (yearNum === joinYear && m < joinMonth) continue;

        let monthlyAccrual = isIntern ? 1.0 : 1.5;
        
        // Use conversion date to override isIntern status for specific months
        if (convDate && convDate.isValid()) {
          const cMonth = convDate.month() + 1;
          const cYear = convDate.year();
          
          // If we are in or after the conversion month/year
          if (yearNum > cYear || (yearNum === cYear && m >= cMonth)) {
            monthlyAccrual = 1.5; // Always full-timer after conversion
            
            // Special rule: if converted after the 10th (date > 10) of conversion month, 1.5 starts next month
            if (yearNum === cYear && m === cMonth && convDate.date() > 10) {
              monthlyAccrual = 1.0; // Stay intern accrual for conversion month
            }
          } else {
            monthlyAccrual = 1.0; // Before conversion, they were intern
          }
        }

        // Apply joining month rule: if joined after 10th (date > 10), first month accrual is 0
        if (yearNum === joinYear && m === joinMonth && joinDate.date() > 10) {
          monthlyAccrual = 0;
        }

        entitlement += monthlyAccrual;
      }
    }

    const leaveTypes = ['Apply Leave', 'Leave'];

    const usedResult = await this.leaveRequestRepository
      .createQueryBuilder('lr')
      .select('SUM(lr.duration)', 'total')
      .where('lr.employeeId = :employeeId', { employeeId })
      .andWhere(new Brackets(qb => {
          qb.where('lr.requestType IN (:...leaveTypes)', { leaveTypes })
            .orWhere('lr.firstHalf = :leave', { leave: 'Leave' })
            .orWhere('lr.secondHalf = :leave', { leave: 'Leave' });
      }))
      .andWhere('lr.status = :status', { status: 'Approved' })
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
            .orWhere('lr.firstHalf = :leave', { leave: 'Leave' })
            .orWhere('lr.secondHalf = :leave', { leave: 'Leave' });
      }))
      .andWhere('lr.status = :status', { status: 'Pending' })
      .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
      .andWhere('lr.toDate >= :yearStart', { yearStart })
      .getRawOne();

    const pending = parseFloat(pendingResult?.total || '0');

    const balance = Math.max(0, entitlement - used);

    return {
      employeeId,
      year: yearNum,
      entitlement,
      used,
      pending,
      balance,
    };
  }

  async getStats(employeeId: string, month: string = 'All', year: string = 'All') {
    const requests = await this.leaveRequestRepository.find({
      where: { employeeId },
    });

    // Filter requests based on selected period
    const filteredRequests = requests.filter((req: any) => {
      const dateToUse = req.submittedDate;
      if (!dateToUse) return false;
      
      let reqDateStr = '';
      if (dateToUse instanceof Date) {
        const y = dateToUse.getFullYear();
        const m = dateToUse.getMonth() + 1;
        reqDateStr = `${y}-${m < 10 ? '0' + m : m}`;
      } else {
        reqDateStr = String(dateToUse).substring(0, 10); // YYYY-MM-DD
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

      // Skip internal modification records, cancelled requests, and pending cancellation requests entirely from stats
      if (
        status === 'Request Modified' ||
        status === 'Cancelled'
      ) {
        return;
      }

      const target =
        req.requestType === 'Apply Leave'
          ? stats.leave
          : req.requestType === 'Work From Home'
            ? stats.wfh
            : req.requestType === 'Client Visit'
              ? stats.clientVisit
              : req.requestType === 'Half Day'
                ? stats.halfDay
                : null;

      if (!target) return;

      // Logic: Increment 'applied' for all valid non-cancelled/non-modified sessions
      // This keeps the big number at top-right representing active/valid applications
      if (status !== 'Cancellation Approved' && status !== 'Requesting for Cancellation') {
        target.applied++;
      }

      if (status === 'Approved' || status === 'Requesting for Cancellation') {
        target.approved++;
      } else if (status === 'Rejected') {
        target.rejected++;
      } else if (status === 'Cancellation Approved') {
        target.cancelled++;
      }
    });

    return stats;
  }

  async updateStatus(id: number, status: 'Approved' | 'Rejected' | 'Cancelled' | 'Cancellation Approved' | 'Modification Approved' | 'Modification Cancelled' | 'Modification Rejected', employeeId?: string, reviewedBy?: string, reviewerEmail?: string) {
    try {
      // Resolve Reviewer Email if it's an ID (no @ symbol)
      if (reviewerEmail && !reviewerEmail.includes('@')) {
          const reviewerEmp = await this.employeeDetailsRepository.findOne({ where: { employeeId: reviewerEmail } });
          if (reviewerEmp?.email) {
              reviewerEmail = reviewerEmp.email;
          }
      }
      
      // Fallback: If reviewerEmail still invalid, try looking up by reviewer name
      if (!reviewerEmail || !reviewerEmail.includes('@')) {
          if (reviewedBy) {
              const mgr = await this.employeeDetailsRepository.findOne({ where: { fullName: reviewedBy } });
              if (mgr?.email) {
                  reviewerEmail = mgr.email;
              }
          }

          // Final fallback for Admin
          if ((!reviewerEmail || !reviewerEmail.includes('@')) && (reviewedBy === 'Admin' || reviewedBy === 'ADMIN')) {
              reviewerEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
          }
      }

      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        throw new NotFoundException('Leave request not found');
      }

      // Status Logic
      const previousStatus = request.status;
      request.status = status;
      if (reviewedBy) {
        request.reviewedBy = reviewedBy;
      }
      // When an admin updates the status, we mark it as read for Admin
      request.isRead = true;
      // AND we mark it as "unread" (new update) for the Employee: false means unread
      request.isReadEmployee = false; 
      
      const savedRequest = await this.leaveRequestRepository.save(request);
      const attendanceUpdates: any[] = [];

      // --- AUTOMATION: Integrated Split-Day Approval Logic ---
      const reqType = request.requestType ? request.requestType.trim().toLowerCase() : '';
      
      // Handle Approval (Normal or Modification)
      if (status === 'Approved' || status === 'Modification Approved') {
          try {
              this.logger.log(`Processing Approval Automation for Request ID: ${id} (${reqType})`);
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
                       where: {
                          employeeId: request.employeeId,
                          workingDate: Between(startOfDay, endOfDay)
                       }
                   });

                   const halfDayStatus = typeof AttendanceStatus !== 'undefined' ? (AttendanceStatus as any).HALF_DAY : 'Half Day';
                   const fullDayStatus = typeof AttendanceStatus !== 'undefined' ? (AttendanceStatus as any).FULL_DAY : 'Full Day';

                   // Determine split-day statuses
                   // SIMPLIFIED: Read directly from the request's explicit columns
                   const firstHalf = request.firstHalf || 'Office';
                   const secondHalf = request.secondHalf || 'Office';
                   
                   // Calculate total hours using helper method
                   const calculatedHours = this.calculateTotalHours(firstHalf, secondHalf);
                   
                   // Determine derived status based on hours
                   let derivedStatus = fullDayStatus;
                   if (calculatedHours === 9) {
                       derivedStatus = fullDayStatus; // Both halves are work
                   } else if (calculatedHours === 6) {
                       derivedStatus = halfDayStatus; // One half work, one half leave
                   } else if (calculatedHours === 0) {
                       derivedStatus = 'Leave'; // Both halves are leave
                   }

                   if (!attendance) {
                       this.logger.log(`[APPROVAL_CREATE] Creating record for ${request.employeeId} on ${targetDate.format('YYYY-MM-DD')}`);
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
                       attendanceUpdates.push({
                           id: attendance.id,
                           employeeId: attendance.employeeId,
                           workingDate: targetDate.format('YYYY-MM-DD'),
                           status: attendance.status,
                           totalHours: attendance.totalHours,
                           firstHalf: attendance.firstHalf,
                           secondHalf: attendance.secondHalf,
                           sourceRequestId: attendance.sourceRequestId
                       });
                   } else {
                       this.logger.log(`[APPROVAL_UPDATE] Updating record ${attendance.id} for ${request.employeeId}`);
                       
                       await this.employeeAttendanceRepository
                          .createQueryBuilder()
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

                       attendanceUpdates.push({
                           id: attendance.id,
                           employeeId: request.employeeId,
                           workingDate: targetDate.format('YYYY-MM-DD'),
                           status: derivedStatus,
                           totalHours: calculatedHours,
                           firstHalf: firstHalf,
                           secondHalf: secondHalf,
                           sourceRequestId: request.id
                       });
                   }
              }
              // ... notification logic ...
          } catch (e) {
              this.logger.error(`Error in approval automation: ${e.message}`, e.stack);
          }
      }

      // --- CLEANUP: If Request is REJECTED/CANCELLED, clear sourceRequestId to unlock attendance ---
      // [VISIBILITY]: 'Cancellation Approved' is intentionally excluded here to be called explicitly via /clear-attendance
      if (status === 'Rejected' || status === 'Cancelled') {
          try {
              this.logger.log(`[SOURCE_REQUEST_CLEAR] ===== START CLEANUP (Automated) =====`);
              const query = this.employeeAttendanceRepository.createQueryBuilder().update(EmployeeAttendance);
              
              // Internal automation only clears sourceRequestId to unlock. 
              // Status wipe is reserved for explicit /clear-attendance call.
              query.set({ sourceRequestId: () => 'NULL' });

              query.where(new Brackets(qb => {
                  qb.where("sourceRequestId = :requestId", { requestId: id });

                  if (request.requestModifiedFrom && !isNaN(Number(request.requestModifiedFrom))) {
                      qb.orWhere("sourceRequestId = :parentId", { parentId: Number(request.requestModifiedFrom) });
                  }

                  if (status === 'Cancelled') {
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
              const affectedCount = result.affected ?? 0;
              this.logger.log(`[SOURCE_REQUEST_CLEAR] Successfully unlocked ${affectedCount} records for request ${id}`);
              
              // Add a summary to attendanceUpdates for visibility in response
              if (affectedCount > 0) {
                  attendanceUpdates.push({
                      action: 'UNLOCKED',
                      affectedCount: affectedCount,
                      message: `Unlocked attendance records for request ${id} (Status: ${status})`
                  });
              }
          } catch (err) {
              this.logger.error(`[SOURCE_REQUEST_CLEAR] ❌ ERROR Failed to unlock attendance for request ${id}:`, err);
          }
      }

      // --- Email Notification Logic ---
      try {
        const employee = await this.employeeDetailsRepository.findOne({ 
          where: { employeeId: request.employeeId } 
        });

        if (employee) {
          if (status === 'Cancelled' && previousStatus === 'Pending') {
            const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
            if (adminEmail) {
              const requestTypeLabel = request.requestType === 'Apply Leave' ? 'Leave' : request.requestType;
              const adminSubject = `Request Cancelled: ${requestTypeLabel} Request - ${employee.fullName}`;

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

              await this.emailService.sendEmail(adminEmail, adminSubject, `Request Cancelled by ${employee.fullName}`, adminHtml);
            }
          }

          if (employee.email) {
            const isCancellation = status === 'Cancellation Approved';
              const htmlContent = getStatusUpdateTemplate({
                employeeName: employee.fullName || 'Employee',
                requestType: request.requestType,
                title: request.title,
                fromDate: dayjs(request.fromDate).format('YYYY-MM-DD'),
                toDate: dayjs(request.toDate).format('YYYY-MM-DD'),
                duration: request.duration || 0,
                status: status as any,
                isCancellation: isCancellation,
                reviewedBy: status === 'Cancelled' && previousStatus === 'Pending' ? '' : request.reviewedBy,
                firstHalf: request.firstHalf,
                secondHalf: request.secondHalf
              });
    
            await this.emailService.sendEmail(
              employee.email,
              `${request.requestType} Request ${status}`,
              `Your request status: ${status}`,
              htmlContent,
            );
          }
        }
      } catch (error) {
        this.logger.error('Failed to send status update email:', error);
      }

      // --- NEW: Confirmation Email to Reviewer ---
      if (reviewerEmail && reviewerEmail.includes('@')) {
        try {
             const emp = await this.employeeDetailsRepository.findOne({ where: { employeeId: request.employeeId } });
             if (emp) {
                 let template;
                 let subject;
                 
                 if (status === 'Approved' || status === 'Modification Approved') {
                     template = getApprovalConfirmationTemplate;
                     subject = `Confirmation: You approved a request for ${emp.fullName}`;
                 } else if (status === 'Rejected' || status === 'Modification Rejected' || status === 'Modification Cancelled') {
                     template = getRejectionConfirmationTemplate;
                     subject = `Confirmation: You rejected a request for ${emp.fullName}`;
                 } else if (status === 'Cancellation Approved') {
                     template = getCancellationApprovalConfirmationTemplate;
                     subject = `Confirmation: You cancelled the approved ${request.requestType}`;
                 }

                 if (template) {
                     const htmlContent = template({
                         reviewerName: reviewedBy || 'Reviewer',
                         employeeName: emp.fullName,
                         employeeId: emp.employeeId,
                         requestType: request.requestType,
                         startDate: dayjs(request.fromDate).format('YYYY-MM-DD'),
                         endDate: dayjs(request.toDate).format('YYYY-MM-DD'),
                         duration: request.duration || 0,
                         dates: `${dayjs(request.fromDate).format('YYYY-MM-DD')} to ${dayjs(request.toDate).format('YYYY-MM-DD')}`,
                         reason: undefined,
                         firstHalf: request.firstHalf,
                         secondHalf: request.secondHalf
                     });
                     await this.emailService.sendEmail(reviewerEmail, subject, 'Request Status Confirmation', htmlContent);
                 }
             }
        } catch (error) {
             this.logger.error('Failed to send confirmation email to reviewer', error);
        }
      }

      const response = {
        message: `Request ${status} successfully`,
        status: status,
        id: id,
        employeeId: request.employeeId,
        requestType: request.requestType,
        updatedRequest: {
            id: savedRequest.id,
            status: savedRequest.status,
            reviewedBy: savedRequest.reviewedBy,
            submittedDate: savedRequest.submittedDate,
            firstHalf: savedRequest.firstHalf,
            secondHalf: savedRequest.secondHalf
        },
        attendanceUpdates: attendanceUpdates,
        attendanceUpdatesCount: attendanceUpdates.length,
        timestamp: new Date().toISOString()
      };

      this.logger.log(`[STATUS_UPDATE_SUCCESS] Request ${id} ${status}. Attendance updates: ${attendanceUpdates.length}`);
      return response;
    } catch (error) {
      this.logger.error(`Error updating leave request status for ID ${id}:`, error);
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) throw error;
      throw new HttpException(
        error.message || 'Failed to update leave request status',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * [NEW] Explicit Attendance Clearance API
   * Wipes attendance data for a cancelled request to make it visible in network logs.
   */
  async clearAttendanceForRequest(id: number) {
    const request = await this.leaveRequestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    try {
      this.logger.log(`[CLEAR_ATTENDANCE] Explicitly clearing attendance for request ${id}`);
      
      const query = this.employeeAttendanceRepository
          .createQueryBuilder()
          .update(EmployeeAttendance);
      
      // Wipe everything to revert to empty state
      query.set({ 
          status: () => 'NULL',
          totalHours: () => 'NULL',
          workLocation: () => 'NULL',
          sourceRequestId: () => 'NULL',
          firstHalf: () => 'NULL',
          secondHalf: () => 'NULL'
      });

      query.where(new Brackets(qb => {
          // 1. Target by specific sourceRequestId
          qb.where("sourceRequestId = :requestId", { requestId: id });

          // 2. Target by parent if this was a modification
          if (request.requestModifiedFrom && !isNaN(Number(request.requestModifiedFrom))) {
              qb.orWhere("sourceRequestId = :parentId", { parentId: Number(request.requestModifiedFrom) });
          }

          // 3. Target by date range as safety net for the employee
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
      return { 
        success: true, 
        affected: result.affected,
        employeeId: request.employeeId,
        clearedFields: ['status', 'totalHours', 'workLocation', 'sourceRequestId', 'firstHalf', 'secondHalf']
      };
    } catch (err) {
      this.logger.error(`[CLEAR_ATTENDANCE] ❌ ERROR Failed to clear attendance for request ${id}:`, err);
      throw new HttpException('Failed to clear attendance', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async createModification(id: number, data: any) {
    const parent = await this.leaveRequestRepository.findOne({ where: { id } });
    if (!parent) throw new NotFoundException('Original request not found');

    const modification = new LeaveRequest();
    modification.employeeId = parent.employeeId;
    modification.requestType = parent.requestType;
    modification.fromDate = data.fromDate;
    modification.toDate = data.toDate;
    modification.status = data.overrideStatus || 'Request Modified';
    modification.title = parent.title;
    const descPrefix = data.overrideStatus === 'Approved' ? 'Split Segment' : 'Request Modified';
    modification.description = `${descPrefix}: ${parent.description || ''} (Modification due to ${data.sourceRequestType} conflict)`;
    modification.submittedDate = new Date().toISOString().slice(0, 10);
    modification.isRead = true;
    modification.isReadEmployee = false;
    modification.duration = data.duration || (dayjs(data.toDate).diff(dayjs(data.fromDate), 'day') + 1);
    modification.requestModifiedFrom = data.overrideStatus === 'Approved' ? parent.requestModifiedFrom : data.sourceRequestType;

    const savedModification = await this.leaveRequestRepository.save(modification);
    
    // Copy documents from the parent request to this new modification record
    await this.copyRequestDocuments(parent.id, savedModification.id);

    // --- Notify Manager via App Notification ---
    if (modification.status === 'Requesting for Modification') {
        try {
            const mapping = await this.managerMappingRepository.findOne({ where: { employeeId: parent.employeeId, status: 'ACTIVE' as any } });
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
            this.logger.error(`Failed to create app notification for manager: ${e.message}`);
        }
    }

    return savedModification;
  }

  // NEW: Dedicated API for Rejecting Cancellation
  async rejectCancellation(id: number, employeeId: string, reviewedBy?: string, reviewerEmail?: string) {
    // Resolve Reviewer Email if it's an ID
    if (reviewerEmail && !reviewerEmail.includes('@')) {
        const reviewerEmp = await this.employeeDetailsRepository.findOne({ where: { employeeId: reviewerEmail } });
        if (reviewerEmp?.email) {
            reviewerEmail = reviewerEmp.email;
        }
    }


    // Fallback: IfReviewedBy is NOT an email, try to resolve via fullName or admin fallback
    if (!reviewerEmail || !reviewerEmail.includes('@')) {
        // Try lookup by fullName (reviewedBy)
        if (reviewedBy) {
            const mgr = await this.employeeDetailsRepository.findOne({ where: { fullName: reviewedBy } });
            if (mgr?.email) {
                reviewerEmail = mgr.email;
            }
        }
        
        // Final fallback for Admin
        if ((!reviewerEmail || !reviewerEmail.includes('@')) && (reviewedBy === 'Admin' || reviewedBy === 'ADMIN')) {
            reviewerEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
        }
    }

    const request = await this.leaveRequestRepository.findOne({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(`Leave request with ID ${id} not found`);
    }

    // Format dates strictly to YYYY-MM-DD
    const checkStart = dayjs(request.fromDate).format('YYYY-MM-DD');
    const checkEnd = dayjs(request.toDate).format('YYYY-MM-DD');

    // Use QueryBuilder for definitive DB-level overlap check
    const overlapCount = await this.leaveRequestRepository
      .createQueryBuilder('lr')
      .where('lr.employeeId = :employeeId', { employeeId: request.employeeId })
      .andWhere('lr.id != :id', { id: request.id })
      .andWhere('lr.status = :status', { status: 'Approved' })
      .andWhere('DATE(lr.fromDate) <= DATE(:checkEnd)', { checkEnd })
      .andWhere('DATE(lr.toDate) >= DATE(:checkStart)', { checkStart })
      .getCount();

    if (overlapCount > 0) {
      // Case A: Partial Cancellation Rejection (Child Result)
      // Action: Mark this child request as REJECTED.
      // Note: We do NOT restore duration to Parent because we never subtracted it in the first place (see cancelApprovedDates).
      
      // Mark as CANCELLATION REJECTED
      request.status = 'Cancellation Rejected';
    } else {
      // Case B: Full Cancellation (Master)
      // Revert to 'Approved'
      request.status = 'Approved';
    }

    // We don't overwrite title anymore

    // Mark as Unread for Employee so they get a notification
    request.isReadEmployee = false;
    if (reviewedBy) {
      request.reviewedBy = reviewedBy;
    }
    await this.leaveRequestRepository.save(request);

    // Send Notification
    try {
      const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId } });
      const employeeName = employee ? employee.fullName : 'Employee';
      const toEmail = employee && employee.email ? employee.email : (request.employeeId + '@inventechinfo.com');

      const emailSubject = `${request.requestType} Request Cancellation Rejected`;
      const headerTitle = `${request.requestType} Request Cancellation`;
      const mainMessage = `Your request to cancel <strong>${request.requestType}</strong> has been <strong>Rejected</strong>.`;
      const displayStatus = 'Cancellation Rejected';
      const statusColor = '#dc3545'; // Red

      const emailBody = getStatusUpdateTemplate({
        employeeName: employeeName,
        requestType: request.requestType,
        title: request.title,
        fromDate: checkStart,
        toDate: checkEnd,
        duration: request.duration || 0,
        status: 'Cancellation Rejected',
        isCancellation: true,
        reviewedBy: request.reviewedBy
      });
      // Override status label if needed or just use Rejected
      
      await this.emailService.sendEmail(
        toEmail,
        emailSubject,
        'Your cancellation request was rejected.',
        emailBody,
      );
    } catch (e) {
      console.error('Failed to send rejection email', e);
    }

    // --- NEW: Confirmation Email to Reviewer ---
    // --- NEW: Confirmation Email to Reviewer ---
    if (reviewerEmail && reviewerEmail.includes('@')) {
        try {
            const emp = await this.employeeDetailsRepository.findOne({ where: { employeeId: request.employeeId } });
            if (emp) {
                const checkStart = dayjs(request.fromDate).format('YYYY-MM-DD');
                const checkEnd = dayjs(request.toDate).format('YYYY-MM-DD');
            
                const subject = `Confirmation: Cancellation Rejected for ${emp.fullName}`;
                const htmlContent = getCancellationRejectionConfirmationTemplate({
                    reviewerName: reviewedBy || 'Reviewer',
                    employeeName: emp.fullName,
                    requestType: request.requestType,
                    dates: `${checkStart} to ${checkEnd}`,
                    // reason: request.description -- description is the cancellation reason, not rejection reason.
                    reason: undefined
                });

                await this.emailService.sendEmail(
                    reviewerEmail,
                    subject,
                    'Cancellation Rejection Confirmation',
                    htmlContent
                );
                this.logger.log(`Cancellation rejection confirmation sent to reviewer: ${reviewerEmail}`);
            }
        } catch (error) {
           this.logger.error('Failed to send cancellation rejection confirmation', error);
        }
    }

    return request;
  }

  // Helper to revert attendance for the given range (when cancellation is approved)
  private async revertAttendance(
    employeeId: string,
    fromDate: string,
    toDate: string,
  ) {
    try {
      // Use dayjs for consistent date handling
      // Using strings for Between query on DATE column is safer and works in TypeORM/MySQL
      const startStr = dayjs(fromDate).format('YYYY-MM-DD');
      const endStr = dayjs(toDate).format('YYYY-MM-DD');

      this.logger.log(`Reverting attendance for ${employeeId} from ${startStr} to ${endStr}`);

      const records = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(startStr as any, endStr as any),
        },
      });

      for (const record of records) {
        // Reset the record to 'empty' state
        record.status = null;
        record.totalHours = null;
        record.workLocation = null;
        record.sourceRequestId = null;
        // We do NOT delete it, just reset it, as per requirements
        await this.employeeAttendanceRepository.save(record);
      }
      this.logger.log(
        `Reverted ${records.length} attendance records for ${employeeId} (${fromDate} to ${toDate})`,
      );
    } catch (e) {
      this.logger.error(`Failed to revert attendance for ${employeeId}`, e);
      // Don't throw, allow the status update to proceed, but log error
    }
  }

  async updateParentRequest(
    parentId: number,
    duration: number,
    fromDate: string,
    toDate: string,
  ) {
    this.logger.log(`updateParentRequest called with: parentId=${parentId}, duration=${duration}, fromDate=${fromDate}, toDate=${toDate}`);

    try {
      if (!parentId) throw new BadRequestException('Parent ID is required');
      if (!fromDate) throw new BadRequestException('From Date is required');
      if (!toDate) throw new BadRequestException('To Date is required');

      const parentRequest = await this.leaveRequestRepository.findOne({
        where: { id: parentId },
      });
      if (!parentRequest) throw new NotFoundException('Parent Request not found');

      parentRequest.duration = duration;
      parentRequest.fromDate = dayjs(fromDate).format('YYYY-MM-DD');
      parentRequest.toDate = dayjs(toDate).format('YYYY-MM-DD');

      return await this.leaveRequestRepository.save(parentRequest);
    } catch (error) {
      this.logger.error(`Failed to update parent request: ${error.message}`, error.stack);
      // Re-throw as HttpException to expose message to client for debugging
      throw new HttpException(
        `Update Failed: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async cancelApprovedRequest(id: number, employeeId: string) {
    const request = await this.leaveRequestRepository.findOne({
      where: { id, employeeId },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== 'Approved') {
      throw new ForbiddenException(
        'Only approved requests can be cancelled via this action',
      );
    }

    // Time Constraint: Allow cancel if NOW is before 10:00 AM of the fromDate (OR if fromDate is in future)
    // Parse fromDate (YYYY-MM-DD)
    const dateParts = request.fromDate.toString().split('-'); // [YYYY, MM, DD]
    // Use local time construction
    const leaveStart = new Date(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
      10,
      0,
      0, // 10 AM on that day
    );

    const now = new Date();

    // If we are strictly checking "next date 10 am" rule:
    // This allows cancellation up until 10 AM on the start Day.
    if (now > leaveStart) {
      // If strict business rule says "cannot cancel after start", then block.
      // User requirement: "latter apter approval dates next date 10 am teill then an cancel bt should be enabel"
      // We interpret this as 10 AM on the start date.
      throw new ForbiddenException(
        'Cannot cancel request after 10 AM on the start date.',
      );
    }

    // 1. Update Status
    request.status = 'Requesting for Cancellation';
    request.isRead = false; // Mark unread for Admin
    request.isReadEmployee = true;

    // 2. Save
    await this.leaveRequestRepository.save(request);

    // 3. Notify Admin
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
      });
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;

      if (employee && adminEmail) {
        const subject = `Cancellation Requested: ${request.requestType} - ${employee.fullName}`;
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

        await this.emailService.sendEmail(
          adminEmail,
          subject,
          'Cancellation Requested',
          htmlContent,
        );
      } else {
        this.logger.warn(`Employee NOT FOUND or Admin Email missing for ID: ${request.employeeId}. Cannot send notification.`);
      }
    } catch (error) {
      this.logger.error('Failed to send status update email:', error);
    }

    // 4. Notify Manager
    await this.notifyManagerOfRequest(request);

    // 5. Notify Employee (Submission Receipt)
    await this.notifyEmployeeOfSubmission(request);

    return request;
  }

  async findEmployeeUpdates(employeeId: string) {
    return this.leaveRequestRepository.find({
      where: { 
        employeeId, 
        isReadEmployee: false, // Fetch unread updates
        status: In(['Approved', 'Rejected', 'Cancellation Approved', 'Cancelled', 'Request Modified', 'Cancellation Rejected', 'Modification Approved', 'Modification Rejected', 'Modification Cancelled'])
      },
      order: { createdAt: 'DESC' }
    });
  }

  async markEmployeeUpdateRead(id: number) {
    return this.leaveRequestRepository.update({ id }, { isReadEmployee: true });
  }

  async uploadDocument(
    documents: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    try {
      this.logger.log(`Uploading ${documents.length} document(s) for leave request ${entityId}`);
      
      const uploadPromises = documents.map(async (doc) => {
        const details = new DocumentMetaInfo();
        details.refId = refId;
        details.refType = refType;
        details.entityId = entityId;
        details.entityType = entityType;

        return await this.documentUploaderService.uploadImage(doc, details);
      });

      const results = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${results.length} document(s)`);
      
      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error) {
      this.logger.error(`Error uploading documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error uploading documents');
    }
  }

  async getAllFiles(entityType: EntityType, entityId: number, refId: number, referenceType: ReferenceType) {
    this.logger.log(`Getting all files for entity ${entityType} with ID ${entityId}`);
    return await this.documentUploaderService.getAllDocs(entityType, entityId, referenceType, refId);
  }

  private async notifyManagerOfRequest(request: LeaveRequest) {
    try {
      const mapping = await this.managerMappingRepository.findOne({
        where: { employeeId: request.employeeId, status: 'ACTIVE' as any }
      });

      if (mapping) {
        const manager = await this.userRepository.findOne({
          where: { aliasLoginName: mapping.managerName }
        });

        if (manager) {
          const actionText = request.status === 'Requesting for Cancellation' ? 'Cancellation' : request.status === 'Cancelled' ? 'Reverted' : 'New';
          // Use "Modification" for email subject if applicable, but keep bell-icon as "New" per user preference
          const emailActionText = request.status === 'Requesting for Modification' ? 'Modification' : actionText;
          
          // 1. Bell Icon Notification
          await this.notificationsService.createNotification({
            employeeId: manager.loginId,
            title: `${actionText} ${request.requestType} Request`,
            message: `${mapping.employeeName} has submitted ${actionText === 'New' ? 'a new' : 'a'} ${request.requestType} titled "${request.title}".`,
            type: 'alert'
          });

          // 2. Email Notification to Manager
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
          }
          
          this.logger.log(`Notification & Email sent to manager ${mapping.managerName} for request ${request.id}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to send manager notification', error);
    }
  }

  private async notifyEmployeeOfSubmission(request: LeaveRequest) {
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
      }
    } catch (error) {
      this.logger.error(`Failed to send submission receipt to employee ${request.employeeId}`, error);
    }
  }

  async deleteDocument(entityType: EntityType, entityId: number, refId: number, key: string) {
    try {
      this.logger.log(`Deleting document with key ${key} for entity ${entityId}`);
      await this.validateEntity(entityType, entityId, refId);
      await this.documentUploaderService.deleteDoc(key);
      
      return {
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting document: ${error.message}`, error.stack);
      throw error;
    }
  }

  async validateEntity(entityType: EntityType, entityId: number, refId: number) {
    if (entityType === EntityType.LEAVE_REQUEST) {
      if (refId !== 0) {
        const leaveRequest = await this.leaveRequestRepository.findOne({ where: { id: refId } });
        if (!leaveRequest) {
          throw new HttpException(`Leave request with ID ${refId} not found`, HttpStatus.NOT_FOUND);
        }
      }
    }
  }

  async markAllEmployeeUpdatesRead(employeeId: string) {
    return this.leaveRequestRepository.update(
      { employeeId, isReadEmployee: false },
      { isReadEmployee: true }
    );
  }

  async findMonthlyRequests(month: string, year: string, employeeId?: string, status?: string, page: number = 1, limit: number = 10) {
    return this.findUnifiedRequests({ month, year, employeeId, status, page, limit });
  }

  async modifyRequest(id: number, employeeId: string, updateData: { title?: string; description?: string; firstHalf?: string; secondHalf?: string; datesToModify?: string[] }) {
    this.logger.log(`[MODIFY_REQUEST] Modifying request ${id} for employee ${employeeId}`);
    const request = await this.leaveRequestRepository.findOne({ where: { id, employeeId } });
    if (!request) throw new NotFoundException('Request not found or access denied');
    if (!['Pending', 'Approved'].includes(request.status)) throw new BadRequestException('Only Pending or Approved requests can be modified');

    // Handle Partial Modification for Approved Requests
    if (updateData.datesToModify && updateData.datesToModify.length > 0) {
      if (request.status === 'Approved') {
         return this.modifyApprovedDates(id, employeeId, updateData.datesToModify, updateData);
      } else if (request.status === 'Pending') {
         // Check if datesToModify covers the entire duration
         const startDate = dayjs(request.fromDate);
         const endDate = dayjs(request.toDate);
         const totalDays = endDate.diff(startDate, 'day') + 1;
         if (updateData.datesToModify.length !== totalDays) {
             throw new BadRequestException('Partial modification is only allowed for Approved requests. For Pending requests, please edit the entire request.');
         }
         // If full dates selected, proceed to normal update below
      }
    }
    
    // Normal / Full Update Logic
    const updatedData: Partial<LeaveRequest> = { isModified: true, modificationCount: (request.modificationCount || 0) + 1, lastModifiedDate: new Date() };
    if (updateData.title !== undefined) updatedData.title = updateData.title;
    if (updateData.description !== undefined) updatedData.description = updateData.description;
    
    // If request was Approved and we are doing a FULL update via this path, 
    // we normally shouldn't change the status to Pending unless we want re-approval.
    // However, existing logic didn't change status. 
    // Requirement says: "Requesting for Modification" status.
    // If this is a full modification of an Approved request, maybe we should also set status to "Requesting for Modification"?
    // The previous implementation presumably relied on Admin editing it directly? 
    // Or if Employee edits, it stays Approved? That seems wrong if details change.
    // Let's set status to 'Requesting for Modification' if it was Approved.
    if (request.status === 'Approved') {
        updatedData.status = 'Requesting for Modification';
        updatedData.isRead = false; // Notify admin
    }

    if (updateData.firstHalf !== undefined) updatedData.firstHalf = updateData.firstHalf;
    if (updateData.secondHalf !== undefined) updatedData.secondHalf = updateData.secondHalf;
    
    if (updateData.firstHalf || updateData.secondHalf) {
      const newFirstHalf = updateData.firstHalf || request.firstHalf || request.requestType;
      const newSecondHalf = updateData.secondHalf || request.secondHalf || request.requestType;
      if (newFirstHalf === newSecondHalf) {
        updatedData.requestType = newFirstHalf;
        updatedData.isHalfDay = false;
      } else {
        const parts = [newFirstHalf, newSecondHalf].filter(h => h && h !== 'Office');
        updatedData.requestType = parts.join(' + ');
        updatedData.isHalfDay = true;
      }
    }
    
    await this.leaveRequestRepository.update({ id }, updatedData);
    const modifiedRequest = await this.leaveRequestRepository.findOne({ where: { id } });
    
    // Notify Admin/Manager if status changed to Requesting for Modification
    if (updatedData.status === 'Requesting for Modification') {
        const fullReq = await this.leaveRequestRepository.findOne({ where: { id } });
        if (fullReq) {
             // For modification requests, notify both Manager/Admin AND the Employee
             await this.notifyAdminOfCancellationRequest(fullReq, employeeId); 
             await this.notifyManagerOfRequest(fullReq);
             
             // Reuse notification template for Employee as well
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
                    await this.emailService.sendEmail(
                        employee.email,
                        `Submission Received: Modification Request (${fullReq.requestType})`,
                        'Modification Request Notification',
                        htmlContent
                    );
                }
             } catch (e) {
                 this.logger.error('Failed to notify employee of modification request submission', e);
             }
        }
    }

    this.logger.log(`[MODIFY_REQUEST] Successfully modified request ${id}. Modification count: ${modifiedRequest?.modificationCount}`);
    return { success: true, modifiedRequest, message: 'Request modified successfully' };
  }

  async modifyApprovedDates(
    id: number,
    employeeId: string,
    datesToModify: string[],
    updateData: { title?: string; description?: string; firstHalf?: string; secondHalf?: string }
  ) {
    const request = await this.leaveRequestRepository.findOne({
      where: { id, employeeId },
    });
    if (!request) throw new NotFoundException('Request not found');
    
    // Group dates into ranges (Copied from cancelApprovedDates logic)
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
          if (!hasWorkDayGap) {
            isConsecutive = true;
          }
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
        // Calculate request type based on new halves
        let newRequestType = request.requestType;
        let isHalfDay = request.isHalfDay;
        
        const fHalf = updateData.firstHalf || request.firstHalf || 'Office';
        const sHalf = updateData.secondHalf || request.secondHalf || 'Office';
        
        if (fHalf === sHalf) {
            newRequestType = fHalf;
            isHalfDay = false;
        } else {
            const parts = [fHalf, sHalf].filter(h => h && h !== 'Office');
            newRequestType = parts.join(' + ');
            isHalfDay = true;
        }
        
        const newRequest = this.leaveRequestRepository.create({
          ...request,
          id: undefined,
          fromDate: range.start,
          toDate: range.end,
          status: 'Requesting for Modification',
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
          requestModifiedFrom: request.id.toString(), // Link to parent
          isModified: true,
          modificationCount: 1,
          lastModifiedDate: new Date()
        });
        
        const savedNew = await this.leaveRequestRepository.save(newRequest);
        await this.copyRequestDocuments(request.id, savedNew.id);
        createdRequests.push(savedNew);

        // Notifications
        // We can reuse notifyAdminOfCancellationRequest but functionality is different. 
        // Ideally we should have notifyAdminOfModificationRequest. 
        // For now, reusing generic notification logic via notifyManagerOfRequest which seems to handle status text.
        await this.notifyManagerOfRequest(savedNew);
        // Ensure notifyEmployeeOfSubmission includes split-day info if possible 
        // (will need to check notifyEmployeeOfSubmission definition)
        await this.notifyEmployeeOfSubmission(savedNew);
    }
    
    // We do NOT modify the original request duration/dates yet. 
    // It stays as 'Approved' overlapping until the modification is approved.
    
    return { success: true, modifiedRequests: createdRequests, message: 'Modification requests created successfully' };
  }

  async undoModificationRequest(id: number, employeeId: string) {
    const request = await this.leaveRequestRepository.findOne({ where: { id, employeeId } });
    if (!request) throw new NotFoundException('Request not found');

    if (request.status !== 'Requesting for Modification') {
        throw new BadRequestException('Only requests with status "Requesting for Modification" can be undone.');
    }

    // Set status to Modification Cancelled (as per user requirement for Undo)
    request.status = 'Modification Cancelled'; 
    // We might want to track who cancelled it, but for undo it's the employee
    
    await this.leaveRequestRepository.save(request);

    return { success: true, message: 'Modification request undone successfully' };
  }

  async getMonthlyLeaveBalance(employeeId: string, month: number, year: number) {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId },
      select: ['id', 'employeeId', 'designation', 'employmentType', 'joiningDate', 'conversionDate'],
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const isIntern =
      employee.employmentType === EmploymentType.INTERN ||
      (employee.designation || '').toLowerCase().includes('intern');

    let runningBalance = 0;
    let ytdUsed = 0;
    let ytdLop = 0;

    const targetMonthStats = {
      carryOver: 0,
      monthlyAccrual: 0,
      leavesTaken: 0,
      lop: 0,
      balance: 0,
      ytdUsed: 0,
      ytdLop: 0,
    };

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
        // Determine status for this specific month
        let isInternThisMonth = isIntern;
        const convDate = (employee as any).conversionDate ? dayjs((employee as any).conversionDate) : null;
        if (convDate && convDate.isValid()) {
            const convMonth = convDate.month() + 1;
            const convYear = convDate.year();
            if (curYear > convYear || (curYear === convYear && m >= convMonth)) {
                isInternThisMonth = false;
                if (curYear === convYear && m === convMonth && convDate.date() > 10) {
                    isInternThisMonth = true;
                }
            } else {
                isInternThisMonth = true;
            }
        }

        if (curYear === year && m === month) {
          targetMonthStats.carryOver = runningBalance;
        }

        let effectiveAccrual = isInternThisMonth ? 1.0 : 1.5;
        if (curYear === joinYear && m === joinMonth && joinDate.date() > 10) {
          effectiveAccrual = 0;
        }

        runningBalance += effectiveAccrual;

        if (curYear === year && m === month) {
          targetMonthStats.monthlyAccrual = effectiveAccrual;
        }

        const attendance = attendanceMap.get(`${curYear}-${m}`) || [];
        const monthlyUsage = attendance.reduce((acc, rec) => {
          let dailyUsage = 0;
          const status = (rec.status || '').toLowerCase();
          if (rec.firstHalf || rec.secondHalf) {
            const processHalf = (half: string | null) => {
              if (!half) return 0;
              const h = half.toLowerCase();
              return (h.includes('leave') || h.includes('absent')) ? 0.5 : 0;
            };
            dailyUsage = processHalf(rec.firstHalf) + processHalf(rec.secondHalf);
          } else {
            if (status.includes('leave') || status.includes('absent')) {
              dailyUsage = 1;
            } else if (status.includes('half day')) {
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

        // Interns do not carry over unused leaves to next month or to full-timer status
        if (isInternThisMonth) {
          runningBalance = 0;
        }
      }
    }

    return targetMonthStats;
  }
}
