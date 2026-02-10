import { Injectable, ConflictException, ForbiddenException, NotFoundException, Logger, InternalServerErrorException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In, Brackets, Between } from 'typeorm';
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
  getEmployeeReceiptTemplate
} from '../../common/mail/templates';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationsService } from '../../notifications/Services/notifications.service';

@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

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
    private emailService: EmailService,
    private documentUploaderService: DocumentUploaderService,
    private notificationsService: NotificationsService,
  ) {}

  async create(data: Partial<LeaveRequest>) {
    const METHOD = 'create';
    this.logger.log(`[${METHOD}] Started creating request for employee: ${data.employeeId} (${data.requestType})`);

    try {
      // STEP 1: Conflict Check
      if (data.fromDate && data.toDate && data.requestType) {
        this.logger.debug(`[${METHOD}][STEP 1] Checking for overlapping dates for type: ${data.requestType}`);
        const requestType = data.requestType;
        
        // Define which request types can overlap with each other
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
        
        if (conflictingTypes.length > 0) {
          const existingLeave = await this.leaveRequestRepository.findOne({
            where: {
              employeeId: data.employeeId,
              fromDate: LessThanOrEqual(data.toDate),
              toDate: MoreThanOrEqual(data.fromDate),
              status: In(['Pending', 'Approved', 'Cancellation Rejected']),
              requestType: In(conflictingTypes),
            },
          });

          if (existingLeave) {
            this.logger.warn(`[${METHOD}][STEP 1] Conflict found with request ID: ${existingLeave.id}`);
            throw new ConflictException(
              `Leave request already exists for the selected date range (${existingLeave.fromDate} to ${existingLeave.toDate})`,
            );
          }
        }
      }

      // STEP 2: Prep Data
      this.logger.debug(`[${METHOD}][STEP 2] Preparing request data (dates, duration)...`);
      if (!data.submittedDate) {
        const now = new Date();
        data.submittedDate = now.toISOString().split('T')[0];
      }

      if (data.fromDate && data.toDate && (data.duration === undefined || data.duration === null || data.duration === 0)) {
        const start = new Date(data.fromDate);
        const end = new Date(data.toDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        data.duration = days;
      }

      // STEP 3: Save Request
      this.logger.debug(`[${METHOD}][STEP 3] Persisting leave request to database...`);
      const savedRequest = await this.leaveRequestRepository.save(data);
      this.logger.log(`[${METHOD}] Successfully saved request ID: ${savedRequest.id}`);

      // STEP 4: Admin Notifications
      this.logger.debug(`[${METHOD}][STEP 4] Processing admin and manager notifications...`);
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
            fromDate: data.fromDate || '',
            toDate: data.toDate || '',
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
            this.logger.log(`[${METHOD}][STEP 4] Admin notification sent to ${adminEmail}`);
          }
        }
      } catch (error) {
        this.logger.error(`[${METHOD}][STEP 4] Failed to send admin notification: ${error.message}`);
      }

      // STEP 5: Link Documents
      this.logger.debug(`[${METHOD}][STEP 5] Linking uploaded documents...`);
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
          this.logger.log(`[${METHOD}][STEP 5] Linked ${updateResult.affected} orphaned documents`);
        }
      } catch (error) {
        this.logger.error(`[${METHOD}][STEP 5] Failed to link documents: ${error.message}`);
      }

      // STEP 6: Other Notifications
      this.logger.debug(`[${METHOD}][STEP 6] Sending manager notification and submission receipt...`);
      await this.notifyManagerOfRequest(savedRequest);
      await this.notifyEmployeeOfSubmission(savedRequest);

      this.logger.log(`[${METHOD}] Creation completed for request ID: ${savedRequest.id}`);
      return savedRequest;
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to create request: ${error.message}`, error.stack);
      if (error instanceof HttpException || error instanceof ConflictException) throw error;
      throw new HttpException('Failed to create leave request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
    const METHOD = 'findUnifiedRequests';
    const { employeeId, department, status, search, month = 'All', year = 'All', page = 1, limit = 10, managerName, managerId } = filters;
    this.logger.log(`[${METHOD}] Fetching requests (Search: "${search}", Page: ${page})`);

    try {
      // STEP 1: Build Query
      this.logger.debug(`[${METHOD}][STEP 1] Building query...`);
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
          'lr.request_modified_from AS requestModifiedFrom',
          'ed.department AS department',
          'ed.fullName AS fullName'
        ]);

      // STEP 2: Apply Filters
      this.logger.debug(`[${METHOD}][STEP 2] Applying filters...`);
      
      // 1. Employee Filter
      if (employeeId) {
        query.andWhere('lr.employeeId = :employeeId', { employeeId });
      }

      // 2. Manager Filter
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

      // 6. Date Boundaries
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

      // STEP 3: Execute & Paginate
      this.logger.debug(`[${METHOD}][STEP 3] Executing query and counting total...`);
      const total = await query.getCount();

      const data = await query
        .addSelect(`CASE 
          WHEN lr.status = 'Pending' THEN 1 
          WHEN lr.status = 'Requesting for Cancellation' THEN 2
          WHEN lr.status = 'Approved' THEN 3
          WHEN lr.status = 'Cancellation Approved' THEN 4
          WHEN lr.status = 'Cancellation Rejected' THEN 5
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

      this.logger.log(`[${METHOD}] Successfully found ${data.length} requests (out of ${total} total)`);
      return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
       this.logger.error(`[${METHOD}] Failed to fetch requests: ${error.message}`, error.stack);
       if (error instanceof HttpException) throw error;
       throw new HttpException('Failed to fetch leave requests', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll(department?: string, status?: string, search?: string, page: number = 1, limit: number = 10, managerName?: string, managerId?: string) {
    return this.findUnifiedRequests({ department, status, search, page, limit, managerName, managerId });
  }

  async findByEmployeeId(employeeId: string, status?: string, page: number = 1, limit: number = 10) {
    return this.findUnifiedRequests({ employeeId, status, page, limit });
  }

  async findOne(id: number) {
    const METHOD = 'findOne';
    this.logger.log(`[${METHOD}] Fetching leave request ID: ${id}`);
    
    try {
      this.logger.debug(`[${METHOD}] Querying database with employee details join...`);
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
          'lr.request_modified_from AS requestModifiedFrom',
          'ed.department AS department',
          'ed.fullName AS fullName'
        ])
        .getRawOne();

      if (!result) {
        this.logger.warn(`[${METHOD}] Leave request with ID ${id} not found`);
        throw new NotFoundException(`Leave request with ID ${id} not found`);
      }

      this.logger.log(`[${METHOD}] Found request ID: ${result.id} for employee: ${result.fullName}`);
      return result;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching request: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch request details', HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
        'lr.request_modified_from AS requestModifiedFrom',
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
      const dayOfWeek = currentDate.day();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
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

      // Rule: Cancel allowed until 12:00 PM (12:00) of the SAME day
      // Deadline = CurrentDate at 12:00:00
      const deadline = currentDate
        .hour(12)
        .minute(0)
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
    const METHOD = 'cancelApprovedDates';
    this.logger.log(`[${METHOD}] Request to cancel dates for request ${id} (Employee: ${employeeId})`);

    try {
      // STEP 1: Fetch and Validate Request
      this.logger.debug(`[${METHOD}][STEP 1] Fetching request...`);
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request) throw new NotFoundException('Request not found');
      if (request.status !== 'Approved')
        throw new ForbiddenException('Request must be approved');

      if (!datesToCancel || datesToCancel.length === 0) {
        this.logger.warn(`[${METHOD}] No dates provided for cancellation`);
        throw new BadRequestException('No dates provided');
      }

      // STEP 2: Validate Timing Deadlines
      this.logger.debug(`[${METHOD}][STEP 2] Validating cancellation deadlines...`);
      const now = dayjs();
      for (const dateStr of datesToCancel) {
        const targetDate = dayjs(dateStr);
        const deadline = targetDate.hour(12).minute(0).second(0);
        if (now.isAfter(deadline)) {
          this.logger.warn(`[${METHOD}][STEP 2] Deadline passed for date: ${dateStr}`);
          throw new ForbiddenException(
            `Cancellation deadline passed for ${dateStr}. Cutoff was ${deadline.format('YYYY-MM-DD HH:mm')}`,
          );
        }
      }

      // STEP 3: Determine Full or Partial Cancellation
      const startDate = dayjs(request.fromDate);
      const endDate = dayjs(request.toDate);
      const totalDays = endDate.diff(startDate, 'day') + 1;

      if (datesToCancel.length === totalDays) {
        // FULL CANCEL
        this.logger.log(`[${METHOD}] Processing FULL cancellation for request ${id}`);
        request.status = 'Requesting for Cancellation';
        request.isRead = false;
        request.isReadEmployee = true;
        const saved = await this.leaveRequestRepository.save(request);
        
        this.logger.debug(`[${METHOD}] Sending notifications...`);
        await this.notifyAdminOfCancellationRequest(saved, employeeId);
        await this.notifyManagerOfRequest(saved);
        
        return saved;
      } else {
        // PARTIAL CANCEL
        this.logger.log(`[${METHOD}] Processing PARTIAL cancellation for request ${id} (${datesToCancel.length} dates)`);
        
        // Group non-contiguous dates into ranges
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
              const day = temp.day();
              if (day !== 0 && day !== 6) { 
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
        this.logger.debug(`[${METHOD}] Grouped dates into ${ranges.length} ranges`);

        const createdRequests: LeaveRequest[] = [];

        for (const range of ranges) {
          this.logger.debug(`[${METHOD}] Creating cancellation record for range: ${range.start} to ${range.end}`);
          const newRequest = this.leaveRequestRepository.create({
            ...request,
            id: undefined, 
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
          await this.copyRequestDocuments(request.id, savedNew.id);
          createdRequests.push(savedNew);

          await this.notifyAdminOfCancellationRequest(savedNew, employeeId, range.count);
          await this.notifyManagerOfRequest(savedNew);
          await this.notifyEmployeeOfSubmission(savedNew);
        }

        this.logger.log(`[${METHOD}] Partial cancellation completed. Created ${createdRequests.length} sub-requests.`);
        return createdRequests.length === 1 ? createdRequests[0] : createdRequests;
      }
    } catch (error) {
      this.logger.error(`[${METHOD}] Error cancelling dates: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error processing cancellation', HttpStatus.INTERNAL_SERVER_ERROR);
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
            fromDate: request.fromDate,
            toDate: request.toDate,
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
      masterRequest.duration =
        (masterRequest.duration || 0) + (request.duration || 0);
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
    const METHOD = 'remove';
    this.logger.log(`[${METHOD}] Request to remove/revert request ID: ${id}`);

    try {
      this.logger.debug(`[${METHOD}] Fetching request...`);
      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        this.logger.warn(`[${METHOD}] Request ${id} not found`);
        throw new NotFoundException('Leave request not found');
      }
      if (request.status !== 'Pending') {
        this.logger.warn(`[${METHOD}] Request ${id} is not pending (status: ${request.status})`);
        throw new ForbiddenException('Only pending leave requests can be deleted');
      }

      // STEP 1: Notify Admin
      this.logger.debug(`[${METHOD}][STEP 1] Notifying admin of revert...`);
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });

        if (employee) {
          const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
          if (adminEmail) {
            const requestTypeLabel = request.requestType === 'Apply Leave' ? 'Leave' : request.requestType;
            const htmlContent = getCancellationTemplate({
              employeeName: employee.fullName,
              employeeId: employee.employeeId,
              requestType: requestTypeLabel,
              title: request.title || 'No Title',
              fromDate: request.fromDate,
              toDate: request.toDate,
              duration: request.duration || 0,
              reason: request.description,
              actionType: 'revert_back'
            });

            await this.emailService.sendEmail(adminEmail, `Request Reverted Back: ${requestTypeLabel} - ${employee.fullName}`, `Request Reverted Back`, htmlContent);
          }
        }
      } catch (error) {
        this.logger.error(`[${METHOD}][STEP 1] Failed to send notification: ${error.message}`);
      }

      // STEP 2: Mark as Cancelled
      this.logger.debug(`[${METHOD}][STEP 2] Updating status to Cancelled...`);
      request.status = 'Cancelled';
      request.isRead = false; 
      const saved = await this.leaveRequestRepository.save(request);

      this.logger.log(`[${METHOD}] Request ${id} marked as Cancelled successfully`);
      return saved;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error removing request: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error removing leave request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Leave balance: entitlement (18 full timer / 12 intern), used (approved leave in year), pending, balance */
  async getLeaveBalance(employeeId: string, year: string) {
    const METHOD = 'getLeaveBalance';
    this.logger.log(`[${METHOD}] Fetching leave balance for ${employeeId} (Year: ${year})`);

    try {
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        throw new BadRequestException('Valid year is required');
      }
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      this.logger.debug(`[${METHOD}] Fetching employee details...`);
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
        select: ['id', 'employeeId', 'designation', 'employmentType'],
      });
      if (!employee) {
        this.logger.warn(`[${METHOD}] Employee ${employeeId} not found`);
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }

      const isIntern =
        employee.employmentType === EmploymentType.INTERN ||
        (employee.designation || '').toLowerCase().includes('intern');
      const entitlement = isIntern ? 12 : 18;

      const leaveTypes = ['Apply Leave', 'Leave'];

      this.logger.debug(`[${METHOD}] Calculating used and pending days...`);
      const used = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .where('lr.employeeId = :employeeId', { employeeId })
        .andWhere('lr.requestType IN (:...leaveTypes)', { leaveTypes })
        .andWhere('lr.status = :status', { status: 'Approved' })
        .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
        .andWhere('lr.toDate >= :yearStart', { yearStart })
        .getCount();

      const pending = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .where('lr.employeeId = :employeeId', { employeeId })
        .andWhere('lr.requestType IN (:...leaveTypes)', { leaveTypes })
        .andWhere('lr.status = :status', { status: 'Pending' })
        .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
        .andWhere('lr.toDate >= :yearStart', { yearStart })
        .getCount();

      const balance = Math.max(0, entitlement - used);

      this.logger.log(`[${METHOD}] Successfully calculated balance: ${balance} for ${employeeId}`);
      return {
        employeeId,
        year: yearNum,
        entitlement,
        used,
        pending,
        balance,
      };
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching leave balance: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error fetching leave balance', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getStats(employeeId: string, month: string = 'All', year: string = 'All') {
    const METHOD = 'getStats';
    this.logger.log(`[${METHOD}] Fetching stats for ${employeeId} (${month}/${year})`);

    try {
      this.logger.debug(`[${METHOD}] Fetching all requests for employee...`);
      const requests = await this.leaveRequestRepository.find({
        where: { employeeId },
      });

      this.logger.debug(`[${METHOD}] Filtering ${requests.length} requests for period...`);
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

        if (status === 'Request Modified' || status === 'Cancelled') return;

        const target =
          req.requestType === 'Apply Leave' ? stats.leave
          : req.requestType === 'Work From Home' ? stats.wfh
          : req.requestType === 'Client Visit' ? stats.clientVisit
          : req.requestType === 'Half Day' ? stats.halfDay
          : null;

        if (!target) return;

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

      this.logger.log(`[${METHOD}] Successfully compiled stats for ${employeeId}`);
      return stats;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching stats: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error fetching leave stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateStatus(id: number, status: 'Approved' | 'Rejected' | 'Cancelled' | 'Cancellation Approved', employeeId?: string, reviewedBy?: string) {
    const METHOD = 'updateStatus';
    this.logger.log(`[${METHOD}] Updating status for request ${id} to ${status} (Reviewed by: ${reviewedBy})`);

    try {
      // STEP 1: Fetch Request
      this.logger.debug(`[${METHOD}][STEP 1] Fetching request...`);
      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) {
        this.logger.warn(`[${METHOD}] Request ${id} not found`);
        throw new NotFoundException('Leave request not found');
      }

      // STEP 2: Update Status
      this.logger.debug(`[${METHOD}][STEP 2] Applying status update...`);
      const previousStatus = request.status;
      request.status = status;
      if (reviewedBy) request.reviewedBy = reviewedBy;
      
      request.isRead = true;
      request.isReadEmployee = false; 
      
      const savedRequest = await this.leaveRequestRepository.save(request);
      this.logger.log(`[${METHOD}] Status updated to ${status} for request ${id}`);

      const reqType = request.requestType ? request.requestType.trim().toLowerCase() : '';

      // STEP 3: Automation Logic (Half Day)
      if (status === 'Approved' && reqType.includes('half')) {
          try {
              this.logger.debug(`[${METHOD}][STEP 3] Processing Half Day Approval Automation...`);
              const startDate = dayjs(request.fromDate);
              const endDate = dayjs(request.toDate);
              const diff = endDate.diff(startDate, 'day');

              for (let i = 0; i <= diff; i++) {
                   const targetDate = startDate.add(i, 'day');
                   if (targetDate.day() === 0 || targetDate.day() === 6) continue;

                   const startOfDay = targetDate.startOf('day').toDate();
                   const endOfDay = targetDate.endOf('day').toDate();
                   
                   let attendance = await this.employeeAttendanceRepository.findOne({
                       where: {
                          employeeId: request.employeeId,
                          workingDate: Between(startOfDay, endOfDay)
                       }
                   });

                   const halfDayStatus = typeof AttendanceStatus !== 'undefined' ? (AttendanceStatus as any).HALF_DAY : 'Half Day';

                   if (!attendance) {
                       attendance = this.employeeAttendanceRepository.create({
                           employeeId: request.employeeId,
                           workingDate: startOfDay,
                           totalHours: 5,
                           status: halfDayStatus,
                           sourceRequestId: request.id,
                       });
                       await this.employeeAttendanceRepository.save(attendance);
                   } else {
                       await this.employeeAttendanceRepository
                          .createQueryBuilder()
                          .update(EmployeeAttendance)
                          .set({ 
                              totalHours: 5, 
                              status: halfDayStatus,
                              sourceRequestId: request.id,
                          })
                          .where("id = :id", { id: attendance.id })
                          .execute();
                   }
              }
              this.logger.log(`[${METHOD}] Automation: Updated attendance to Half Day for request ${id}`);
          } catch (err) {
              this.logger.error(`[${METHOD}][STEP 3] Failed to auto-update attendance: ${err.message}`);
          }
      }

      // STEP 4: Cleanup Logic (Reject/Cancel Half Day)
      if ((status === 'Rejected' || status === 'Cancelled' || status === 'Cancellation Approved') && reqType.includes('half')) {
          try {
              this.logger.debug(`[${METHOD}][STEP 4] Unlocking attendance for rejected/cancelled half day...`);
              await this.employeeAttendanceRepository
                  .createQueryBuilder()
                  .update(EmployeeAttendance)
                  .set({ sourceRequestId: () => 'NULL' })
                  .where("sourceRequestId = :requestId", { requestId: request.id })
                  .execute();
          } catch (err) {
              this.logger.error(`[${METHOD}][STEP 4] Failed to unlock attendance: ${err.message}`);
          }
      }

      // STEP 5: Emails
      this.logger.debug(`[${METHOD}][STEP 5] Sending email notifications...`);
      try {
        const employee = await this.employeeDetailsRepository.findOne({ 
          where: { employeeId: request.employeeId } 
        });

        if (employee) {
          // A. Notify Admin/Manager if Employee Cancelled
          if (status === 'Cancelled' && previousStatus === 'Pending') {
            const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
            if (adminEmail) {
                const requestTypeLabel = request.requestType === 'Apply Leave' ? 'Leave' : request.requestType;
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

                await this.emailService.sendEmail(adminEmail, `Request Cancelled: ${requestTypeLabel} - ${employee.fullName}`, `Request Cancelled`, adminHtml);
            }
          }

          // B. Notify Employee
          if (employee.email) {
            const htmlContent = getStatusUpdateTemplate({
              employeeName: employee.fullName || 'Employee',
              requestType: request.requestType,
              title: request.title,
              fromDate: dayjs(request.fromDate).format('YYYY-MM-DD'),
              toDate: dayjs(request.toDate).format('YYYY-MM-DD'),
              duration: request.duration || 0,
              status: status as any,
              isCancellation: status === 'Cancellation Approved',
              reviewedBy: (status === 'Cancelled' && previousStatus === 'Pending') ? '' : request.reviewedBy
            });
    
            await this.emailService.sendEmail(employee.email, `${request.requestType} Request Update`, `Your request status: ${status}`, htmlContent);
          }
        }
      } catch (error) {
        this.logger.error(`[${METHOD}][STEP 5] Failed to send status update email: ${error.message}`);
      }

      this.logger.log(`[${METHOD}] Update completed for request ID: ${id}`);
      return savedRequest;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error updating status: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error updating request status', HttpStatus.INTERNAL_SERVER_ERROR);
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
    modification.submittedDate = dayjs().format('YYYY-MM-DD');
    modification.isRead = true;
    modification.isReadEmployee = false;
    modification.duration = data.duration || (dayjs(data.toDate).diff(dayjs(data.fromDate), 'day') + 1);
    modification.requestModifiedFrom = data.overrideStatus === 'Approved' ? parent.requestModifiedFrom : data.sourceRequestType;

    const savedModification = await this.leaveRequestRepository.save(modification);
    
    // Copy documents from the parent request to this new modification record
    await this.copyRequestDocuments(parent.id, savedModification.id);

    return savedModification;
  }

  // NEW: Dedicated API for Rejecting Cancellation
  async rejectCancellation(id: number, employeeId: string, reviewedBy?: string) {
    const METHOD = 'rejectCancellation';
    this.logger.log(`[${METHOD}] Rejecting cancellation for request ${id}`);

    try {
      // STEP 1: Fetch and Validate
      this.logger.debug(`[${METHOD}][STEP 1] Fetching request...`);
      const request = await this.leaveRequestRepository.findOne({ where: { id } });
      if (!request) throw new NotFoundException(`Leave request ID ${id} not found`);

      const checkStart = dayjs(request.fromDate).format('YYYY-MM-DD');
      const checkEnd = dayjs(request.toDate).format('YYYY-MM-DD');

      // STEP 2: Restore Duration if Partial
      this.logger.debug(`[${METHOD}][STEP 2] Checking for overlaps to identify partial vs full...`);
      const overlapCount = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .where('lr.employeeId = :employeeId', { employeeId: request.employeeId })
        .andWhere('lr.id != :id', { id: request.id })
        .andWhere('lr.status = :status', { status: 'Approved' })
        .andWhere('DATE(lr.fromDate) <= DATE(:checkEnd)', { checkEnd })
        .andWhere('DATE(lr.toDate) >= DATE(:checkStart)', { checkStart })
        .getCount();

      if (overlapCount > 0) {
        this.logger.log(`[${METHOD}] Partial cancellation detected. Restoring duration to master request...`);
        const masterRequest = await this.leaveRequestRepository
          .createQueryBuilder('lr')
          .where('lr.employeeId = :employeeId', { employeeId: request.employeeId })
          .andWhere('lr.id != :id', { id: request.id })
          .andWhere('lr.status = :status', { status: 'Approved' })
          .andWhere('DATE(lr.fromDate) <= DATE(:checkStart)', { checkStart })
          .andWhere('DATE(lr.toDate) >= DATE(:checkEnd)', { checkEnd })
          .getOne();

        if (masterRequest) {
          masterRequest.duration = (masterRequest.duration || 0) + (request.duration || 0);
          await this.leaveRequestRepository.save(masterRequest);
        }
        request.status = 'Cancellation Rejected';
      } else {
        this.logger.log(`[${METHOD}] Full cancellation detected. Reverting status to Approved.`);
        request.status = 'Approved';
      }

      // STEP 3: Update and Notify
      request.isReadEmployee = false;
      if (reviewedBy) request.reviewedBy = reviewedBy;
      await this.leaveRequestRepository.save(request);

      this.logger.debug(`[${METHOD}][STEP 3] Sending rejection email...`);
      try {
        const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId: request.employeeId } });
        const toEmail = employee?.email || (request.employeeId + '@inventechinfo.com');

        const emailBody = getStatusUpdateTemplate({
          employeeName: employee?.fullName || 'Employee',
          requestType: request.requestType,
          title: request.title,
          fromDate: checkStart,
          toDate: checkEnd,
          duration: request.duration || 0,
          status: 'Cancellation Rejected',
          isCancellation: true,
          reviewedBy: request.reviewedBy
        });
        
        await this.emailService.sendEmail(toEmail, `${request.requestType} Request Cancellation Rejected`, 'Cancellation Rejected', emailBody);
      } catch (e) {
        this.logger.error(`[${METHOD}][STEP 3] Failed to send email: ${e.message}`);
      }

      this.logger.log(`[${METHOD}] Cancellation rejected successfully for request ${id}`);
      return request;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error rejecting cancellation: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error rejecting cancellation', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Helper to revert attendance for the given range (when cancellation is approved)
  private async revertAttendance(
    employeeId: string,
    fromDate: string,
    toDate: string,
  ) {
    try {
      const start = new Date(fromDate);
      const end = new Date(toDate);

      // Loop dates or use Between query
      // Using Between is safer for DB operations
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      const records = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(
            new Date(startStr + 'T00:00:00'),
            new Date(endStr + 'T23:59:59'),
          ),
        },
      });

      for (const record of records) {
        // Reset the record to 'empty' state
        record.status = null;
        record.totalHours = 0;
        record.workLocation = null;
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
        status: In(['Approved', 'Rejected', 'Cancellation Approved', 'Cancelled', 'Request Modified', 'Cancellation Rejected'])
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
              recipientName: mapping.managerName
            });

            await this.emailService.sendEmail(
              managerEmail,
              `${actionText} Request: ${request.requestType} - ${mapping.employeeName}`,
              `${actionText} request submitted by ${mapping.employeeName}`,
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
          description: request.description
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
}