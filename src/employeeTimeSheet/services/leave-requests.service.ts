import { Injectable, ConflictException, ForbiddenException, NotFoundException, Logger, InternalServerErrorException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In, Brackets } from 'typeorm';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmailService } from '../../email/email.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';

@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  constructor(
    @InjectRepository(LeaveRequest)
    private leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(EmployeeDetails)
    private employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
    private emailService: EmailService,
    private documentUploaderService: DocumentUploaderService,
  ) {}

  async create(data: Partial<LeaveRequest>) {
    // Check for overlapping dates
    if (data.fromDate && data.toDate) {
      const existingLeave = await this.leaveRequestRepository.findOne({
        where: {
          employeeId: data.employeeId,
          fromDate: LessThanOrEqual(data.toDate),
          toDate: MoreThanOrEqual(data.fromDate),
          status: In(['Pending', 'Approved']),
        },
      });

      if (existingLeave) {
        throw new ConflictException(
          `Leave request already exists for the selected date range (${existingLeave.fromDate} to ${existingLeave.toDate})`,
        );
      }
    }

    if (!data.submittedDate) {
      const now = new Date();
      data.submittedDate = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    }

    if (data.fromDate && data.toDate) {
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
        WHEN lr.status = 'Approved' THEN 2 
        ELSE 3 
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
      .andWhere('lr.status = :status', { status: 'Pending' })
      .select([
        'lr.id AS id',
        'lr.employeeId AS employeeId',
        'lr.requestType AS requestType',
        'lr.fromDate AS fromDate',
        'lr.toDate AS toDate',
        'lr.title AS title',
        'lr.status AS status',
        'lr.createdAt AS createdAt',
        'ed.fullName AS employeeName'
      ])
      .addSelect(`CASE 
        WHEN lr.status = 'Pending' THEN 1 
        WHEN lr.status = 'Approved' THEN 2 
        ELSE 3 
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

    return this.leaveRequestRepository.delete(id);
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

  async updateStatus(id: number, status: 'Approved' | 'Rejected' | 'Cancelled') {
    const request = await this.leaveRequestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
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
        // CASE 1: Request Cancelled -> Notify Admin
        if (status === 'Cancelled') {
            const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
            if (adminEmail) {
                const requestTypeLabel = request.requestType === 'Apply Leave' ? 'Leave' : request.requestType;
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
    
                  <p>The above request has been cancelled by the employee.</p>
                  
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
              this.logger.log(`Cancellation notification sent to Admin: ${adminEmail}`);
            } else {
                this.logger.warn('Admin email not configured. Cannot send cancellation notification.');
            }
        } 
        // CASE 2: Approved/Rejected -> Notify Employee
        else if (employee.email) {
          this.logger.log(`Found employee: ${employee.fullName}, Email: ${employee.email}. Sending email...`);
          let typeLabel = 'Leave Request';
          if (request.requestType === 'Work From Home' || request.requestType === 'Client Visit') {
            typeLabel = `${request.requestType} Request`;
          }

          const statusColor = status === 'Approved' ? '#28a745' : '#dc3545';
          const subject = `${typeLabel} Update: ${status}`;
          const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #333;">${typeLabel} Update</h2>
              <p>Dear <strong>${employee.fullName}</strong> (${employee.employeeId}),</p>
              <p>Your request for <strong>${request.requestType}</strong> titled "<strong>${request.title}</strong>" has been processed.</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p style="margin: 5px 0; font-size: 14px;"><strong>From:</strong> ${request.fromDate}</p>
                <p style="margin: 5px 0; font-size: 14px;"><strong>To:</strong> ${request.toDate}</p>
                <p style="margin: 5px 0; font-size: 14px;"><strong>Duration:</strong> ${request.duration} Day(s)</p>
              </div>

              <p style="font-size: 16px;">
                Status: <span style="color: ${statusColor}; font-weight: bold; font-size: 18px;">${status}</span>
              </p>
              
              <p style="color: #666; font-size: 12px; margin-top: 20px;">
                Processed By Admin
              </p>

              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">
                This is an automated message. Please do not reply.
              </p>
            </div>
          `;

          await this.emailService.sendEmail(
            employee.email,
            subject,
            `Your leave request status has been updated to ${status}.`,
            htmlContent
          );
          this.logger.log(`Email sent successfully to ${employee.email}`);
        } else {
          this.logger.warn(`Employee found (${employee.fullName}), but EMAIL IS MISSING. Cannot send notification.`);
        }
      } else {
        this.logger.warn(`Employee NOT FOUND for ID: ${request.employeeId}. Cannot send notification.`);
      }
    } catch (error) {
      this.logger.error('Failed to send status update email:', error);
    }

    return savedRequest;
  }

  async findEmployeeUpdates(employeeId: string) {
    return this.leaveRequestRepository.find({
      where: { 
        employeeId, 
        isReadEmployee: false, // Fetch unread updates
        status: In(['Approved', 'Rejected'])
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
        WHEN lr.status = 'Approved' THEN 2 
        ELSE 3 
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


