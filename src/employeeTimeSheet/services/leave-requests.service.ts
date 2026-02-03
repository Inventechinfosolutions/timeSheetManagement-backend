import { Injectable, ConflictException, ForbiddenException, NotFoundException, Logger, InternalServerErrorException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In, Brackets, Between } from 'typeorm';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmailService } from '../../email/email.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import dayjs from 'dayjs';

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
    private emailService: EmailService,
    private documentUploaderService: DocumentUploaderService,
  ) {}

  async create(data: Partial<LeaveRequest>) {
    // Check for overlapping dates based on request type
    if (data.fromDate && data.toDate && data.requestType) {
      const requestType = data.requestType;
      
      // Define which request types can overlap with each other
      // Client Visit can overlap with Leave and WFH
      // Leave and WFH cannot overlap with each other or with themselves
      
      let conflictingTypes: string[] = [];
      
      if (requestType === 'Apply Leave' || requestType === 'Leave') {
        // Leave only conflicts with other Leave requests
        conflictingTypes = ['Apply Leave', 'Leave'];
      } else if (requestType === 'Work From Home') {
        // WFH conflicts with Leave (which blocks it) and existing WFH
        conflictingTypes = ['Apply Leave', 'Leave', 'Work From Home'];
      } else if (requestType === 'Client Visit') {
        // Client Visit conflicts with Leave (which blocks it) and existing Client Visit
        conflictingTypes = ['Apply Leave', 'Leave', 'Client Visit'];
      } else {
        conflictingTypes = [requestType];
      }
      
      // Only check for conflicts if there are conflicting types
      if (conflictingTypes.length > 0) {
        const existingLeave = await this.leaveRequestRepository.findOne({
          where: {
            employeeId: data.employeeId,
            fromDate: LessThanOrEqual(data.toDate),
            toDate: MoreThanOrEqual(data.fromDate),
            status: In(['Pending', 'Approved']),
            requestType: In(conflictingTypes),
          },
        });

        if (existingLeave) {
          throw new ConflictException(
            `Leave request already exists for the selected date range (${existingLeave.fromDate} to ${existingLeave.toDate})`,
          );
        }
      }
    }

    if (!data.submittedDate) {
      const now = new Date();
      data.submittedDate = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    }

    // Only calculate duration if not already provided
    if (data.fromDate && data.toDate && (data.duration === undefined || data.duration === null || data.duration === 0)) {
      const start = new Date(data.fromDate);
      const end = new Date(data.toDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      data.duration = days;
    }

    const savedRequest = await this.leaveRequestRepository.save(data);

    // --- NEW NOTIFICATION LOGIC ---
    try {
      // 1. Get Employee Details
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: data.employeeId },
      });

      if (employee) {
        // 2. Prepare Admin Email (Receiver)
        // Using the SMTP username as the admin receiver, or fallback to a specific admin email if env var exists
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;

        // 3. Construct HTML Content
        const requestTypeLabel =
          data.requestType === 'Apply Leave' ? 'Leave' : data.requestType;
        const subject = `New ${requestTypeLabel} Request - ${employee.fullName}`;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #333;">New ${requestTypeLabel} Request</h2>
              <p><strong>Employee:</strong> ${employee.fullName} (${employee.employeeId})</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Title:</strong> ${data.title || 'No Title'}</p>
                <p style="margin: 5px 0;"><strong>From:</strong> ${data.fromDate}</p>
                <p style="margin: 5px 0;"><strong>To:</strong> ${data.toDate}</p>
                <p style="margin: 5px 0;"><strong>Reason:</strong> ${data.description || 'N/A'}</p>
              </div>

              <p>Please log in to the admin panel to approve or reject this request.</p>

              <div style="text-align: center; margin: 25px 0;">
                <a href="https://timesheet.inventech-developer.in" 
                   style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                   Login to Portal
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">
                This is an automated notification.
              </p>
            </div>
        `;

        if (adminEmail) {
          // 4. Send Email
          // We pass employee.email as 'replyTo' so Admin can reply directly to the employee
          await this.emailService.sendEmail(
            adminEmail,
            subject,
            `New request from ${employee.fullName}`,
            htmlContent,
            employee.email, // <--- Pass employee email here as Reply-To
          );
          this.logger.log(
            `Notification sent to Admin (${adminEmail}) for request from ${employee.fullName}`,
          );
        } else {
          this.logger.warn(
            'Admin email not configured (ADMIN_EMAIL or SMTP_USERNAME). Cannot send admin notification.',
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to send admin notification', error);
    }

    // Link orphaned documents (refId: 0) to the newly created request
    try {
      // Find the numeric ID of the employee to match the entityId used during upload
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: savedRequest.employeeId }
      });

      if (employee) {
        await this.documentRepo.update(
          {
            entityType: EntityType.LEAVE_REQUEST,
            entityId: employee.id, // During upload, entityId is set to employee's numeric ID
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

    return savedRequest;
  }

  async findAll(department?: string, status?: string, search?: string, page: number = 1, limit: number = 10) {
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

    if (department) {
      query.andWhere('ed.department = :department', { department });
    }

    if (status) {
      query.andWhere('lr.status = :status', { status });
    }

    if (search) {
      query.andWhere(new Brackets(qb => {
        qb.where('LOWER(ed.fullName) LIKE LOWER(:search)', { search: `%${search}%` })
          .orWhere('LOWER(lr.employeeId) LIKE LOWER(:search)', { search: `%${search}%` });
      }));
    }

    const total = await query.getCount();

    const data = await query
      .addSelect(`CASE 
        WHEN lr.status = 'Pending' THEN 1 
        WHEN lr.status = 'Requesting for Cancellation' THEN 2
        WHEN lr.status = 'Approved' THEN 3
        WHEN lr.status = 'Cancellation Approved' THEN 4
        WHEN lr.status = 'Request Modified' THEN 5
        WHEN lr.status = 'Rejected' THEN 5
        WHEN lr.status = 'Cancelled' THEN 6
        ELSE 7 
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

  async findByEmployeeId(employeeId: string, page: number = 1, limit: number = 10) {
    const query = this.leaveRequestRepository.createQueryBuilder('lr')
      .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = lr.employeeId')
      .where('lr.employeeId = :employeeId', { employeeId })
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

    const total = await query.getCount();

    const data = await query
      .orderBy('lr.id', 'DESC')
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
        'lr.request_modified_from AS requestModifiedFrom',
        'ed.department AS department',
        'ed.fullName AS fullName'
      ])
      .getRawOne();

    if (!result) {
      throw new NotFoundException(`Leave request with ID ${id} not found`);
    }

    return result;
  }

  async findUnread() {
    return this.leaveRequestRepository.createQueryBuilder('lr')
      .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = lr.employeeId')
      .where('lr.isRead = :isRead', { isRead: false })
      // .andWhere('lr.status = :status', { status: 'Pending' }) // REMOVED: Allow Cancelled/ApprovedRequestCancellation if unread
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
      END`, 'priority')
      .orderBy('priority', 'ASC')
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
        .hour(12)
        .minute(0)
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

        // Check if date is consecutive (PrevDate + 1 day)
        const isConsecutive = dayjs(date).diff(dayjs(prevDate), 'day') === 1;

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
      }

      // Update Original Request Duration - REMOVED per requirements.
      // Duration should only update when Admin APPROVES the cancellation.
      // if (request.duration) {
      //   request.duration = Math.max(0, request.duration - datesToCancel.length);
      //   await this.leaveRequestRepository.save(request);
      // }

      // Return the list of created requests (or just the first one if frontend expects single obj, but strictly it's an array now)
      // Frontend likely expects an object or can handle whatever.
      // Returning the last one or wrapping in array might change contract.
      // Let's return the last created request to satisfy strict typing if return type is single entity,
      // OR modify to return array. Controller usually returns whatever this returns.
      // The frontend uses the response mainly for success or notification.
      // Notify Admin of the cancellation request(s)
      // Since it's one action, we can notify about the first one or a summary
      if (createdRequests.length > 0) {
        await this.notifyAdminOfCancellationRequest(createdRequests[0], employeeId, datesToCancel.length);
      }

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

          const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #ffc107;">New Cancellation Request</h2>
              <p><strong>Employee:</strong> ${employee.fullName} (${employee.employeeId})</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Type:</strong> ${requestTypeLabel}</p>
                <p style="margin: 5px 0;"><strong>Original Title:</strong> ${request.title || 'No Title'}</p>
                <p style="margin: 5px 0;"><strong>Dates to Cancel:</strong> ${request.fromDate} to ${request.toDate}</p>
                <p style="margin: 5px 0;"><strong>Total Days:</strong> ${displayDuration}</p>
              </div>

              <p>The employee has requested to cancel an <strong>Approved</strong> ${requestTypeLabel} request. Please review and approve/reject this cancellation in the admin panel.</p>

              <div style="text-align: center; margin: 25px 0;">
                <a href="https://timesheet.inventech-developer.in" 
                   style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                   Login to Portal
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">
                This is an automated notification.
              </p>
            </div>
          `;

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
    return this.leaveRequestRepository.save(request);
  }

  async markAllAsRead() {
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
          const subject = `Cancelled: ${requestTypeLabel} Request - ${employee.fullName}`;

          const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #dc3545;">Request Cancelled by Employee</h2>
              <p><strong>Employee:</strong> ${employee.fullName} (${employee.employeeId})</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Type:</strong> ${request.requestType}</p>
                <p style="margin: 5px 0;"><strong>Title:</strong> ${request.title || 'No Title'}</p>
                <p style="margin: 5px 0;"><strong>From:</strong> ${request.fromDate}</p>
                <p style="margin: 5px 0;"><strong>To:</strong> ${request.toDate}</p>
              </div>

              <p>The above request has been cancelled by the employee and removed from the system.</p>
              
              <div style="text-align: center; margin: 25px 0;">
                <a href="https://timesheet.inventech-developer.in" 
                   style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                   Login to Portal
                </a>
              </div>

              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
               <p style="font-size: 12px; color: #999;">
                This is an automated notification.
              </p>
            </div>
           `;

          await this.emailService.sendEmail(
            adminEmail,
            subject,
            `Request Cancelled by ${employee.fullName}`,
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

  async getStats(employeeId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const yearMonth = `${year}-${monthStr}`;

    const requests = await this.leaveRequestRepository.find({
      where: { employeeId },
    });

    // Filter for current month based on submittedDate
    const currentMonthRequests = requests.filter((req: any) => {
      const dateToUse = req.submittedDate;
      if (!dateToUse) return false;
      
      let datePart = '';
      if (dateToUse instanceof Date) {
        const y = dateToUse.getFullYear();
        const m = dateToUse.getMonth() + 1;
        datePart = `${y}-${m < 10 ? '0' + m : m}`;
      } else {
        datePart = String(dateToUse).substring(0, 7);
      }
      
      return datePart === yearMonth;
    });

    const stats = {
      leave: { applied: 0, approved: 0, rejected: 0, total: 0 },
      wfh: { applied: 0, approved: 0, rejected: 0, total: 0 },
      clientVisit: { applied: 0, approved: 0, rejected: 0, total: 0 },
    };

    currentMonthRequests.forEach((req) => {
      if (req.requestType === 'Apply Leave') {
        stats.leave.applied++;
        if (req.status === 'Approved') stats.leave.approved++;
        if (req.status === 'Rejected') stats.leave.rejected++;
      } else if (req.requestType === 'Work From Home') {
        stats.wfh.applied++;
        if (req.status === 'Approved') stats.wfh.approved++;
        if (req.status === 'Rejected') stats.wfh.rejected++;
      } else if (req.requestType === 'Client Visit') {
        stats.clientVisit.applied++;
        if (req.status === 'Approved') stats.clientVisit.approved++;
        if (req.status === 'Rejected') stats.clientVisit.rejected++;
      }
    });

    return stats;
  }

  async updateStatus(id: number, status: 'Approved' | 'Rejected' | 'Cancelled' | 'Cancellation Approved', employeeId?: string) {
    const request = await this.leaveRequestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    // Status Logic
    const previousStatus = request.status;
    request.status = status;
    // When an admin updates the status, we mark it as read for Admin
    request.isRead = true;
    // AND we mark it as "unread" (new update) for the Employee: false means unread
    request.isReadEmployee = false; 
    
    const savedRequest = await this.leaveRequestRepository.save(request);



    // --- Email Notification Logic ---
    try {
      this.logger.log(`Attempting to send status email. Request ID: ${id}, Status: ${status}, EmployeeID: ${request.employeeId}`);

      const employee = await this.employeeDetailsRepository.findOne({ 
        where: { employeeId: request.employeeId } 
      });

      if (employee) {
        // CASE 1: Employee Cancelled (or Admin marked as Cancelled manually) -> Notify Admin
        if (status === 'Cancelled' && previousStatus === 'Pending') {
          // Logic for simple cancellation if needed
        }

        // CASE 2: Approved/Rejected/Cancellation Approved -> Notify Employee
        if (employee.email) {
          const isCancellation = status === 'Cancellation Approved' || status === 'Cancelled';
          const requestTypePretty = request.requestType;
          
          let mailSubject = `${requestTypePretty} Request Update`;
          let headerTitle = `${requestTypePretty} Request Update`;
          let mainMessage = `Your request for <strong>${requestTypePretty}</strong> titled "<strong>${request.title}</strong>" has been processed.`;
          let displayStatus: string = status;
          
          if (status === 'Approved') {
               mailSubject = `${requestTypePretty} Request Approved`;
               headerTitle = `${requestTypePretty} Request Approved`;
               mainMessage = `Your request for <strong>${requestTypePretty}</strong> titled "<strong>${request.title}</strong>" has been reviewed.`;
          } else if (status === 'Rejected') {
               mailSubject = `${requestTypePretty} Request Rejected`;
               headerTitle = `${requestTypePretty} Request Rejected`;
               mainMessage = `Your request for <strong>${requestTypePretty}</strong> titled "<strong>${request.title}</strong>" has been reviewed.`;
          } else if (status === 'Cancellation Approved') {
               mailSubject = `${requestTypePretty} Request Cancellation Approved`;
               headerTitle = `${requestTypePretty} Request Cancellation`;
               mainMessage = `Your request for cancel <strong>${requestTypePretty}</strong> titled "<strong>${request.title}</strong>" has been reviewed.`;
               displayStatus = 'Cancellation Approved';
          } else if (status === 'Cancelled') {
               mailSubject = `${requestTypePretty} Request Cancellation`;
               headerTitle = `${requestTypePretty} Request Cancellation`;
               mainMessage = `Your request for <strong>${requestTypePretty}</strong> titled "<strong>${request.title}</strong>" has been Cancelled.`;
          }

          const statusColor =
            status === 'Approved' || status === 'Cancellation Approved'
              ? '#28a745' // Green
              : '#dc3545'; // Red
  
          const fromDate = dayjs(request.fromDate).format('YYYY-MM-DD');
          const toDate = dayjs(request.toDate).format('YYYY-MM-DD');
          const duration = request.duration || 0;
  
          const htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
              <!-- Header -->
              <div style="background-color: #1a1a1a; color: #ffffff; padding: 20px; text-align: center;">
                  <h2 style="margin: 0; font-size: 20px;">${headerTitle}</h2>
              </div>
              
              <!-- Body -->
              <div style="padding: 24px;">
                  <p style="margin-top: 0; font-size: 16px;">Dear <strong>${employee.fullName || 'Employee'}</strong> (${request.employeeId}),</p>
                  <p style="font-size: 16px; line-height: 1.5; color: #555;">${mainMessage}</p>
                  
                  <!-- Details Card -->
                  <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 24px 0;">
                      <p style="margin: 8px 0; font-size: 14px; color: #555;"><strong>From:</strong> ${fromDate}</p>
                      <p style="margin: 8px 0; font-size: 14px; color: #555;"><strong>To:</strong> ${toDate}</p>
                      <p style="margin: 8px 0; font-size: 14px; color: #555;"><strong>Duration:</strong> ${duration} Day(s)</p>
                  </div>
                  
                  <p style="font-size: 16px; font-weight: bold;">
                      Status: <span style="color: ${statusColor};">${displayStatus}</span>
                  </p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://timesheet.inventech-developer.in" 
                       style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                       Login to Portal
                    </a>
                  </div>
  
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                  
                  <p style="font-size: 12px; color: #999; text-align: center; margin-bottom: 0;">
                       This is an automated message. Please do not reply.
                  </p>
              </div>
            </div>
          `;
  
          await this.emailService.sendEmail(
            employee.email,
            mailSubject,
            `Your request status: ${displayStatus}`,
            htmlContent,
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to send status update email:', error);
    }

    return savedRequest;
  }

  async createModification(id: number, data: any) {
    const parent = await this.leaveRequestRepository.findOne({ where: { id } });
    if (!parent) throw new NotFoundException('Original request not found');

    const modification = new LeaveRequest();
    modification.employeeId = parent.employeeId;
    modification.requestType = parent.requestType;
    modification.fromDate = data.fromDate;
    modification.toDate = data.toDate;
    modification.status = 'Request Modified';
    modification.title = parent.title;
    modification.description = `${parent.description || ''} (Request Modified due to overlap with ${data.sourceRequestType} ID: ${data.sourceRequestId})`;
    modification.submittedDate = dayjs().format('YYYY-MM-DD');
    modification.isRead = true;
    modification.isReadEmployee = false;
    modification.duration = dayjs(data.toDate).diff(dayjs(data.fromDate), 'day') + 1;
    modification.requestModifiedFrom = data.sourceRequestType;

    const savedModification = await this.leaveRequestRepository.save(modification);
    
    // Copy documents from the parent request to this new modification record
    await this.copyRequestDocuments(parent.id, savedModification.id);

    return savedModification;
  }

  // NEW: Dedicated API for Rejecting Cancellation
  async rejectCancellation(id: number, employeeId: string) {
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
      // Action: Restore duration to Parent AND Mark this child request as REJECTED.

      const masterRequest = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .where('lr.employeeId = :employeeId', {
          employeeId: request.employeeId,
        })
        .andWhere('lr.id != :id', { id: request.id })
        .andWhere('lr.status = :status', { status: 'Approved' })
        .andWhere('DATE(lr.fromDate) <= DATE(:checkStart)', { checkStart })
        .andWhere('DATE(lr.toDate) >= DATE(:checkEnd)', { checkEnd })
        .getOne();

      if (masterRequest) {
        masterRequest.duration =
          (masterRequest.duration || 0) + (request.duration || 0);
        await this.leaveRequestRepository.save(masterRequest);
      }

      // Mark as REJECTED
      request.status = 'Rejected';
      request.title = 'Cancellation Rejected'; // Marker for Frontend
    } else {
      // Case B: Full Cancellation (Master)
      // Revert to 'Approved'
      request.status = 'Approved';
    }

    // Assign title 'Cancellation Rejected' for frontend notification Logic
    // This allows frontend to show "Cancellation Rejected" even if status is reverted to 'Approved'
    request.title = 'Cancellation Rejected';

    // Mark as Unread for Employee so they get a notification
    request.isReadEmployee = false;
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

      const emailBody = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
              <!-- Header -->
              <div style="background-color: #1a1a1a; color: #ffffff; padding: 20px; text-align: center;">
                  <h2 style="margin: 0; font-size: 20px;">${headerTitle}</h2>
              </div>
              
              <!-- Body -->
              <div style="padding: 24px;">
                  <p style="margin-top: 0; font-size: 16px;">Dear <strong>${employeeName}</strong> (${employeeId}),</p>
                  <p style="font-size: 16px; line-height: 1.5; color: #555;">${mainMessage}</p>
                  
                  <!-- Details Card -->
                  <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 24px 0;">
                      <p style="margin: 8px 0; font-size: 14px; color: #555;"><strong>From:</strong> ${checkStart}</p>
                      <p style="margin: 8px 0; font-size: 14px; color: #555;"><strong>To:</strong> ${checkEnd}</p>
                       <p style="margin: 8px 0; font-size: 14px; color: #555;"><strong>Reason:</strong> Admin Rejected Cancellation</p>
                  </div>
                  
                   <p style="font-size: 16px; font-weight: bold;">
                      Status: <span style="color: ${statusColor};">${displayStatus}</span>
                  </p>
                   <p style="margin-top: 10px; font-size: 14px;">The original leave request remains <strong>Approved</strong>.</p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://timesheet.inventech-developer.in" 
                       style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                       Login to Portal
                    </a>
                  </div>

                  <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                  
                  <p style="font-size: 12px; color: #999; text-align: center; margin-bottom: 0;">
                       This is an automated message. Please do not reply.
                  </p>
              </div>
            </div>
      `;
      
      await this.emailService.sendEmail(
        toEmail,
        emailSubject,
        'Your cancellation request was rejected.',
        emailBody,
      );
    } catch (e) {
      console.error('Failed to send rejection email', e);
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
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #ffc107;">Cancellation Requested</h2>
              <p><strong>Employee:</strong> ${employee.fullName} (${employee.employeeId})</p>
              <p>The employee has requested to cancel a <strong>previously Approved</strong> request.</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Type:</strong> ${request.requestType}</p>
                <p><strong>Dates:</strong> ${request.fromDate} to ${request.toDate}</p>
                <p><strong>Current Status:</strong> Waiting for Admin Approval (Cancellation)</p>
              </div>

              <p>Please log in to the admin panel to Review this cancellation.</p>
               <div style="text-align: center; margin: 25px 0;">
                <a href="https://timesheet.inventech-developer.in" style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Login to Portal</a>
              </div>
            </div>`;

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

    return request;
  }

  async findEmployeeUpdates(employeeId: string) {
    return this.leaveRequestRepository.find({
      where: { 
        employeeId, 
        isReadEmployee: false, // Fetch unread updates
        status: In(['Approved', 'Rejected', 'Cancellation Approved', 'Cancelled', 'Request Modified'])
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

  async findMonthlyRequests(month: string, year: string, employeeId?: string, page: number = 1, limit: number = 10) {
    const monthInt = parseInt(month);
    const yearInt = parseInt(year);
    
    const monthStart = `${year}-${month.padStart(2, '0')}-01`;
    const lastDay = new Date(yearInt, monthInt, 0).getDate();
    const monthEnd = `${year}-${month.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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

    // Overlap condition: fromDate <= monthEnd AND toDate >= monthStart
    query.where('lr.fromDate <= :monthEnd', { monthEnd })
         .andWhere('lr.toDate >= :monthStart', { monthStart });

    if (employeeId) {
      query.andWhere('lr.employeeId = :employeeId', { employeeId });
    }

    const total = await query.getCount();

    const data = await query
      .addSelect(`CASE 
        WHEN lr.status = 'Pending' THEN 1 
        WHEN lr.status = 'Requesting for Cancellation' THEN 2
        WHEN lr.status = 'Approved' THEN 3
        WHEN lr.status = 'Cancellation Approved' THEN 4
        WHEN lr.status = 'Request Modified' THEN 5
        WHEN lr.status = 'Rejected' THEN 5
        WHEN lr.status = 'Cancelled' THEN 6
        ELSE 7 
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
}


