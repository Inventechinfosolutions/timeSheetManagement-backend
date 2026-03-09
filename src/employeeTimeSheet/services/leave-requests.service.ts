import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  LessThanOrEqual,
  MoreThanOrEqual,
  MoreThan,
  In,
  Brackets,
  Between,
  DeepPartial,
  Like,
} from 'typeorm';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { AttendanceStatus } from '../enums/attendance-status.enum';
import { LeaveRequestStatus } from '../enums/leave-notification-status.enum';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmploymentType } from '../enums/employment-type.enum';
import { Department } from '../enums/department.enum';
import { EmailService } from '../../email/email.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { LeaveRequestType } from '../enums/leave-request-type.enum';
import { WorkLocation, WorkLocationKeyword } from '../enums/work-location.enum';
import { HalfDayType } from '../enums/half-day-type.enum';
import { ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import { UserType } from '../../users/enums/user-type.enum';
import {
  DocumentMetaInfo,
  EntityType,
  ReferenceType,
} from '../../common/document-uploader/models/documentmetainfo.model';
import dayjs from 'dayjs';
import { EmployeeAttendanceService } from './employeeAttendance.service';
import { CompOffService } from './comp-off.service';
import {
  getRequestNotificationTemplate,
  getStatusUpdateTemplate,
  getCancellationTemplate,
  getEmployeeReceiptTemplate,
  getRejectionConfirmationTemplate,
  getCancellationRejectionConfirmationTemplate,
  getApprovalConfirmationTemplate,
  getCancellationApprovalConfirmationTemplate,
} from '../../common/mail/templates';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationsService } from '../../notifications/Services/notifications.service';
import { MasterHolidays } from '../../master/models/master-holidays.entity';
import { LeaveRequestDto } from '../dto/leave-request.dto';

@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  /** Single source: HR email from .env (HR_EMAIL) only. No default in code. */
  private getHrEmail(): string {
    const hrEmail = this.configService.get<string>('HR_EMAIL')?.trim() ?? '';
    this.logger.debug(`[HR_EMAIL_DEBUG] Fetched from config: "${hrEmail}"`);
    return hrEmail;
  }

  // Helper to check if weekend based on department
  private async _isWeekend(
    date: dayjs.Dayjs,
    employeeId: string,
  ): Promise<boolean> {
    try {
      // Always block Sunday (0) and Saturday (6)
      const day = date.day();
      const isWknd = day === 0 || day === 6;
      if (isWknd) {
        this.logger.debug(
          `[WEEKEND_CHECK] Date ${date.format('YYYY-MM-DD')} is a weekend for employee ${employeeId}`,
        );
      }
      return isWknd;
    } catch (error) {
      this.logger.error(
        `[WEEKEND_CHECK] Failed for ${employeeId} on ${date.format('YYYY-MM-DD')}: ${error.message}`,
      );
      return false; // Default to not weekend on error
    }
  }

  // Helper: recalculate and persist monthStatus for an employee based on a date in their month
  private async _recalcMonthStatus(
    employeeId: string,
    refDate: string | Date,
  ): Promise<void> {
    this.logger.log(
      `[MONTH_STATUS] Triggering recalc for employee: ${employeeId}, refDate: ${refDate}`,
    );
    try {
      // [DB_TRUTH]: Delegate all status recalculations to EmployeeAttendanceService.
      await this.employeeAttendanceService.triggerMonthStatusRecalc(
        employeeId,
        refDate,
      );
      this.logger.log(
        `[MONTH_STATUS] Recalc triggered successfully for ${employeeId}`,
      );
    } catch (err) {
      this.logger.error(
        `[MONTH_STATUS] Delegation failed for ${employeeId}: ${err.message}`,
        err.stack,
      );
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
    private configService: ConfigService,
    private compOffService: CompOffService,
  ) {}

  // Helper to check if holiday
  private async _isHoliday(date: dayjs.Dayjs): Promise<boolean> {
    const dateStr = date.format('YYYY-MM-DD');
    try {
      // Using QueryBuilder for robust Date comparison in MySQL
      const holiday = await this.masterHolidayRepository
        .createQueryBuilder('h')
        .where('h.date = :dateStr', { dateStr })
        .getOne();

      const exists = !!holiday;
      if (exists) {
        this.logger.debug(
          `[HOLIDAY_CHECK] Date ${dateStr} is a holiday: ${holiday.name}`,
        );
      }
      return exists;
    } catch (error) {
      this.logger.error(
        `[HOLIDAY_CHECK] Failed for ${dateStr}: ${error.message}`,
        error.stack,
      );
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
  private calculateTotalHours(
    firstHalf: string | null,
    secondHalf: string | null,
    providedHours?: number | null,
  ): number {
    try {
      // 1. If user provided a specific value, respect it
      if (
        providedHours !== undefined &&
        providedHours !== null &&
        providedHours > 0
      ) {
        return Number(providedHours);
      }

      // 2. Otherwise use system defaults based on activities
      const isWork = (half: string | null): boolean => {
        if (!half || half === WorkLocation.LEAVE || half === AttendanceStatus.ABSENT)
          return false;
        const normalized = half.toLowerCase().trim();
        return (
          normalized.includes(WorkLocationKeyword.OFFICE) ||
          normalized.includes(WorkLocationKeyword.WFH) ||
          normalized.includes(WorkLocationKeyword.WORK_FROM_HOME) ||
          normalized.includes(WorkLocationKeyword.CLIENT_VISIT) ||
          normalized.includes(WorkLocationKeyword.PRESENT)
        );
      };

      const h1Work = isWork(firstHalf);
      const h2Work = isWork(secondHalf);

      if (h1Work && h2Work) return 9;
      if (h1Work || h2Work) return 6;
      return 0;
    } catch (error) {
      this.logger.error(
        `[CALC_HOURS] Error calculating hours: ${error.message}`,
      );
      return 0; // Default to 0 on error
    }
  }

  async create(data: LeaveRequestDto) {
    this.logger.log(
      `Starting creation of leave request for employee: ${data.employeeId}, Type: ${data.requestType}`,
    );
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: data.employeeId },
      });
      
      if (data.requestType === LeaveRequestType.COMP_OFF) {
        if (employee?.department !== Department.IT || employee?.employmentType !== EmploymentType.FULL_TIMER) {
          throw new ForbiddenException('Comp Off benefits are only available for employees in the Information Technology department with Full Time status.');
        }
      }

      // Check for overlapping dates based on request type
      if (data.fromDate && data.toDate && data.requestType) {
        this.logger.debug(
          `[CREATE] Checking for overlaps: ${data.fromDate} to ${data.toDate}`,
        );
        const requestType = data.requestType;

        let conflictingTypes: string[] = [];

        if (
          requestType === LeaveRequestType.APPLY_LEAVE ||
          requestType === LeaveRequestType.LEAVE
        ) {
          conflictingTypes = [
            LeaveRequestType.APPLY_LEAVE,
            LeaveRequestType.LEAVE,
          ];
        } else if (requestType === LeaveRequestType.WORK_FROM_HOME) {
          conflictingTypes = [
            LeaveRequestType.APPLY_LEAVE,
            LeaveRequestType.LEAVE,
            LeaveRequestType.WORK_FROM_HOME,
          ];
        } else if (requestType === LeaveRequestType.CLIENT_VISIT) {
          conflictingTypes = [
            LeaveRequestType.APPLY_LEAVE,
            LeaveRequestType.LEAVE,
            LeaveRequestType.CLIENT_VISIT,
          ];
        } else if (requestType === LeaveRequestType.HALF_DAY) {
          conflictingTypes = [
            LeaveRequestType.APPLY_LEAVE,
            LeaveRequestType.LEAVE,
            LeaveRequestType.HALF_DAY,
          ];
        } else {
          conflictingTypes = [requestType];
        }

        // Calculate working dates for the NEW request first
        const start = dayjs(data.fromDate);
        const end = dayjs(data.toDate);
        const workingDateList: string[] = [];
        let workingDays = 0;
        const diff = end.diff(start, 'day');

        for (let i = 0; i <= diff; i++) {
          const current = start.add(i, 'day');
          const isWeekend = await this._isWeekend(current, data.employeeId);
          const isHoliday = await this._isHoliday(current);
          if (!isWeekend && !isHoliday) {
            workingDays++;
            workingDateList.push(current.format('YYYY-MM-DD'));
          }
        }

        if (workingDateList.length === 0) {
          throw new BadRequestException(
            'The selected date range contains no working days.',
          );
        }

        // --- CONFLICT CHECK (Explict Date Aware) ---
        const existingRequests = await this.leaveRequestRepository.find({
          where: {
            employeeId: data.employeeId,
            status: In([
              LeaveRequestStatus.PENDING,
              LeaveRequestStatus.APPROVED,
              LeaveRequestStatus.REQUEST_MODIFIED,
              LeaveRequestStatus.REQUESTING_FOR_CANCELLATION,
              LeaveRequestStatus.REQUESTING_FOR_MODIFICATION,
              LeaveRequestStatus.MODIFICATION_APPROVED,
              LeaveRequestStatus.CANCELLATION_REJECTED,
              LeaveRequestStatus.MODIFICATION_REJECTED,
            ]),
            requestType: In(conflictingTypes),
            fromDate: LessThanOrEqual(data.toDate),
            toDate: MoreThanOrEqual(data.fromDate),
          },
        });

        for (const existing of existingRequests) {
          // Determine if there is a REAL date overlap
          let hasExplicitOverlap = false;
          let overlapDate = '';

          if (existing.availableDates) {
            try {
              const existingDates: string[] = JSON.parse(
                existing.availableDates,
              );
              const overlap = workingDateList.find((d) =>
                existingDates.includes(d),
              );
              if (overlap) {
                hasExplicitOverlap = true;
                overlapDate = overlap;
              }
            } catch (e) {
              // Fallback to range if JSON is corrupt
              hasExplicitOverlap = true;
            }
          } else {
            // Legacy Record (Range based)
            hasExplicitOverlap = true;
          }

          if (hasExplicitOverlap) {
            const existingIsFull = !existing.isHalfDay;
            const existingConsumesFirst =
              existingIsFull ||
              (existing.firstHalf &&
                !existing.firstHalf.toLowerCase().includes(WorkLocationKeyword.OFFICE));
            const existingConsumesSecond =
              existingIsFull ||
              (existing.secondHalf &&
                !existing.secondHalf.toLowerCase().includes(WorkLocationKeyword.OFFICE));

            const newWantsFirst =
              !data.isHalfDay || data.halfDayType === HalfDayType.FIRST_HALF;
            const newWantsSecond =
              !data.isHalfDay || data.halfDayType === HalfDayType.SECOND_HALF;

            if (
              (newWantsFirst && existingConsumesFirst) ||
              (newWantsSecond && existingConsumesSecond)
            ) {
              const existingTypeLabel = existingIsFull
                ? HalfDayType.FULL_DAY
                : existingConsumesFirst && !existingConsumesSecond
                  ? HalfDayType.FIRST_HALF
                  : !existingConsumesFirst && existingConsumesSecond
                    ? HalfDayType.SECOND_HALF
                    : HalfDayType.SPLIT_DAY;

              this.logger.warn(
                `[CREATE] Conflict detected for employee ${data.employeeId}: Existing ${existingTypeLabel} request overlaps with ${overlapDate || existing.fromDate}`,
              );
              throw new ConflictException(
                `Conflict: Request already exists for ${overlapDate || existing.fromDate} (${existingTypeLabel})`,
              );
            }
          }
        }

        // Set duration and list for the rest of the method
        if (data.isHalfDay) {
          data.duration = workingDays * 0.5;
        } else {
          data.duration = workingDays;
        }
        (data as any).availableDates = JSON.stringify(workingDateList);
        this.logger.debug(
          `[CREATE] Calculated duration: ${data.duration} days, dates: ${workingDateList.length}`,
        );

        // --- NEW: Strict Validation for Comp Off ---
        if (data.requestType === LeaveRequestType.COMP_OFF) {
          let compOffDateArray = (data as any).compOffDates;
          if (typeof compOffDateArray === 'string') {
            try {
              compOffDateArray = JSON.parse(compOffDateArray);
            } catch (e) {}
          }

          if (
            !Array.isArray(compOffDateArray) ||
            compOffDateArray.length === 0
          ) {
            throw new BadRequestException(
              'Please select at least one Comp Off credit from the dropdown to proceed with this request type.',
            );
          }

          // Enforce 1-to-1 Date Count Mapping
          if (compOffDateArray.length !== workingDateList.length) {
            this.logger.warn(
              `[CREATE] Comp Off Date Mapping Mismatch: ${compOffDateArray.length} credits selected for ${workingDateList.length} leave days.`,
            );
            throw new BadRequestException(
              `Note: You have selected ${compOffDateArray.length} Comp Off credit dates, but your leave request covers ${workingDateList.length} working days. ` +
                `The system requires a exact 1-to-1 mapping. Please adjust either your date range or your selected credits to match.`,
            );
          }

          const totalCredits = await this.compOffService.calculateTotalDays(
            data.employeeId,
            compOffDateArray,
          );
          const requestedDuration = Number(data.duration || 0);

          if (requestedDuration > totalCredits) {
            this.logger.warn(
              `[CREATE] Comp Off Balance Mismatch: ${requestedDuration} days requested, but only ${totalCredits} credits selected.`,
            );
            throw new BadRequestException(
              `Note: You have selected ${totalCredits} days of Comp Off credits, but your leave request is for ${requestedDuration} days. ` +
                `You can only apply for a Comp Off leave that matches your selected credits. ` +
                `Action: Please reduce your date range to ${totalCredits} days. ` +
                `For the additional ${Number((requestedDuration - totalCredits).toFixed(1))} day(s), please submit a separate 'Apply Leave' or 'Work Management' request.`,
            );
          }
        }
      }

      if (!data.submittedDate) {
        data.submittedDate = dayjs().format('YYYY-MM-DD');
      }

      // Calculation moved to top of method for conflict detection
      if (data.fromDate && data.toDate) {
        // No action needed here
      }

      // --- LOGIC: Populate firstHalf and secondHalf ---
      const mainType =
        data.requestType === LeaveRequestType.COMP_OFF
          ? WorkLocation.COMP_OFF_LEAVE
          : data.requestType === LeaveRequestType.APPLY_LEAVE ||
            data.requestType === LeaveRequestType.HALF_DAY ||
            data.requestType === LeaveRequestType.LEAVE
            ? WorkLocation.LEAVE
            : data.requestType || WorkLocation.OFFICE;

      if (data.isHalfDay) {
        const otherHalf = data.otherHalfType || WorkLocation.OFFICE;

        if (data.halfDayType === HalfDayType.FIRST_HALF) {
          data.firstHalf = mainType;
          data.secondHalf = otherHalf;
        } else if (data.halfDayType === HalfDayType.SECOND_HALF) {
          data.firstHalf = otherHalf;
          data.secondHalf = mainType;
        } else {
          // Fallback if halfDayType is missing but isHalfDay is true
          data.firstHalf = mainType;
          data.secondHalf = otherHalf;
        }
      } else {
        data.firstHalf = mainType;
        data.secondHalf = mainType;
      }

      const leaveRequest = this.leaveRequestRepository.create({
        employeeId: data.employeeId,
        requestType: data.requestType,
        fromDate: data.fromDate,
        toDate: data.toDate,
        title: data.title,
        description: data.description,
        status: data.status as any,
        duration: data.duration,
        halfDayType: data.halfDayType,
        otherHalfType: data.otherHalfType,
        isHalfDay: data.isHalfDay,
        firstHalf: data.firstHalf as any,
        secondHalf: data.secondHalf as any,
        submittedDate: data.submittedDate,
        ccEmails: data.ccEmails?.length ? JSON.stringify(data.ccEmails) : null,
        availableDates: (data as any).availableDates,
      } as unknown as DeepPartial<LeaveRequest>);

      const savedRequest = await this.leaveRequestRepository.save(leaveRequest);
      this.logger.log(
        `[CREATE] Successfully saved leave request ID: ${savedRequest.id} for employee: ${data.employeeId}`,
      );

      if (data.requestType === LeaveRequestType.COMP_OFF && (data as any).compOffDates) {
        try {
          const compOffDateArray = typeof (data as any).compOffDates === 'string' ? JSON.parse((data as any).compOffDates) : (data as any).compOffDates;
          
          let workingDateArray: string[] = [];
          if ((data as any).availableDates) {
            try {
              workingDateArray = JSON.parse((data as any).availableDates);
            } catch (e) {
              this.logger.warn(`[CREATE] Failed to parse availableDates: ${e.message}`);
            }
          }
          
          if (Array.isArray(compOffDateArray) && compOffDateArray.length > 0) {
            const durationPerDay = data.isHalfDay ? 0.5 : 1.0;
            let halfDayLabel = 'Full';
            if (data.isHalfDay) {
              if (data.halfDayType === HalfDayType.FIRST_HALF) {
                halfDayLabel = 'First Half';
              } else if (data.halfDayType === HalfDayType.SECOND_HALF) {
                halfDayLabel = 'Second Half';
              } else {
                halfDayLabel = 'Half Day';
              }
            }

            await this.compOffService.markAsPending(
              data.employeeId, 
              compOffDateArray, 
              workingDateArray,
              durationPerDay, 
              savedRequest.id,
              halfDayLabel
            );
          }
        } catch (e) {
          this.logger.warn(`[CREATE] Failed to handle CompOff dates: ${e.message}`);
        }
      }

      // Link documents to the saved request.
      // Strategy A (precise): when the frontend sends explicit documentKeys (IDs),
      //   link only those exact records. Handles split requests by cloning metadata if already linked.
      // Strategy B (fallback): time-window sweep for any orphaned doc uploaded in the
      //   last 12 h for this employee – covers legacy/offline code paths.
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: savedRequest.employeeId },
        });

        if (employee) {
          if (data.documentKeys && data.documentKeys.length > 0) {
            // Strategy A – precise linking by document ID
            let linkedCount = 0;
            for (const docId of data.documentKeys) {
              const docMeta = await this.documentRepo.findOne({
                where: {
                  id: docId,
                  entityType: EntityType.LEAVE_REQUEST,
                  entityId: employee.id,
                },
              });
              if (docMeta) {
                if (docMeta.refId === 0) {
                  // Direct link for the first time
                  await this.documentRepo.update(
                    { id: docId },
                    { refId: savedRequest.id },
                  );
                  linkedCount++;
                } else if (docMeta.refId !== savedRequest.id) {
                  // If already linked (e.g. in a split request loop), CLONE metadata for this segment
                  const clonedDoc = this.documentRepo.create({
                    ...docMeta,
                    id: undefined, // New UUID
                    refId: savedRequest.id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  });
                  await this.documentRepo.save(clonedDoc);
                  linkedCount++;
                }
              }
            }
            if (linkedCount > 0) {
              this.logger.log(
                `[CREATE] Linked/Cloned ${linkedCount} precise document(s) for request ${savedRequest.id}`,
              );
            }
          } else {
            // Strategy B – fallback: link any recent orphaned docs for this employee
            const orphanedDocs = await this.documentRepo.find({
              where: {
                entityType: EntityType.LEAVE_REQUEST,
                entityId: employee.id,
                refId: 0,
                createdAt: MoreThan(dayjs().subtract(1, 'hour').toDate()),
              },
            });

            if (orphanedDocs.length > 0) {
              await this.documentRepo.update(
                { id: In(orphanedDocs.map((d) => d.id)) },
                { refId: savedRequest.id },
              );
              this.logger.log(
                `[CREATE] Linked ${orphanedDocs.length} orphaned document(s) (time-window) for request ${savedRequest.id}`,
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `[CREATE] Failed to link documents for request ${savedRequest.id}: ${error.message}`,
        );
      }

      await this.notifyManagerOfRequest(savedRequest).catch((e) =>
        this.logger.error(
          `[CREATE] notifyManagerOfRequest failed: ${e.message}`,
        ),
      );
      await this.notifyEmployeeOfSubmission(savedRequest).catch((e) =>
        this.logger.error(
          `[CREATE] notifyEmployeeOfSubmission failed: ${e.message}`,
        ),
      );

      return savedRequest;
    } catch (error) {
      this.logger.error(
        `[CREATE] Failed for employee ${data.employeeId}: ${error.message}`,
        error.stack,
      );
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
      { label: 'Half Day Application', value: HalfDayType.HALF_DAY },
    ];
  }

  async findUnifiedRequests(filters: {
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
  }) {
    this.logger.log(
      `[FETCH] Starting unified request fetch. Filters: ${JSON.stringify(filters)}`,
    );
    try {
      const {
        employeeId,
        department,
        status,
        search,
        month = 'All',
        year = 'All',
        page = 1,
        limit = 10,
        managerName,
        managerId,
      } = filters;

      const query = this.leaveRequestRepository
        .createQueryBuilder('lr')
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
          'lr.updatedAt AS updatedAt',
          'lr.requestModifiedFrom AS requestModifiedFrom',
          'lr.firstHalf AS firstHalf',
          'lr.secondHalf AS secondHalf',
          'lr.isHalfDay AS isHalfDay',
          'lr.ccEmails AS ccEmails',
          'ed.department AS department',
          'ed.fullName AS fullName',
        ]);

      // 1. Employee Filter
      if (employeeId) {
        query.andWhere('lr.employeeId = :employeeId', { employeeId });
      }

      // 2. Manager Filter (from Upstream)
      if (managerName || managerId) {
        const {
          ManagerMapping,
        } = require('../../managerMapping/entities/managerMapping.entity');
        query.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = lr.employeeId');
        query.andWhere(
          '(lr.employeeId = :exactManagerId OR (mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery))',
          {
            exactManagerId: managerId,
            managerNameQuery: `%${managerName}%`,
            managerIdQuery: `%${managerId}%`,
          },
        );
        query.andWhere(
          '(mm.status = :mmStatus OR lr.employeeId = :exactManagerId)',
          {
            mmStatus: ManagerMappingStatus.ACTIVE,
            exactManagerId: managerId,
          },
        );
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
        query.andWhere(
          new Brackets((qb) => {
            const searchPattern = `%${search.toLowerCase()}%`;
            qb.where('LOWER(ed.fullName) LIKE :searchPattern', {
              searchPattern,
            })
              .orWhere('LOWER(lr.employeeId) LIKE :searchPattern', {
                searchPattern,
              })
              .orWhere('LOWER(lr.title) LIKE :searchPattern', {
                searchPattern,
              });
          }),
        );
      }

      // 6. Date Boundaries Filter
      if (year !== 'All' || month !== 'All') {
        if (year !== 'All' && month !== 'All') {
          const monthInt = parseInt(month);
          const yearInt = parseInt(year);
          const monthStart = `${year}-${month.padStart(2, '0')}-01`;
          const lastDay = new Date(yearInt, monthInt, 0).getDate();
          const monthEnd = `${year}-${month.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

          query
            .andWhere('lr.fromDate <= :monthEnd', { monthEnd })
            .andWhere('lr.toDate >= :monthStart', { monthStart });
        } else if (year !== 'All' && month === 'All') {
          const yearStart = `${year}-01-01`;
          const yearEnd = `${year}-12-31`;
          query
            .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
            .andWhere('lr.toDate >= :yearStart', { yearStart });
        } else if (year === 'All' && month !== 'All') {
          const m = parseInt(month);
          query.andWhere(
            new Brackets((qb) => {
              qb.where('MONTH(lr.fromDate) = :m', { m }).orWhere(
                'MONTH(lr.toDate) = :m',
                { m },
              );
            }),
          );
        }
      }

      const total = await query.getCount();

      const data = await query
        .orderBy('lr.createdAt', 'DESC')
        .addOrderBy('lr.updatedAt', 'DESC')
        .addOrderBy('lr.id', 'DESC')
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany();

      this.logger.log(
        `[FETCH] Retrieved ${data.length} requests out of ${total} total`,
      );
      return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(
        `[FETCH] Unified fetch failed: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch requests: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(
    department?: string,
    status?: string,
    search?: string,
    page: number = 1,
    limit: number = 10,
    managerName?: string,
    managerId?: string,
  ) {
    this.logger.log(
      `[FETCH] findAll: Dept=${department}, Status=${status}, Page=${page}`,
    );
    try {
      return await this.findUnifiedRequests({
        department,
        status,
        search,
        page,
        limit,
        managerName,
        managerId,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch all requests: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findByEmployeeId(
    employeeId: string,
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `[FETCH] findByEmployeeId: ID=${employeeId}, Status=${status}`,
    );
    try {
      return await this.findUnifiedRequests({
        employeeId,
        status,
        page,
        limit,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch employee requests: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: number) {
    this.logger.log(`[FETCH] findOne: ID=${id}`);
    try {
      const result = await this.leaveRequestRepository
        .createQueryBuilder('lr')
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
          'lr.ccEmails AS ccEmails',
          'ed.department AS department',
          'ed.fullName AS fullName',
        ])
        .getRawOne();

      if (!result) {
        this.logger.warn(`[FETCH] Request with ID ${id} not found`);
        throw new NotFoundException(`Leave request with ID ${id} not found`);
      }

      const assignedManagerEmail = await this.getAssignedManagerEmail(
        result.employeeId,
      );
      const hrEmail = this.getHrEmail();
      const ccEmailsParsed = result.ccEmails
        ? this._parseCcEmails(result.ccEmails)
        : [];

      return {
        ...result,
        assignedManagerEmail: assignedManagerEmail ?? null,
        hrEmail,
        ccEmails: ccEmailsParsed,
      };
    } catch (error) {
      this.logger.error(
        `[FETCH] findOne failed for ID ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch request: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findUnread(managerName?: string) {
    this.logger.log(`[FETCH] findUnread: Manager=${managerName || 'All'}`);
    try {
      const qb = this.leaveRequestRepository
        .createQueryBuilder('lr')
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
          'ed.fullName AS employeeName',
        ])
        .addSelect(
          `CASE 
          WHEN lr.status = '${LeaveRequestStatus.PENDING}' THEN 1 
          WHEN lr.status = '${LeaveRequestStatus.REQUESTING_FOR_CANCELLATION}' THEN 2
          WHEN lr.status = '${LeaveRequestStatus.APPROVED}' THEN 3
          WHEN lr.status = '${LeaveRequestStatus.CANCELLATION_APPROVED}' THEN 4
          WHEN lr.status = '${LeaveRequestStatus.REQUEST_MODIFIED}' THEN 5
          WHEN lr.status = '${LeaveRequestStatus.REJECTED}' THEN 5
          WHEN lr.status = '${LeaveRequestStatus.CANCELLED}' THEN 6
          ELSE 7 
        END`,
          'priority',
        );

      if (managerName) {
        qb.innerJoin(
          ManagerMapping,
          'mm',
          'mm.employeeId = lr.employeeId AND mm.status = :mStatus',
          { mStatus: ManagerMappingStatus.ACTIVE },
        ).andWhere('mm.managerName = :managerName', { managerName });
      }

      const requests = await qb
        .orderBy('priority', 'ASC')
        .addOrderBy('lr.id', 'DESC')
        .getRawMany();

      this.logger.log(`[FETCH] Retrieved ${requests.length} unread requests`);
      return requests;
    } catch (error) {
      this.logger.error(
        `[FETCH] findUnread failed: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch unread requests: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async markAsRead(id: number) {
    this.logger.log(`[UPDATE] markAsRead: ID=${id}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id },
      });
      if (!request) {
        this.logger.warn(`[UPDATE] markAsRead failed: Request ${id} not found`);
        throw new NotFoundException('Leave request not found');
      }
      request.isRead = true;
      const saved = await this.leaveRequestRepository.save(request);
      this.logger.log(`[UPDATE] Successfully marked request ${id} as read`);
      return saved;
    } catch (error) {
      this.logger.error(
        `[UPDATE] markAsRead failed for ID ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to mark request as read: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // --- Partial Cancellation Logic ---

  async getCancellableDates(id: number, employeeId: string, user?: any) {
    this.logger.log(
      `[CANCEL] getCancellableDates: ID=${id}, Employee=${employeeId}`,
    );
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request) {
        this.logger.warn(
          `[CANCEL] Request ${id} not found for employee ${employeeId}`,
        );
        throw new NotFoundException('Request not found');
      }
      if (
        request.status !== LeaveRequestStatus.APPROVED &&
        request.status !== LeaveRequestStatus.PENDING
      ) {
        this.logger.warn(
          `[CANCEL] Request ${id} is not in APPROVED or PENDING status. Current status: ${request.status}`,
        );
        throw new ForbiddenException(
          'Only approved or pending requests can be checked for cancellation',
        );
      }

      const isPending = request.status === LeaveRequestStatus.PENDING;

      const startDate = dayjs(request.fromDate);
      const endDate = dayjs(request.toDate);
      const diffDays = endDate.diff(startDate, 'day');

      const results: {
        date: string;
        isCancellable: boolean;
        reason: string;
      }[] = [];
      const now = dayjs();

      const roleUpper = (user?.role || '').toUpperCase();
      const isPrivileged =
        user &&
        (user.userType === UserType.ADMIN ||
          user.userType === UserType.MANAGER ||
          roleUpper.includes(UserType.ADMIN) ||
          roleUpper.includes('MNG') ||
          roleUpper.includes(UserType.MANAGER));

      const statuses = [
        LeaveRequestStatus.REQUESTING_FOR_CANCELLATION,
        LeaveRequestStatus.CANCELLATION_APPROVED,
        LeaveRequestStatus.REQUESTING_FOR_MODIFICATION,
        LeaveRequestStatus.MODIFICATION_APPROVED,
        LeaveRequestStatus.CANCELLED,
        LeaveRequestStatus.REQUEST_MODIFIED,
      ];

      // Use a LIKE query to catch both simple IDs and composite ID:TYPE formats
      const existingCancellations = await this.leaveRequestRepository.find({
        where: [
          { requestModifiedFrom: id.toString(), status: In(statuses) },
          { requestModifiedFrom: Like(`${id}:%`), status: In(statuses) },
        ],
      });

      // NEW: If the request has availableDates stored, use that as the source of truth
      let datesFromColumn: string[] | null = null;
      if (request.availableDates) {
        try {
          const parsed = JSON.parse(request.availableDates);
          if (Array.isArray(parsed)) datesFromColumn = parsed;
        } catch (e) {
          this.logger.error(
            `[GET_CANCELLABLE] Failed to parse availableDates for ${id}`,
          );
        }
      }

      for (let i = 0; i <= diffDays; i++) {
        const currentDate = startDate.add(i, 'day');
        const currentStr = currentDate.format('YYYY-MM-DD');

        // Filter: only include dates that ARE in the availableDates list (if column exists)
        if (datesFromColumn && !datesFromColumn.includes(currentStr)) {
          continue;
        }

        const isWknd = await this._isWeekend(currentDate, employeeId);
        if (isWknd) continue;
        const isHol = await this._isHoliday(currentDate);
        if (isHol) continue;

        // Block dates covered by existing cancellation/modification child record
        const isAlreadyCancelled = existingCancellations.some((c: any) => {
          let datesInChild: string[] | null = null;
          if (c.availableDates) {
            try {
              const parsed = JSON.parse(c.availableDates);
              if (Array.isArray(parsed)) datesInChild = parsed;
            } catch (e) {}
          }

          if (datesInChild) {
            return datesInChild.includes(currentStr);
          } else {
            const cStart = dayjs(c.fromDate);
            const cEnd = dayjs(c.toDate);
            return (
              (currentDate.isSame(cStart, 'day') ||
                currentDate.isAfter(cStart, 'day')) &&
              (currentDate.isSame(cEnd, 'day') ||
                currentDate.isBefore(cEnd, 'day'))
            );
          }
        });

        if (isAlreadyCancelled) {
          results.push({
            date: currentStr,
            isCancellable: false,
            reason: 'Already Modified or Cancelled',
          });
          continue;
        }

        const deadline = currentDate.hour(18).minute(30).second(0);
        const isCancellable = isPending
          ? true
          : isPrivileged || now.isBefore(deadline);

        results.push({
          date: currentStr,
          isCancellable,
          reason: isCancellable
            ? isPending
              ? 'Pending request — cancellable'
              : isPrivileged
                ? 'Admin/Manager Bypass'
                : `Deadline: ${deadline.format('DD-MMM HH:mm')}`
            : `Deadline passed (${deadline.format('DD-MMM HH:mm')})`,
        });
      }
      this.logger.log(
        `[CANCEL] Found ${results.length} cancellable dates for request ${id}`,
      );
      return results;
    } catch (error) {
      this.logger.error(
        `[CANCEL] getCancellableDates failed for ID ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to get cancellable dates: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async notifyAdminOfCancellationRequest(
    request: LeaveRequest,
    employeeId: string,
    totalDays?: number,
  ) {
    this.logger.log(
      `[NOTIFY] notifyAdminOfCancellationRequest: RequestID=${request.id}, Employee=${employeeId}`,
    );
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
      });

      if (employee) {
        await this.sendCancellationEmails(
          request,
          employee,
          'request',
          totalDays,
        );
      }
    } catch (error) {
      this.logger.error(
        `[NOTIFY] notifyAdminOfCancellationRequest failed: ${error.message}`,
        error.stack,
      );
    }
  }

  private async copyRequestDocuments(sourceRefId: number, targetRefId: number) {
    this.logger.log(
      `[DOCS] copyRequestDocuments: Source=${sourceRefId}, Target=${targetRefId}`,
    );
    try {
      // Get the correct entityId from the target request's owner
      const targetRequest = await this.leaveRequestRepository.findOne({
        where: { id: targetRefId },
      });
      let correctEntityId: number | undefined;

      if (targetRequest) {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: targetRequest.employeeId },
        });
        if (employee) {
          correctEntityId = employee.id;
        }
      }

      const originalDocs = await this.documentRepo.find({
        where: {
          refId: sourceRefId,
          entityType: EntityType.LEAVE_REQUEST,
        },
      });

      if (originalDocs && originalDocs.length > 0) {
        const clonedDocs = originalDocs.map((doc) => {
          const { id, ...docData } = doc;
          return this.documentRepo.create({
            ...docData,
            refId: targetRefId,
            entityId: correctEntityId || doc.entityId, // Prefer the looked up ID
            s3Key: doc.s3Key || doc.id.toString(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });

        await this.documentRepo.save(clonedDocs);
        this.logger.log(
          `[DOCS] Copied ${clonedDocs.length} documents from request ${sourceRefId} to ${targetRefId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[DOCS] copyRequestDocuments failed: ${error.message}`,
        error.stack,
      );
    }
  }

  async undoCancellationRequest(id: number, employeeId: string) {
    this.logger.log(
      `[UNDO_CANCEL] Starting undo for request ID: ${id}, Employee: ${employeeId}`,
    );
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });

      if (!request) {
        this.logger.warn(
          `[UNDO_CANCEL] Request with ID ${id} not found for employee ${employeeId}`,
        );
        throw new NotFoundException('Request not found');
      }

      if (request.status !== LeaveRequestStatus.REQUESTING_FOR_CANCELLATION) {
        this.logger.warn(
          `[UNDO_CANCEL] Invalid request status for undo: ${request.status} (ID: ${id})`,
        );
        throw new ForbiddenException(
          'Only pending cancellation requests can be undone',
        );
      }

      // Time Check: Next Day 10 AM
      const submissionTime = dayjs(request.submittedDate || request.createdAt);
      const deadline = submissionTime
        .add(1, 'day')
        .hour(10)
        .minute(0)
        .second(0);
      const now = dayjs();

      if (now.isAfter(deadline)) {
        this.logger.warn(
          `[UNDO_CANCEL] Undo deadline passed at ${deadline.format()}. Current time: ${now.format()}`,
        );
        throw new ForbiddenException(
          `Undo window closed. Deadline was ${deadline.format('DD-MMM HH:mm')}`,
        );
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
        this.logger.log(
          `[UNDO_CANCEL] Restored ${restoreDuration} days to master request ${masterRequest.id}`,
        );
      }

      if (request.requestModifiedFrom) {
        // PARTIAL cancellation (child record)
        request.status = LeaveRequestStatus.CANCELLATION_REVERTED;
        request.availableDates = JSON.stringify([]); // Stop claiming dates from the parent
        this.logger.log(
          `[UNDO_CANCEL] Wiped availableDates for child cancellation request ${id}`,
        );
      } else {
        // FULL cancellation (parent record itself)
        // Revert it back to APPROVED so the original leave remains active
        request.status = LeaveRequestStatus.APPROVED;
        this.logger.log(
          `[UNDO_CANCEL] Reverted parent request ${id} to APPROVED status.`,
        );
      }

      const saved = await this.leaveRequestRepository.save(request);
      this.logger.log(
        `[UNDO_CANCEL] Successfully processed undo for request ID: ${id} with status ${request.status}`,
      );

      // --- Email Notifications ---
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });

        if (employee) {
          await this.sendCancellationEmails(request, employee, 'revert');
        }
      } catch (error) {
        this.logger.error(
          `[UNDO_CANCEL] Notification failure: ${error.message}`,
        );
      }

      this._recalcMonthStatus(
        request.employeeId,
        request.fromDate.toString(),
      ).catch(() => {});

      return saved;
    } catch (error) {
      this.logger.error(
        `[UNDO_CANCEL] Failed for request ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to undo cancellation: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async markAllAsRead(managerName?: string) {
    this.logger.log(`[UPDATE] markAllAsRead: ManagerName=${managerName}`);
    try {
      if (managerName) {
        const subquery = this.managerMappingRepository
          .createQueryBuilder('mm')
          .select('mm.employeeId')
          .where('mm.managerName = :managerName', { managerName })
          .andWhere('mm.status = :mStatus', {
            mStatus: ManagerMappingStatus.ACTIVE,
          });

        return await this.leaveRequestRepository
          .createQueryBuilder()
          .update()
          .set({ isRead: true })
          .where('isRead = :isRead', { isRead: false })
          .andWhere('employeeId IN (' + subquery.getQuery() + ')')
          .setParameters(subquery.getParameters())
          .execute();
      }
      return await this.leaveRequestRepository.update(
        { isRead: false },
        { isRead: true },
      );
    } catch (error) {
      this.logger.error(
        `[UPDATE] markAllAsRead failed: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to mark all as read: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: number) {
    this.logger.log(`[DELETE] remove: ID=${id}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id },
      });
      if (!request) {
        this.logger.warn(`[DELETE] Request ${id} not found`);
        throw new NotFoundException('Leave request not found');
      }
      if (request.status !== LeaveRequestStatus.PENDING) {
        this.logger.warn(
          `[DELETE] Request ${id} is not PENDING. Status: ${request.status}`,
        );
        throw new ForbiddenException(
          'Only pending leave requests can be deleted',
        );
      }

      // --- Admin Notification Logic (Before Deletion) ---
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });

        if (employee) {
          await this.sendCancellationEmails(request, employee, 'revert_back');
        }
      } catch (notifyError) {
        this.logger.error(
          `[DELETE] Failed to send admin notification for request ${id}: ${notifyError.message}`,
        );
      }

      // Mark as CANCELLED (as per the existing file requirement: "Instead of deleting, mark as Cancelled so Admin gets a notification")
      request.status = LeaveRequestStatus.CANCELLED;
      request.isRead = false;
      request.availableDates = JSON.stringify([]);
      const result = await this.leaveRequestRepository.save(request);

      this.logger.log(
        `[DELETE] Successfully marked request ${id} as CANCELLED. Wiping attendance...`,
      );
      await this.clearAttendanceForRequest(id).catch((e) =>
        this.logger.error(`[DELETE] Clear attendance failed: ${e.message}`),
      );

      // Trigger month recalculation
      this._recalcMonthStatus(
        request.employeeId,
        request.fromDate.toString(),
      ).catch(() => {});

      return result;
    } catch (error) {
      this.logger.error(
        `[DELETE] remove failed for ID ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to remove request: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Leave balance: entitlement (18 full timer / 12 intern), used (approved leave in year), pending, balance */
  /** Leave balance: entitlement (18 full timer / 12 intern), used (approved leave in year), pending, balance */
  async getLeaveBalance(employeeId: string, year: string) {
    this.logger.log(
      `[STATS] getLeaveBalance: Employee=${employeeId}, Year=${year}`,
    );
    try {
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        throw new BadRequestException('Valid year is required');
      }
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
        select: [
          'id',
          'employeeId',
          'designation',
          'employmentType',
          'joiningDate',
          'conversionDate',
        ],
      });
      if (!employee) {
        this.logger.warn(`[STATS] Employee ${employeeId} not found`);
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }

      // Explicit employment type: FULL_TIMER = 18, INTERN = 12. Else infer from designation (contains "intern").
      const isIntern =
        employee.employmentType === EmploymentType.INTERN ||
        (employee.designation || '')
          .toLowerCase()
          .includes(EmploymentType.INTERN.toLowerCase());

      // Prorate entitlement for the year based on status and conversion date
      const joinDate = dayjs(employee.joiningDate);
      const joinMonth = joinDate.isValid() ? joinDate.month() + 1 : 1;
      const joinYear = joinDate.isValid() ? joinDate.year() : yearNum;

      const convDate = (employee as any).conversionDate
        ? dayjs((employee as any).conversionDate)
        : null;

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
        .andWhere(
          new Brackets((qb) => {
            qb.where('lr.requestType IN (:...leaveTypes)', { leaveTypes })
              .orWhere('lr.firstHalf = :leave', {
                leave: AttendanceStatus.LEAVE,
              })
              .orWhere('lr.secondHalf = :leave', {
                leave: AttendanceStatus.LEAVE,
              });
          }),
        )
        .andWhere('lr.status = :status', {
          status: LeaveRequestStatus.APPROVED,
        })
        .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
        .andWhere('lr.toDate >= :yearStart', { yearStart })
        .getRawOne();

      const used = parseFloat(usedResult?.total || '0');

      const pendingResult = await this.leaveRequestRepository
        .createQueryBuilder('lr')
        .select('SUM(lr.duration)', 'total')
        .where('lr.employeeId = :employeeId', { employeeId })
        .andWhere(
          new Brackets((qb) => {
            qb.where('lr.requestType IN (:...leaveTypes)', { leaveTypes })
              .orWhere('lr.firstHalf = :leave', {
                leave: AttendanceStatus.LEAVE,
              })
              .orWhere('lr.secondHalf = :leave', {
                leave: AttendanceStatus.LEAVE,
              });
          }),
        )
        .andWhere('lr.status = :status', { status: LeaveRequestStatus.PENDING })
        .andWhere('lr.fromDate <= :yearEnd', { yearEnd })
        .andWhere('lr.toDate >= :yearStart', { yearStart })
        .getRawOne();

      const pending = parseFloat(pendingResult?.total || '0');
      const balance = Math.max(0, entitlement - used);

      this.logger.log(
        `[STATS] getLeaveBalance completed for ${employeeId}: Entitlement=${entitlement}, Used=${used}, Balance=${balance}`,
      );
      return { employeeId, year: yearNum, entitlement, used, pending, balance };
    } catch (error) {
      this.logger.error(
        `[STATS] getLeaveBalance failed for ${employeeId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch leave balance: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getStats(
    employeeId: string,
    month: string = 'All',
    year: string = 'All',
  ) {
    this.logger.log(
      `[STATS] getStats: Employee=${employeeId}, Month=${month}, Year=${year}`,
    );
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
        if (month !== 'All' && parseInt(reqMonth) !== parseInt(month))
          return false;
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

        if (
          status !== LeaveRequestStatus.CANCELLATION_APPROVED &&
          status !== LeaveRequestStatus.REQUESTING_FOR_CANCELLATION
        ) {
          target.applied++;
        }

        if (
          status === LeaveRequestStatus.APPROVED ||
          status === LeaveRequestStatus.REQUESTING_FOR_CANCELLATION
        ) {
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
      this.logger.error(
        `[STATS] getStats failed for ${employeeId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch stats: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateStatus(
    id: number,
    status: LeaveRequestStatus,
    employeeId?: string,
    reviewedBy?: string,
    reviewerEmail?: string,
  ) {
    this.logger.log(
      `[UPDATE_STATUS] id=${id}, status=${status}, reviewedBy=${reviewedBy}`,
    );
    try {
      if (reviewerEmail && !reviewerEmail.includes('@')) {
        const reviewerEmp = await this.employeeDetailsRepository.findOne({
          where: { employeeId: reviewerEmail },
        });
        if (reviewerEmp?.email) reviewerEmail = reviewerEmp.email;
      }
      if (!reviewerEmail || !reviewerEmail.includes('@')) {
        if (reviewedBy) {
          const mgr = await this.employeeDetailsRepository.findOne({
            where: { fullName: reviewedBy },
          });
          if (mgr?.email) reviewerEmail = mgr.email;
        }
        if (
          (!reviewerEmail || !reviewerEmail.includes('@')) &&
          reviewedBy === UserType.ADMIN
        ) {
          reviewerEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
        }
      }

      const request = await this.leaveRequestRepository.findOne({
        where: { id },
      });
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

      // If a request enters a terminal "FAILED" state, clear availableDates.
      // This ensures they don't appear as barriers or claimed dates.
      const terminalFailedStatuses = [
        LeaveRequestStatus.REJECTED,
        LeaveRequestStatus.CANCELLED,
        LeaveRequestStatus.MODIFICATION_REJECTED,
        LeaveRequestStatus.CANCELLATION_REJECTED,
        LeaveRequestStatus.MODIFICATION_CANCELLED,
        LeaveRequestStatus.CANCELLATION_REVERTED,
      ];

      if (terminalFailedStatuses.includes(status as any)) {
        const isChild = !!request.requestModifiedFrom;
        // 1. Child records ALWAYS get wiped on failure.
        // 2. Parent records get wiped if they are TRULY terminal (REJECTED/CANCELLED)
        //    and NOT being reverted to APPROVED (handled in reversion logic below).
        //    Actually, we'll save the parent record again in reversion logic, so it's safe to wipe here if it's currently a failed status.
        if (
          isChild ||
          status === LeaveRequestStatus.REJECTED ||
          status === LeaveRequestStatus.CANCELLED ||
          status === LeaveRequestStatus.MODIFICATION_REJECTED ||
          status === LeaveRequestStatus.CANCELLATION_REJECTED
        ) {
          savedRequest.availableDates = JSON.stringify([]);
          await this.leaveRequestRepository.save(savedRequest);
          this.logger.log(
            `[UPDATE_STATUS] Wiped availableDates for request ${id} (Status: ${status})`,
          );

          // Restore CompOffs if this was a CompOff request
          if (request.requestType === LeaveRequestType.COMP_OFF) {
            await this.compOffService.restoreCompOffs(id);
          }
        }
      }
      const attendanceUpdates: any[] = [];
      const reqType = request.requestType
        ? request.requestType.trim().toLowerCase()
        : '';

      if (
        status === LeaveRequestStatus.APPROVED ||
        status === LeaveRequestStatus.MODIFICATION_APPROVED
      ) {
        try {
          this.logger.log(
            `[UPDATE_STATUS] Processing Approval Automation for Request ID: ${id} (${reqType})`,
          );
          const startDate = dayjs(request.fromDate);
          const endDate = dayjs(request.toDate);
          const diff = endDate.diff(startDate, 'day');

          // NEW: Ensure availableDates is populated if missing (legacy) or recalculated for modifications
          if (
            !request.availableDates ||
            status === LeaveRequestStatus.MODIFICATION_APPROVED
          ) {
            const list: string[] = [];
            for (let i = 0; i <= diff; i++) {
              const d = startDate.add(i, 'day');
              const isWknd = await this._isWeekend(d, request.employeeId);
              const isHol = await this._isHoliday(d);
              if (!isWknd && !isHol) list.push(d.format('YYYY-MM-DD'));
            }
            request.availableDates = JSON.stringify(list);
            await this.leaveRequestRepository.save(request);
          }

          let validDates: string[] = [];
          if (request.availableDates) {
            try {
              validDates = JSON.parse(request.availableDates);
            } catch (e) {}
          }

          let allowedCompOffDays = await this.compOffService.getAvailableBalance(
            request.employeeId,
            request.id,
          );
          const reqTypeForLoop = String(request.requestType).toLowerCase();
          // The compOffDates column was removed from LeaveRequest entity. 
          // Logic for limiting comp-off days based on that column is also removed.
          let usedCompOffDays = 0;

          for (let i = 0; i <= diff; i++) {
            const targetDate = startDate.add(i, 'day');
            const targetDateStr = targetDate.format('YYYY-MM-DD');

            if (validDates.length > 0 && !validDates.includes(targetDateStr)) {
              this.logger.debug(
                `[UPDATE_STATUS] Skipping date ${targetDateStr} as it is not in availableDates`,
              );
              continue;
            }

            const isWknd = await this._isWeekend(
              targetDate,
              request.employeeId,
            );
            if (isWknd) continue;

            const isHol = await this._isHoliday(targetDate);
            if (isHol) {
              this.logger.debug(
                `[UPDATE_STATUS] Skipping holiday date ${targetDateStr}`,
              );
              continue;
            }

            const startOfDay = targetDate.startOf('day').toDate();
            const endOfDay = targetDate.endOf('day').toDate();

            let attendance = await this.employeeAttendanceRepository.findOne({
              where: {
                employeeId: request.employeeId,
                workingDate: Between(startOfDay, endOfDay),
              },
            });

            let firstHalf = request.firstHalf || WorkLocation.OFFICE;
            let secondHalf = request.secondHalf || WorkLocation.OFFICE;

            if (reqTypeForLoop === LeaveRequestType.COMP_OFF.toLowerCase()) {
              const dayCost = request.isHalfDay ? 0.5 : 1;

              // Use 'Comp-Off Leave' label for attendance records
              if (
                String(firstHalf) === (LeaveRequestType.COMP_OFF as string) ||
                String(firstHalf).toLowerCase().includes('comp off')
              ) {
                firstHalf = WorkLocation.COMP_OFF_LEAVE;
              }
              if (
                String(secondHalf) === (LeaveRequestType.COMP_OFF as string) ||
                String(secondHalf).toLowerCase().includes('comp off')
              ) {
                secondHalf = WorkLocation.COMP_OFF_LEAVE;
              }

              if (usedCompOffDays + dayCost <= allowedCompOffDays) {
                usedCompOffDays += dayCost;
              }
            }
            const calculatedHours = this.calculateTotalHours(
              firstHalf,
              secondHalf,
            );

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
              this.logger.log(
                `[UPDATE_STATUS] Created attendance record for ${targetDate.format('YYYY-MM-DD')}`,
              );
            } else {
              await this.employeeAttendanceRepository
                .createQueryBuilder()
                .update(EmployeeAttendance)
                .set({
                  totalHours: calculatedHours,
                  status: derivedStatus,
                  firstHalf: firstHalf as any,
                  secondHalf: secondHalf as any,
                  sourceRequestId: request.id,
                  workLocation: null,
                })
                .where('id = :id', { id: attendance.id })
                .execute();
              this.logger.log(
                `[UPDATE_STATUS] Updated attendance record ${attendance.id}`,
              );
            }

            attendanceUpdates.push({
              id: attendance.id,
              workingDate: targetDate.format('YYYY-MM-DD'),
              status: derivedStatus,
              totalHours: calculatedHours,
            });
          }

          if (reqType === LeaveRequestType.COMP_OFF.toLowerCase()) {
            await this.compOffService.consumeCompOffs(request.id);
            this.logger.log(`[UPDATE_STATUS] Consumed Comp Off day(s) for ${request.employeeId} via leaveRequestId ${request.id}`);
          }

        } catch (e) {
          this.logger.error(
            `[UPDATE_STATUS] Error in approval automation: ${e.message}`,
            e.stack,
          );
        }
      }

      if (
        status === LeaveRequestStatus.REJECTED ||
        status === LeaveRequestStatus.CANCELLED ||
        status === LeaveRequestStatus.CANCELLATION_APPROVED
      ) {
        try {
          let cleanDates: string[] = [];
          if (request.availableDates) {
            try {
              cleanDates = JSON.parse(request.availableDates);
            } catch (e) {}
          }
          if (cleanDates.length === 0) {
            let cur = dayjs(request.fromDate);
            const end = dayjs(request.toDate);
            while (cur.isBefore(end) || cur.isSame(end, 'day')) {
              cleanDates.push(cur.format('YYYY-MM-DD'));
              cur = cur.add(1, 'day');
            }
          }

          if (cleanDates.length > 0) {
            const query = this.employeeAttendanceRepository
              .createQueryBuilder()
              .update(EmployeeAttendance);

            // Wipe all associated attendance data for this request on these dates
            query.set({
              sourceRequestId: () => 'NULL',
              status: () => 'NULL',
              totalHours: () => 'NULL',
              firstHalf: () => 'NULL',
              secondHalf: () => 'NULL',
              workLocation: () => 'NULL',
            });

            const parentIdVal = request.requestModifiedFrom
              ? String(request.requestModifiedFrom).split(':')[0]
              : null;
            const idsToCheck = [id];
            if (parentIdVal && !isNaN(Number(parentIdVal)))
              idsToCheck.push(Number(parentIdVal));

            query.where('sourceRequestId IN (:...idsToCheck)', { idsToCheck });
            query.andWhere('workingDate IN (:...cleanDates)', { cleanDates });

            const result = await query.execute();
            this.logger.log(
              `[UPDATE_STATUS] Cleared ${result.affected ?? 0} records for request ${id} on dates ${cleanDates.join(',')}`,
            );
            if (result.affected && result.affected > 0) {
              attendanceUpdates.push({
                action: 'CLEARED',
                affectedCount: result.affected,
              });
            }

            if (request.requestType === LeaveRequestType.COMP_OFF || String(request.requestType).toLowerCase() === LeaveRequestType.COMP_OFF.toLowerCase()) {
                // Restoration is now handled earlier in the updateStatus via leaveRequestId link
                await this.compOffService.restoreCompOffs(id);
            }
          }
        } catch (err) {
          this.logger.error(
            `[UPDATE_STATUS] Failed to clear attendance for request ${id}: ${err.message}`,
          );
        }
      }

      // Notifications
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });
        if (employee) {
          if (
            status === LeaveRequestStatus.CANCELLED &&
            previousStatus === LeaveRequestStatus.PENDING
          ) {
            const adminEmail = (
              process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME
            )?.trim();
            if (adminEmail) {
              const requestTypeLabel =
                request.requestType === LeaveRequestType.APPLY_LEAVE
                  ? AttendanceStatus.LEAVE
                  : request.requestType;
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
              const managerEmail = await this.getAssignedManagerEmail(
                request.employeeId,
              );
              const hrEmail = this.getHrEmail();
              const parsedCc = this._parseCcEmails(request.ccEmails);
              const cancelCc = [managerEmail, hrEmail, ...parsedCc].filter(
                (e): e is string => !!e && e.includes('@'),
              );
              const cancelCcList = [...new Set(cancelCc)].filter(
                (e) => e.toLowerCase() !== adminEmail.toLowerCase(),
              );
              await this.emailService.sendEmail(
                adminEmail,
                `Request Cancelled: ${requestTypeLabel} - ${employee.fullName}`,
                `Request Cancelled by ${employee.fullName}`,
                adminHtml,
                undefined,
                cancelCcList.length > 0 ? cancelCcList : undefined,
              );
              this.logger.log(
                `[UPDATE_STATUS] Employee self-cancel notification sent to Admin (CC: Manager, HR, CC)`,
              );
            }
          }

          await this.sendStatusUpdateEmails(
            request,
            employee,
            status,
            previousStatus,
          );
        }
      } catch (error) {
        this.logger.error(
          `[UPDATE_STATUS] Notification error: ${error.message}`,
        );
      }

      // NEW: REVERSION LOGIC
      // If a Modification Request (either full parent or partial child) is REJECTED,
      // and it was originally an Approved leave, we should ensure the "original" stays.
      // 1. If it's a FULL modification (editing the parent directly), revert parent to APPROVED.
      if (
        status === LeaveRequestStatus.REJECTED &&
        previousStatus === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION
      ) {
        if (!request.requestModifiedFrom) {
          // This was a full modification on the parent itself. Revert it.
          request.status = LeaveRequestStatus.APPROVED;
          await this.leaveRequestRepository.save(request);
          this.logger.log(
            `[UPDATE_STATUS] Reverted request ${id} back to APPROVED after modification rejection.`,
          );
        }
      }

      // 2. If a FULL cancellation request is REJECTED, revert it to APPROVED.
      if (
        status === LeaveRequestStatus.REJECTED &&
        previousStatus === LeaveRequestStatus.REQUESTING_FOR_CANCELLATION
      ) {
        if (!request.requestModifiedFrom) {
          request.status = LeaveRequestStatus.APPROVED;
          await this.leaveRequestRepository.save(request);
          this.logger.log(
            `[UPDATE_STATUS] Reverted request ${id} back to APPROVED after cancellation rejection (full).`,
          );
        }
      }

      // If a cancellation or modification request is approved, update the parent record
      if (
        (status === LeaveRequestStatus.CANCELLATION_APPROVED ||
          status === LeaveRequestStatus.MODIFICATION_APPROVED) &&
        request.requestModifiedFrom
      ) {
        try {
          const parentId = Number(
            String(request.requestModifiedFrom).split(':')[0],
          );
          if (!isNaN(parentId)) {
            const parent = await this.leaveRequestRepository.findOne({
              where: { id: parentId },
            });
            if (parent) {
              // Dates being "removed" from the parent (either cancelled or modified elsewhere)
              let removedDates: string[] = [];
              if (request.availableDates) {
                try {
                  const parsed = JSON.parse(request.availableDates);
                  if (Array.isArray(parsed)) removedDates = parsed;
                } catch (e) {}
              }

              if (removedDates.length === 0) {
                let cur = dayjs(request.fromDate);
                const end = dayjs(request.toDate);
                while (cur.isBefore(end) || cur.isSame(end, 'day')) {
                  const isWknd = await this._isWeekend(cur, request.employeeId);
                  const isHol = await this._isHoliday(cur);
                  if (!isWknd && !isHol) {
                    removedDates.push(cur.format('YYYY-MM-DD'));
                  }
                  cur = cur.add(1, 'day');
                }
              }
              const removedDatesSet = new Set(removedDates);

              let allParentDates: string[] = [];
              if (parent.availableDates) {
                try {
                  const parsed = JSON.parse(parent.availableDates);
                  if (Array.isArray(parsed)) allParentDates = parsed;
                } catch (e) {}
              }

              if (allParentDates.length === 0) {
                let pCur = dayjs(parent.fromDate);
                const pEnd = dayjs(parent.toDate);
                while (pCur.isBefore(pEnd) || pCur.isSame(pEnd, 'day')) {
                  const isWknd = await this._isWeekend(
                    pCur,
                    request.employeeId,
                  );
                  const isHol = await this._isHoliday(pCur);
                  if (!isWknd && !isHol) {
                    allParentDates.push(pCur.format('YYYY-MM-DD'));
                  }
                  pCur = pCur.add(1, 'day');
                }
              }

              const remainingDates = allParentDates.filter(
                (d) => !removedDatesSet.has(d),
              );

              let remainingWorkingDays = 0;
              for (const rd of remainingDates) {
                const isWknd = await this._isWeekend(
                  dayjs(rd),
                  request.employeeId,
                );
                const isHol = await this._isHoliday(dayjs(rd));
                if (!isWknd && !isHol) remainingWorkingDays++;
              }

              if (remainingWorkingDays === 0 || remainingDates.length === 0) {
                parent.status = status; // Reflect the final state
                parent.duration = 0;
                parent.availableDates = JSON.stringify([]);
              } else {
                // Determine if parent was half day by checking original duration / original working dates
                const originalWorkingDays = allParentDates.length;
                const isParentHalfDay = parent.isHalfDay || (originalWorkingDays > 0 && parent.duration < originalWorkingDays);
                
                parent.duration = isParentHalfDay
                  ? Number((remainingWorkingDays * 0.5).toFixed(1))
                  : remainingWorkingDays;
                parent.fromDate = remainingDates[0];
                parent.toDate = remainingDates[remainingDates.length - 1];
                parent.availableDates = JSON.stringify(remainingDates);
                parent.isModified = true;
                parent.modificationCount = (parent.modificationCount || 0) + 1;
                parent.lastModifiedDate = new Date();
                
                if (isParentHalfDay) parent.isHalfDay = true;
              }
              await this.leaveRequestRepository.save(parent);
              this.logger.log(
                `[UPDATE_STATUS] Updated parent request ${parentId} (Modified: ${parent.isModified}) duration to ${parent.duration} due to ${status}`,
              );
            }
          }
        } catch (err) {
          this.logger.error(
            `[UPDATE_STATUS] Failed to update parent record: ${err.message}`,
          );
        }
      }

      this._recalcMonthStatus(
        request.employeeId,
        String(request.fromDate),
      ).catch(() => {});

      this.logger.log(
        `[UPDATE_STATUS] Successfully updated request ${id} to ${status}`,
      );
      return {
        message: `Request ${status} successfully`,
        status,
        id,
        employeeId: request.employeeId,
        requestType: request.requestType,
        updatedRequest: {
          id: savedRequest.id,
          status: savedRequest.status,
          reviewedBy: savedRequest.reviewedBy,
        },
        attendanceUpdates,
      };
    } catch (error) {
      this.logger.error(
        `[UPDATE_STATUS] Failed for request ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to update leave request status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * [NEW] Explicit Attendance Clearance API
   * Wipes attendance data for a cancelled request to make it visible in network logs.
   */
  async clearAttendanceForRequest(id: number) {
    this.logger.log(`[CLEAR_ATTENDANCE] id=${id}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id },
      });
      if (!request) {
        throw new NotFoundException('Leave request not found');
      }

      let cleanDates: string[] = [];
      if (request.availableDates) {
        try {
          cleanDates = JSON.parse(request.availableDates);
        } catch (e) {}
      }
      if (cleanDates.length === 0) {
        let cur = dayjs(request.fromDate);
        const end = dayjs(request.toDate);
        while (cur.isBefore(end) || cur.isSame(end, 'day')) {
          cleanDates.push(cur.format('YYYY-MM-DD'));
          cur = cur.add(1, 'day');
        }
      }

      let affected = 0;
      if (cleanDates.length > 0) {
        const query = this.employeeAttendanceRepository
          .createQueryBuilder()
          .update(EmployeeAttendance);

        query.set({
          status: () => 'NULL',
          totalHours: () => 'NULL',
          workLocation: () => 'NULL',
          sourceRequestId: () => 'NULL',
          firstHalf: () => 'NULL',
          secondHalf: () => 'NULL',
        });

        const parentIdVal = request.requestModifiedFrom
          ? String(request.requestModifiedFrom).split(':')[0]
          : null;
        const idsToCheck = [id];
        if (parentIdVal && !isNaN(Number(parentIdVal)))
          idsToCheck.push(Number(parentIdVal));

        query.where(
          new Brackets((qb) => {
            qb.where('sourceRequestId IN (:...idsToCheck)', {
              idsToCheck,
            }).orWhere('employeeId = :employeeId', {
              employeeId: request.employeeId,
            });
          }),
        );
        query.andWhere('workingDate IN (:...cleanDates)', { cleanDates });

        const result = await query.execute();
        affected = result.affected ?? 0;
        this.logger.log(
          `[CLEAR_ATTENDANCE] Result: ${affected} records affected.`,
        );
      }
      this._recalcMonthStatus(
        request.employeeId,
        request.fromDate.toString(),
      ).catch(() => {});

      return {
        success: true,
        affected: affected,
        employeeId: request.employeeId,
        clearedFields: [
          'status',
          'totalHours',
          'workLocation',
          'sourceRequestId',
          'firstHalf',
          'secondHalf',
        ],
      };
    } catch (err) {
      this.logger.error(
        `[CLEAR_ATTENDANCE] Failed for request ${id}: ${err.message}`,
        err.stack,
      );
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        'Failed to clear attendance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createModification(id: number, data: any) {
    this.logger.log(`[MODIFY] createModification for parent ${id}`);
    try {
      const parent = await this.leaveRequestRepository.findOne({
        where: { id },
      });
      if (!parent) throw new NotFoundException('Original request not found');

      const modification = new LeaveRequest();
      modification.employeeId = parent.employeeId;
      modification.requestType = parent.requestType;
      modification.fromDate = data.fromDate;
      modification.toDate = data.toDate;
      modification.status = data.overrideStatus || 'Request Modified';
      modification.title = parent.title;
      const descPrefix =
        data.overrideStatus === LeaveRequestStatus.APPROVED
          ? 'Split Segment'
          : 'Request Modified';
      modification.description = `${descPrefix}: ${parent.description || ''} (Modification due to ${data.sourceRequestType} conflict)`;
      modification.submittedDate = new Date().toISOString().slice(0, 10);
      modification.isRead = true;
      modification.isReadEmployee = false;
      modification.duration =
        data.duration ||
        (dayjs(data.toDate).diff(dayjs(data.fromDate), 'day') + 1) *
          (parent.isHalfDay ? 0.5 : 1);
      modification.requestModifiedFrom = `${parent.id}:${data.sourceRequestType || parent.requestType}`;

      // NEW: Calculate availableDates for the modification
      const mStart = dayjs(modification.fromDate);
      const mEnd = dayjs(modification.toDate);
      const mDiff = mEnd.diff(mStart, 'day');
      const mList: string[] = [];
      for (let i = 0; i <= mDiff; i++) {
        const d = mStart.add(i, 'day');
        const isWknd = await this._isWeekend(d, modification.employeeId);
        const isHol = await this._isHoliday(d);
        if (!isWknd && !isHol) mList.push(d.format('YYYY-MM-DD'));
      }
      modification.availableDates = JSON.stringify(mList);

      const savedModification =
        await this.leaveRequestRepository.save(modification);
      // Removed copyRequestDocuments so modification only contains new modification documents

      if (
        modification.status === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION
      ) {
        try {
          const mapping = await this.managerMappingRepository.findOne({
            where: {
              employeeId: parent.employeeId,
              status: ManagerMappingStatus.ACTIVE,
            },
          });
          if (mapping) {
            const manager = await this.userRepository.findOne({
              where: { aliasLoginName: mapping.managerName },
            });
            if (manager && manager.loginId) {
              await this.notificationsService.createNotification({
                employeeId: manager.loginId,
                title: 'Modification Request',
                message: `${parent.employeeId} requested to Modify an approved Leave.`,
                type: 'alert',
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
      this.logger.error(
        `[MODIFY] createModification failed for ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to create modification',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // NEW: Dedicated API for Rejecting Cancellation
  async rejectCancellation(
    id: number,
    employeeId: string,
    reviewedBy?: string,
    reviewerEmail?: string,
  ) {
    this.logger.log(
      `[REJECT_CANCELLATION] id=${id}, employee=${employeeId}, reviewedBy=${reviewedBy}`,
    );
    try {
      if (reviewerEmail && !reviewerEmail.includes('@')) {
        const reviewerEmp = await this.employeeDetailsRepository.findOne({
          where: { employeeId: reviewerEmail },
        });
        if (reviewerEmp?.email) reviewerEmail = reviewerEmp.email;
      }
      if (!reviewerEmail || !reviewerEmail.includes('@')) {
        if (reviewedBy) {
          const mgr = await this.employeeDetailsRepository.findOne({
            where: { fullName: reviewedBy },
          });
          if (mgr?.email) reviewerEmail = mgr.email;
        }
        if (
          (!reviewerEmail || !reviewerEmail.includes('@')) &&
          reviewedBy === UserType.ADMIN
        ) {
          reviewerEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME;
        }
      }

      const request = await this.leaveRequestRepository.findOne({
        where: { id },
      });
      if (!request) {
        throw new NotFoundException(`Leave request with ID ${id} not found`);
      }

      const checkStart = dayjs(request.fromDate).format('YYYY-MM-DD');
      const checkEnd = dayjs(request.toDate).format('YYYY-MM-DD');

      if (request.requestModifiedFrom) {
        // Partial cancellation rejection
        request.status = LeaveRequestStatus.CANCELLATION_REJECTED;
        request.availableDates = JSON.stringify([]); // Ensure it doesn't block
        this.logger.log(
          `[REJECT_CANCELLATION] Partial cancellation ${id} rejected. availableDates wiped.`,
        );
      } else {
        // Full cancellation rejection - Revert parent to APPROVED
        request.status = LeaveRequestStatus.APPROVED;
        this.logger.log(
          `[REJECT_CANCELLATION] Full cancellation ${id} rejected. Reverted to APPROVED.`,
        );
      }

      request.isReadEmployee = false;
      if (reviewedBy) request.reviewedBy = reviewedBy;
      await this.leaveRequestRepository.save(request);

      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });
        if (employee) {
          await this.sendStatusUpdateEmails(request, employee, request.status);
        }
      } catch (e) {
        this.logger.error(`[REJECT_CANCELLATION] Email failed: ${e.message}`);
      }

      this._recalcMonthStatus(
        request.employeeId,
        String(request.fromDate),
      ).catch(() => {});
      this.logger.log(
        `[REJECT_CANCELLATION] Successfully rejected cancellation for request ${id}`,
      );
      return request;
    } catch (error) {
      this.logger.error(
        `[REJECT_CANCELLATION] Failed for request ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to reject cancellation',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Helper to revert attendance for the given range (when cancellation is approved)
  private async revertAttendance(
    employeeId: string,
    fromDate: string,
    toDate: string,
  ) {
    this.logger.log(
      `[REVERT_ATTENDANCE] Reverting for ${employeeId} from ${fromDate} to ${toDate}`,
    );
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
      this.logger.log(
        `[REVERT_ATTENDANCE] Reverted ${records.length} records for ${employeeId}`,
      );
    } catch (error) {
      this.logger.error(
        `[REVERT_ATTENDANCE] Failed for ${employeeId}: ${error.message}`,
        error.stack,
      );
    }
  }

  async updateParentRequest(
    parentId: number,
    duration: number,
    fromDate: string,
    toDate: string,
  ) {
    this.logger.log(
      `[UPDATE_PARENT] id=${parentId}, duration=${duration}, from=${fromDate}, to=${toDate}`,
    );
    try {
      if (!parentId) throw new BadRequestException('Parent ID is required');
      if (!fromDate) throw new BadRequestException('From Date is required');
      if (!toDate) throw new BadRequestException('To Date is required');

      const parentRequest = await this.leaveRequestRepository.findOne({
        where: { id: parentId },
      });
      if (!parentRequest)
        throw new NotFoundException('Parent Request not found');

      parentRequest.duration = duration;
      parentRequest.fromDate = dayjs(fromDate).format('YYYY-MM-DD');
      parentRequest.toDate = dayjs(toDate).format('YYYY-MM-DD');

      const saved = await this.leaveRequestRepository.save(parentRequest);
      this.logger.log(
        `[UPDATE_PARENT] Successfully updated parent request ${parentId}`,
      );
      return saved;
    } catch (error) {
      this.logger.error(
        `[UPDATE_PARENT] Failed for ${parentId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Update Failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelApprovedDates(
    id: number,
    employeeId: string,
    datesToCancel: string[],
    user?: any,
  ) {
    this.logger.log(
      `[CANCEL] Selective dates: id=${id}, employee=${employeeId}, dates=${datesToCancel.join(',')}`,
    );
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request) throw new NotFoundException('Request not found');

      const isPendingRequest = request.status === LeaveRequestStatus.PENDING;

      const roleUpper = (user?.role || '').toUpperCase();
      const isPrivileged =
        user &&
        (user.userType === UserType.ADMIN ||
          user.userType === UserType.MANAGER ||
          roleUpper.includes(UserType.ADMIN) ||
          roleUpper.includes('MNG') ||
          roleUpper.includes(UserType.MANAGER));

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
              const isHol = await this._isHoliday(temp);
              if (!isHol) {
                hasWorkDayGap = true;
                break;
              }
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

      if (isPendingRequest) {
        // --- PENDING REQUEST CANCELLATION ---
        const cancelledDateSet = new Set(
          datesToCancel.map((d) => dayjs(d).format('YYYY-MM-DD')),
        );

        // CRITICAL FIX: Only exclude dates from the SAME parent request chain
        const existingChildCancels = await this.leaveRequestRepository.find({
          where: {
            employeeId,
            // Catch ID or ID:TYPE
            requestModifiedFrom: Like(`${request.id}%`),
            status: LeaveRequestStatus.CANCELLED,
          },
        });
        for (const child of existingChildCancels) {
          if (child.id === request.id) continue;
          let datesInChild: string[] = [];
          if (child.availableDates) {
            try {
              const parsed = JSON.parse(child.availableDates);
              if (Array.isArray(parsed)) datesInChild = parsed;
            } catch (e) {}
          }
          if (datesInChild.length > 0) {
            datesInChild.forEach((d) => cancelledDateSet.add(d));
          } else {
            let cIter = dayjs(child.fromDate);
            const cEnd = dayjs(child.toDate);
            while (cIter.isBefore(cEnd) || cIter.isSame(cEnd, 'day')) {
              cancelledDateSet.add(cIter.format('YYYY-MM-DD'));
              cIter = cIter.add(1, 'day');
            }
          }
        }

        let allDates: string[] = [];
        if (request.availableDates) {
          try {
            const parsed = JSON.parse(request.availableDates);
            if (Array.isArray(parsed)) allDates = parsed;
          } catch (e) {}
        }

        if (allDates.length === 0) {
          let curIter = dayjs(request.fromDate);
          const endIter = dayjs(request.toDate);
          while (curIter.isBefore(endIter) || curIter.isSame(endIter, 'day')) {
            const isWknd = await this._isWeekend(curIter, employeeId);
            const isHol = await this._isHoliday(curIter);
            if (!isWknd && !isHol) {
              allDates.push(curIter.format('YYYY-MM-DD'));
            }
            curIter = curIter.add(1, 'day');
          }
        }
        const remainingDates = allDates.filter((d) => !cancelledDateSet.has(d));

        let remainingWorkingDays = 0;
        let firstRemainingWorkingDate: string | null = null;
        let lastRemainingWorkingDate: string | null = null;
        for (const rd of remainingDates) {
          const isWknd = await this._isWeekend(dayjs(rd), employeeId);
          const isHol = await this._isHoliday(dayjs(rd));
          if (!isWknd && !isHol) {
            remainingWorkingDays++;
            if (!firstRemainingWorkingDate) firstRemainingWorkingDate = rd;
            lastRemainingWorkingDate = rd;
          }
        }
        const updatedParentDuration = request.isHalfDay
          ? remainingWorkingDays * 0.5
          : remainingWorkingDays;

        if (updatedParentDuration === 0 || !firstRemainingWorkingDate) {
          request.status = LeaveRequestStatus.CANCELLED;
          request.duration = 0;
          request.availableDates = JSON.stringify([]);
          await this.leaveRequestRepository.save(request);
        } else {
          for (const range of ranges) {
            const newRequest = this.leaveRequestRepository.create({
              ...(request as any),
              id: undefined,
              fromDate: range.start,
              toDate: range.end,
              status: LeaveRequestStatus.CANCELLED,
              isRead: false,
              isReadEmployee: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              duration: request.isHalfDay ? range.count * 0.5 : range.count,
              requestModifiedFrom: `${request.id}:${request.requestType}`,
              availableDates: JSON.stringify(
                datesToCancel.filter((d) => {
                  const ds = dayjs(d).format('YYYY-MM-DD');
                  return ds >= range.start && ds <= range.end;
                }),
              ),
            }) as unknown as LeaveRequest;

            const savedNew = await this.leaveRequestRepository.save(newRequest);
            await this.copyRequestDocuments(request.id, savedNew.id);
            createdRequests.push(savedNew);
          }

          // Use first/last WORKING day as boundaries so the next partial
          // cancel starts from the correct range (not a stale weekend date).
          request.duration = updatedParentDuration;
          request.fromDate = firstRemainingWorkingDate;
          request.toDate = lastRemainingWorkingDate!;
          request.availableDates = JSON.stringify(remainingDates);
          await this.leaveRequestRepository.save(request);
        }

        try {
          const mapping = await this.managerMappingRepository.findOne({
            where: { employeeId, status: ManagerMappingStatus.ACTIVE },
          });
          if (mapping) {
            const manager = await this.userRepository.findOne({
              where: { aliasLoginName: mapping.managerName },
            });
            if (manager && manager.loginId) {
              await this.notificationsService.createNotification({
                employeeId: manager.loginId,
                title: 'Pending Request Cancelled',
                message: `${employeeId} cancelled ${updatedParentDuration === 0 ? 'all dates' : 'selected dates'} from a pending ${request.requestType} request.`,
                type: 'alert',
              });
            }
          }

          // --- SEND EMAIL NOTIFICATION ---
          const employee = await this.employeeDetailsRepository.findOne({
            where: { employeeId: request.employeeId },
          });
          if (employee) {
            await this.sendCancellationEmails(request, employee, 'revert_back');
          }
        } catch (e) {
          this.logger.error(
            `[CANCEL] App notification or email failed: ${e.message}`,
          );
        }
      } else {
        // --- APPROVED REQUEST CANCELLATION ---

        // Calculate total working days being cancelled in this batch
        let cancellingWorkingDays = 0;
        for (const d of datesToCancel) {
          const isWknd = await this._isWeekend(dayjs(d), employeeId);
          const isHol = await this._isHoliday(dayjs(d));
          if (!isWknd && !isHol) cancellingWorkingDays++;
        }
        const parentWorkingDays = request.duration ?? 0;
        const isFullCancellation = cancellingWorkingDays >= parentWorkingDays;

        if (isFullCancellation) {
          // ALL remaining dates cancelled at once — update parent directly, no child created
          request.status = LeaveRequestStatus.REQUESTING_FOR_CANCELLATION;
          request.isRead = false;
          request.isReadEmployee = true;
          await this.leaveRequestRepository.save(request);
          createdRequests.push(request);

          await this.notifyAdminOfCancellationRequest(
            request,
            employeeId,
            cancellingWorkingDays,
          ).catch((e) =>
            this.logger.error(`[CANCEL] notifyAdmin failed: ${e.message}`),
          );
        } else {
          // PARTIAL cancellation — create child records as before
          for (const range of ranges) {
            const newRequest = this.leaveRequestRepository.create({
              ...(request as any),
              id: undefined,
              fromDate: range.start,
              toDate: range.end,
              status: LeaveRequestStatus.REQUESTING_FOR_CANCELLATION,
              duration: request.isHalfDay ? range.count * 0.5 : range.count,
              requestModifiedFrom: `${request.id}:${request.requestType}`,
              availableDates: JSON.stringify(
                datesToCancel.filter((d) => {
                  const ds = dayjs(d).format('YYYY-MM-DD');
                  return ds >= range.start && ds <= range.end;
                }),
              ),
            }) as unknown as LeaveRequest;

            const savedNew = await this.leaveRequestRepository.save(newRequest);
            await this.copyRequestDocuments(request.id, savedNew.id);
            createdRequests.push(savedNew);

            await this.notifyAdminOfCancellationRequest(
              savedNew,
              employeeId,
              range.count,
            ).catch((e) =>
              this.logger.error(`[CANCEL] notifyAdmin failed: ${e.message}`),
            );
          }
        }
      }

      this._recalcMonthStatus(employeeId, request.fromDate.toString()).catch(
        () => {},
      );
      if (isPendingRequest && createdRequests.length === 0) return request;
      return createdRequests.length === 1
        ? createdRequests[0]
        : createdRequests;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelApprovedRequest(id: number, employeeId: string) {
    this.logger.log(`[CANCEL_APPROVED] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request) throw new NotFoundException('Request not found');

      if (request.status !== LeaveRequestStatus.APPROVED) {
        throw new ForbiddenException(
          'Only approved requests can be cancelled via this action',
        );
      }

      const dateParts = request.fromDate.toString().split('-');
      const leaveStart = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2]),
        10,
        0,
        0,
      );
      const now = new Date();

      if (now > leaveStart) {
        throw new ForbiddenException(
          'Cannot cancel request after 10 AM on the start date.',
        );
      }

      request.status = LeaveRequestStatus.REQUESTING_FOR_CANCELLATION;
      request.isRead = false;
      request.isReadEmployee = true;
      await this.leaveRequestRepository.save(request);

      await this.notifyAdminOfCancellationRequest(
        request,
        employeeId,
        request.duration,
      ).catch((e) =>
        this.logger.error(`[CANCEL_APPROVED] notifyAdmin failed: ${e.message}`),
      );

      this._recalcMonthStatus(employeeId, request.fromDate.toString()).catch(
        () => {},
      );
      return request;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to request cancellation',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
          ]),
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`[UPDATES] Failed for ${employeeId}: ${error.message}`);
      throw new HttpException(
        'Failed to fetch employee updates',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async markEmployeeUpdateRead(id: number) {
    this.logger.log(`[UPDATES] Mark read: id=${id}`);
    try {
      return await this.leaveRequestRepository.update(
        { id },
        { isReadEmployee: true },
      );
    } catch (error) {
      this.logger.error(
        `[UPDATES] Failed to mark read for ${id}: ${error.message}`,
      );
      throw new HttpException(
        'Failed to update status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async uploadDocument(
    documents: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    this.logger.log(
      `[DOCS] Uploading ${documents.length} document(s) for leave request ${entityId}`,
    );
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
      this.logger.log(
        `[DOCS] Successfully uploaded ${results.length} document(s)`,
      );

      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error) {
      this.logger.error(`[DOCS] Upload failed: ${error.message}`, error.stack);
      throw new HttpException(
        'Error uploading documents',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllFiles(
    entityType: EntityType,
    entityId: number,
    refId: number,
    referenceType: ReferenceType,
  ) {
    this.logger.log(
      `[DOCS] Getting all files for entity ${entityType} ID ${entityId}`,
    );
    try {
      return await this.documentUploaderService.getAllDocs(
        entityType,
        entityId,
        referenceType,
        refId,
      );
    } catch (error) {
      this.logger.error(`[DOCS] Failed to get files: ${error.message}`);
      throw new HttpException(
        'Failed to fetch documents',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async notifyManagerOfRequest(request: LeaveRequest) {
    this.logger.log(
      `[NOTIFY] Manager/HR for request ${request.id} (${request.status})`,
    );
    try {
      const adminEmail = (
        process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME
      )?.trim();
      const hrEmail = this.getHrEmail();
      const parsedCc = this._parseCcEmails(request.ccEmails);
      const allCc = [adminEmail, hrEmail, ...parsedCc].filter(
        (e): e is string => !!e && e.includes('@'),
      );
      const ccList = [...new Set(allCc)];

      const requester = await this.employeeDetailsRepository.findOne({
        where: { employeeId: request.employeeId },
      });
      const requesterName = requester?.fullName || request.employeeId;

      const actionText =
        request.status === LeaveRequestStatus.REQUESTING_FOR_CANCELLATION
          ? 'Cancellation'
          : request.status === LeaveRequestStatus.CANCELLED
            ? 'Reverted'
            : 'New';
      const emailActionText =
        request.status === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION
          ? 'Modification'
          : actionText;

      const mapping = await this.managerMappingRepository.findOne({
        where: {
          employeeId: request.employeeId,
          status: ManagerMappingStatus.ACTIVE,
        },
      });

      let managerEmail = '';
      let managerName = 'Manager';
      let managerLoginId = '';

      if (mapping) {
        const manager = await this.userRepository.findOne({
          where: { aliasLoginName: mapping.managerName },
        });

        if (manager) {
          const managerDetails =
            (await this.employeeDetailsRepository.findOne({
              where: { email: manager.loginId },
            })) ||
            (await this.employeeDetailsRepository.findOne({
              where: { fullName: mapping.managerName },
            }));
          managerEmail = managerDetails?.email || manager.loginId;
          managerName = mapping.managerName;
          managerLoginId = manager.loginId;
        }
      }

      const targets: { email: string; name: string; isManager: boolean }[] = [];
      if (adminEmail)
        targets.push({ email: adminEmail, name: 'Admin', isManager: false });
      if (managerEmail)
        targets.push({
          email: managerEmail,
          name: managerName,
          isManager: true,
        });
      if (hrEmail)
        targets.push({ email: hrEmail, name: 'HR', isManager: false });
      parsedCc.forEach((cc) =>
        targets.push({ email: cc, name: '', isManager: false }),
      );

      const uniqueTargets: {
        email: string;
        name: string;
        isManager: boolean;
      }[] = [];
      const seen = new Set();
      for (const t of targets) {
        if (
          t.email &&
          t.email.includes('@') &&
          !seen.has(t.email.toLowerCase())
        ) {
          seen.add(t.email.toLowerCase());
          uniqueTargets.push(t);
        }
      }

      for (const target of uniqueTargets) {
        const html = getRequestNotificationTemplate({
          employeeName: requesterName,
          employeeId: request.employeeId,
          requestType: request.requestType,
          title: request.title,
          fromDate: request.fromDate.toString(),
          toDate: request.toDate.toString(),
          duration: request.duration,
          status: request.status,
          recipientName: target.name,
          firstHalf: request.firstHalf,
          secondHalf: request.secondHalf,
        });

        await this.emailService
          .sendEmail(
            target.email,
            `${emailActionText} Request: ${request.requestType} - ${requesterName}`,
            `${emailActionText} request submitted by ${requesterName}`,
            html,
          )
          .catch((e) =>
            this.logger.error(`Failed to notify ${target.email}: ${e.message}`),
          );

        if (target.isManager && managerLoginId) {
          await this.notificationsService
            .createNotification({
              employeeId: managerLoginId,
              title: `${actionText} ${request.requestType} Request`,
              message: `${requesterName} has submitted ${actionText === 'New' ? 'a new' : 'a'} ${request.requestType} titled "${request.title}".`,
              type: 'alert',
            })
            .catch(() => {});
        }
      }

      this.logger.log(
        `[NOTIFY] Sent ${emailActionText} notifications to ${uniqueTargets.map((u) => u.email).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `[NOTIFY] notifyManagerOfRequest failed: ${error.message}`,
      );
    }
  }

  private _parseCcEmails(ccEmails: string | null): string[] {
    if (!ccEmails) return [];
    try {
      const parsed = JSON.parse(ccEmails);
      return Array.isArray(parsed)
        ? parsed.filter(
            (e: unknown) => typeof e === 'string' && e.includes('@'),
          )
        : [];
    } catch {
      return [];
    }
  }

  /** Returns assigned manager email and HR email for leave request form (assigned manager = TO, HR = fixed CC). */
  async getLeaveRequestEmailConfig(
    employeeId: string,
  ): Promise<{ assignedManagerEmail: string | null; hrEmail: string }> {
    const assignedManagerEmail = await this.getAssignedManagerEmail(employeeId);
    const hrEmail = this.getHrEmail();
    return { assignedManagerEmail, hrEmail };
  }

  private async getAssignedManagerEmail(
    employeeId: string,
  ): Promise<string | null> {
    const mapping = await this.managerMappingRepository.findOne({
      where: { employeeId, status: ManagerMappingStatus.ACTIVE },
    });
    if (!mapping) return null;
    const manager = await this.userRepository.findOne({
      where: { aliasLoginName: mapping.managerName },
    });
    if (!manager) return null;
    const managerDetails =
      (await this.employeeDetailsRepository.findOne({
        where: { email: manager.loginId },
      })) ||
      (await this.employeeDetailsRepository.findOne({
        where: { fullName: mapping.managerName },
      }));
    return (managerDetails?.email || manager.loginId)?.includes('@')
      ? managerDetails?.email || manager.loginId
      : null;
  }

  private async sendCancellationEmails(
    request: LeaveRequest,
    employee: EmployeeDetails,
    actionType: 'request' | 'revert' | 'revert_back',
    totalDays?: number,
  ) {
    try {
      const adminEmail = (
        process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME
      )?.trim();
      const managerEmail = await this.getAssignedManagerEmail(
        request.employeeId,
      );
      let managerName = 'Manager';
      if (managerEmail) {
        const mapping = await this.managerMappingRepository.findOne({
          where: {
            employeeId: request.employeeId,
            status: ManagerMappingStatus.ACTIVE,
          },
        });
        if (mapping) managerName = mapping.managerName || 'Manager';
      }
      const hrEmail = this.getHrEmail();
      const parsedCc = this._parseCcEmails(request.ccEmails);

      const requestTypeLabel =
        request.requestType === LeaveRequestType.APPLY_LEAVE
          ? AttendanceStatus.LEAVE
          : request.requestType;

      let subject = '';
      let text = '';
      if (actionType === 'revert_back') {
        subject = `Request Cancelled: ${requestTypeLabel} - ${employee.fullName}`;
        text = `Request Cancelled by ${employee.fullName}`;
      } else if (actionType === 'revert') {
        subject = `Cancellation Reverted: ${requestTypeLabel} - ${employee.fullName}`;
        text = 'Cancellation Reverted';
      } else {
        subject = `Cancellation Request: ${requestTypeLabel} - ${employee.fullName}`;
        text = `Cancellation request submitted by ${employee.fullName}`;
      }

      const recipients: { email: string; name: string; isSelf: boolean }[] = [];
      if (adminEmail)
        recipients.push({ email: adminEmail, name: 'Admin', isSelf: false });
      if (managerEmail)
        recipients.push({
          email: managerEmail,
          name: managerName,
          isSelf: false,
        });
      if (hrEmail)
        recipients.push({ email: hrEmail, name: 'HR', isSelf: false });
      if (employee.email)
        recipients.push({
          email: employee.email,
          name: employee.fullName,
          isSelf: true,
        });
      parsedCc.forEach((cc) => {
        if (cc && cc.includes('@'))
          recipients.push({ email: cc, name: '', isSelf: false });
      });

      const uniqueRecipients: {
        email: string;
        name: string;
        isSelf: boolean;
      }[] = [];
      const seen = new Set();
      for (const r of recipients) {
        if (r.email && !seen.has(r.email.toLowerCase())) {
          seen.add(r.email.toLowerCase());
          uniqueRecipients.push(r);
        }
      }

      for (const recipient of uniqueRecipients) {
        const html = getCancellationTemplate({
          employeeName: employee.fullName,
          employeeId: employee.employeeId,
          requestType: requestTypeLabel,
          title: request.title || 'No Title',
          fromDate: request.fromDate.toString(),
          toDate: request.toDate.toString(),
          duration: totalDays ?? request.duration ?? 0,
          reason: request.description,
          actionType,
          recipientName: recipient.name,
          isSelf: recipient.isSelf,
        });
        await this.emailService
          .sendEmail(recipient.email, subject, text, html)
          .catch((e) =>
            this.logger.error(
              `Failed to send email to ${recipient.email}: ${e.message}`,
            ),
          );
      }
      this.logger.log(
        `[CANCEL_EMAILS] Sent ${actionType} emails to ${uniqueRecipients.map((r) => r.email).join(', ')}`,
      );
    } catch (e) {
      this.logger.error(`[CANCEL_EMAILS] Failed: ${e.message}`);
    }
  }

  private async notifyEmployeeOfSubmission(request: LeaveRequest) {
    this.logger.log(`[NOTIFY] Employee receipt for request ${request.id}`);
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: request.employeeId },
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
          secondHalf: request.secondHalf,
        });
        await this.emailService.sendEmail(
          employee.email,
          `Submission Received: ${request.requestType} - ${request.title}`,
          `Your ${request.requestType} has been submitted.`,
          htmlContent,
        );
        this.logger.log(`[NOTIFY] Receipt sent to ${employee.email}`);
      }
    } catch (error) {
      this.logger.error(
        `[NOTIFY] notifyEmployeeOfSubmission failed: ${error.message}`,
      );
    }
  }

  private async sendStatusUpdateEmails(
    request: LeaveRequest,
    employee: EmployeeDetails,
    status: string,
    previousStatus?: string,
  ) {
    try {
      const adminEmail = (
        process.env.ADMIN_EMAIL || process.env.SMTP_USERNAME
      )?.trim();
      const managerEmail = await this.getAssignedManagerEmail(
        request.employeeId,
      );
      let managerName = 'Manager';
      if (managerEmail) {
        const mapping = await this.managerMappingRepository.findOne({
          where: {
            employeeId: request.employeeId,
            status: ManagerMappingStatus.ACTIVE,
          },
        });
        if (mapping) managerName = mapping.managerName || 'Manager';
      }
      const hrEmail = this.getHrEmail();
      const parsedCc = this._parseCcEmails(request.ccEmails);

      const requestTypeLabel =
        request.requestType === LeaveRequestType.APPLY_LEAVE
          ? AttendanceStatus.LEAVE
          : request.requestType;
      const isEmployeeSelfCancel =
        status === LeaveRequestStatus.CANCELLED &&
        previousStatus === LeaveRequestStatus.PENDING;
      const isCancellation =
        status === LeaveRequestStatus.CANCELLATION_APPROVED ||
        status === LeaveRequestStatus.CANCELLATION_REJECTED;

      const recipients: { email: string; name: string; isSelf: boolean }[] = [];

      if (!isEmployeeSelfCancel) {
        if (adminEmail)
          recipients.push({ email: adminEmail, name: 'Admin', isSelf: false });
        if (managerEmail)
          recipients.push({
            email: managerEmail,
            name: managerName,
            isSelf: false,
          });
        if (hrEmail)
          recipients.push({ email: hrEmail, name: 'HR', isSelf: false });
        parsedCc.forEach((cc) => {
          if (cc && cc.includes('@'))
            recipients.push({ email: cc, name: '', isSelf: false });
        });
      }
      if (employee.email)
        recipients.push({
          email: employee.email,
          name: employee.fullName,
          isSelf: true,
        });

      const uniqueRecipients: {
        email: string;
        name: string;
        isSelf: boolean;
      }[] = [];
      const seen = new Set();
      for (const r of recipients) {
        if (r.email && !seen.has(r.email.toLowerCase())) {
          seen.add(r.email.toLowerCase());
          uniqueRecipients.push(r);
        }
      }

      for (const recipient of uniqueRecipients) {
        const html = getStatusUpdateTemplate({
          employeeName: employee.fullName,
          employeeId: employee.employeeId,
          requestType: requestTypeLabel,
          title: request.title || 'No Title',
          fromDate: request.fromDate.toString(),
          toDate: request.toDate.toString(),
          duration: request.duration || 0,
          status: status as any,
          isCancellation,
          reviewedBy: isEmployeeSelfCancel ? '' : request.reviewedBy,
          firstHalf: request.firstHalf,
          secondHalf: request.secondHalf,
          recipientName: recipient.name,
          isSelf: recipient.isSelf,
        });

        let subject = '';
        let text = '';
        if (recipient.isSelf) {
          subject = `${requestTypeLabel} Request ${status}`;
          text = `Your request status: ${status}`;
        } else {
          subject = `Decision: ${requestTypeLabel} Request ${status} - ${employee.fullName}`;
          text = `Request status updated to ${status} by ${request.reviewedBy || 'Reviewer'}`;
        }

        await this.emailService
          .sendEmail(recipient.email, subject, text, html)
          .catch((e) => this.logger.error(`Status email failed: ${e.message}`));
      }
      this.logger.log(
        `[STATUS_EMAILS] Sent ${status} emails to ${uniqueRecipients.map((r) => r.email).join(', ')}`,
      );
    } catch (err) {
      this.logger.error(`[STATUS_EMAILS] Failed: ${err.message}`);
    }
  }

  async deleteDocument(
    entityType: EntityType,
    entityId: number,
    refId: number,
    key: string,
  ) {
    this.logger.log(
      `[DOCS] Deleting document with key ${key} for entity ${entityId}`,
    );
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
      throw new HttpException(
        'Error deleting document',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validateEntity(
    entityType: EntityType,
    entityId: number,
    refId: number,
  ) {
    try {
      if (entityType === EntityType.LEAVE_REQUEST) {
        if (refId !== 0) {
          const leaveRequest = await this.leaveRequestRepository.findOne({
            where: { id: refId },
          });
          if (!leaveRequest) {
            throw new NotFoundException(
              `Leave request with ID ${refId} not found`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`[DOCS] Entity validation failed: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Validation error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async markAllEmployeeUpdatesRead(employeeId: string) {
    this.logger.log(`[UPDATES] Mark all read for: ${employeeId}`);
    try {
      return await this.leaveRequestRepository.update(
        { employeeId, isReadEmployee: false },
        { isReadEmployee: true },
      );
    } catch (error) {
      this.logger.error(`[UPDATES] Mark all read failed: ${error.message}`);
      throw new HttpException(
        'Failed to update status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findMonthlyRequests(
    month: string,
    year: string,
    employeeId?: string,
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.findUnifiedRequests({
      month,
      year,
      employeeId,
      status,
      page,
      limit,
    });
  }

  async modifyRequest(
    id: number,
    employeeId: string,
    updateData: {
      title?: string;
      description?: string;
      firstHalf?: string;
      secondHalf?: string;
      datesToModify?: string[];
      ccEmails?: string[];
      documentKeys?: string[];
    },
  ) {
    this.logger.log(`[MODIFY_REQUEST] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request)
        throw new NotFoundException('Request not found or access denied');
      if (
        ![LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED].includes(
          request.status,
        )
      )
        throw new BadRequestException(
          'Only Pending or Approved requests can be modified',
        );

      if (updateData.datesToModify && updateData.datesToModify.length > 0) {
        if (request.status === LeaveRequestStatus.APPROVED) {
          return await this.modifyApprovedDates(
            id,
            employeeId,
            updateData.datesToModify,
            updateData,
          );
        } else if (request.status === LeaveRequestStatus.PENDING) {
          const startDate = dayjs(request.fromDate);
          const endDate = dayjs(request.toDate);
          const totalDays = endDate.diff(startDate, 'day') + 1;
          if (updateData.datesToModify.length !== totalDays) {
            throw new BadRequestException(
              'Partial modification is only allowed for Approved requests. For Pending requests, please edit the entire request.',
            );
          }
        }
      }

      const updatedData: Partial<LeaveRequest> = {
        isModified: true,
        modificationCount: (request.modificationCount || 0) + 1,
        lastModifiedDate: new Date(),
      };
      if (updateData.title !== undefined) updatedData.title = updateData.title;
      if (updateData.description !== undefined)
        updatedData.description = updateData.description;

      if (request.status === LeaveRequestStatus.APPROVED) {
        updatedData.status = LeaveRequestStatus.REQUESTING_FOR_MODIFICATION;
        updatedData.isRead = false;
      }

      if (updateData.firstHalf !== undefined)
        updatedData.firstHalf = updateData.firstHalf as any;
      if (updateData.secondHalf !== undefined)
        updatedData.secondHalf = updateData.secondHalf as any;
      if (updateData.ccEmails !== undefined)
        updatedData.ccEmails = updateData.ccEmails?.length
          ? JSON.stringify(updateData.ccEmails)
          : null;

      if (updateData.firstHalf || updateData.secondHalf) {
        const newFirstHalf =
          updateData.firstHalf || request.firstHalf || request.requestType;
        const newSecondHalf =
          updateData.secondHalf || request.secondHalf || request.requestType;
        if (newFirstHalf === newSecondHalf) {
          updatedData.requestType = newFirstHalf;
          updatedData.isHalfDay = false;
        } else {
          const parts = [newFirstHalf, newSecondHalf].filter(
            (h) => h && h !== WorkLocation.OFFICE,
          );
          updatedData.requestType = parts.join(' + ');
          updatedData.isHalfDay = true;
        }
      }

      await this.leaveRequestRepository.update({ id }, updatedData);
      const modifiedRequest = await this.leaveRequestRepository.findOne({
        where: { id },
      });

      if (
        updatedData.status === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION
      ) {
        const fullReq = await this.leaveRequestRepository.findOne({
          where: { id },
        });
        if (fullReq) {
          await this.notifyAdminOfCancellationRequest(fullReq, employeeId);
          await this.notifyManagerOfRequest(fullReq);

          try {
            const employee = await this.employeeDetailsRepository.findOne({
              where: { employeeId },
            });
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
                secondHalf: fullReq.secondHalf,
              });
              await this.emailService.sendEmail(
                employee.email,
                `Submission Received: Modification Request (${fullReq.requestType})`,
                'Modification Request Notification',
                htmlContent,
              );
            }
          } catch (e) {
            this.logger.error(
              `[MODIFY_REQUEST] Employee notification failed: ${e.message}`,
            );
          }
        }
      }

      // -------------------------------------------------------------------------
      // DOCUMENT LINKING STRATEGY (Strategy A & B)
      // -------------------------------------------------------------------------
      const employeeDetails = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
      });
      if (employeeDetails) {
        if (updateData.documentKeys && updateData.documentKeys.length > 0) {
          // Strategy A – precise linking by document ID
          for (const docId of updateData.documentKeys) {
            const docMeta = await this.documentRepo.findOne({
              where: {
                id: docId,
                entityType: EntityType.LEAVE_REQUEST,
                entityId: employeeDetails.id,
              },
            });
            if (docMeta) {
              if (docMeta.refId === 0) {
                docMeta.refId = id;
                await this.documentRepo.save(docMeta);
              } else if (docMeta.refId !== id) {
                // If already linked elsewhere, clone it
                const clone = this.documentRepo.create({
                  ...docMeta,
                  id: undefined,
                  refId: id,
                });
                await this.documentRepo.save(clone);
              }
            }
          }
        } else {
          // Strategy B – fallback for orphaned docs uploaded recently
          const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
          const orphanedDocs = await this.documentRepo.find({
            where: {
              entityType: EntityType.LEAVE_REQUEST,
              entityId: employeeDetails.id,
              refId: 0,
              createdAt: MoreThan(oneHourAgo),
            },
          });
          for (const doc of orphanedDocs) {
            doc.refId = id;
            await this.documentRepo.save(doc);
          }
        }
      }

      this.logger.log(`[MODIFY_REQUEST] Successfully modified request ${id}`);
      this._recalcMonthStatus(employeeId, request.fromDate.toString()).catch(
        () => {},
      );

      return {
        success: true,
        modifiedRequest,
        message: 'Request modified successfully',
      };
    } catch (error) {
      this.logger.error(
        `[MODIFY_REQUEST] Failed for ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to modify request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async modifyApprovedDates(
    id: number,
    employeeId: string,
    datesToModify: string[],
    updateData: {
      title?: string;
      description?: string;
      firstHalf?: string;
      secondHalf?: string;
      documentKeys?: string[];
    },
  ) {
    this.logger.log(`[MODIFY_APPROVED] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
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
              const isHol = await this._isHoliday(temp);
              if (!isHol) {
                hasWorkDayGap = true;
                break;
              }
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

      // Count working days being modified
      let modifyingWorkingDays = 0;
      for (const d of datesToModify) {
        const isWknd = await this._isWeekend(dayjs(d), employeeId);
        const isHol = await this._isHoliday(dayjs(d));
        if (!isWknd && !isHol) modifyingWorkingDays++;
      }
      const parentWorkingDays = request.duration ?? 0;
      const isFullModification = modifyingWorkingDays >= parentWorkingDays;

      // Derive new request type from half day choices
      const fHalf = (updateData.firstHalf ||
        request.firstHalf ||
        WorkLocation.OFFICE) as WorkLocation;
      const sHalf = (updateData.secondHalf ||
        request.secondHalf ||
        WorkLocation.OFFICE) as WorkLocation;
      let newRequestType = request.requestType;
      let isHalfDay = request.isHalfDay;
      if (fHalf === sHalf) {
        newRequestType = fHalf;
        isHalfDay = false;
      } else {
        const parts = [fHalf, sHalf].filter(
          (h) => h && h !== WorkLocation.OFFICE,
        );
        newRequestType = parts.join(' + ');
        isHalfDay = true;
      }

      if (isFullModification) {
        // ALL dates modified at once — update parent directly, no child created
        request.status = LeaveRequestStatus.REQUESTING_FOR_MODIFICATION;
        request.title = updateData.title || request.title;
        request.description = updateData.description || request.description;
        request.firstHalf = fHalf;
        request.secondHalf = sHalf;
        request.requestType = newRequestType;
        request.isHalfDay = isHalfDay;
        request.availableDates = JSON.stringify(datesToModify);
        request.isRead = false;
        request.isReadEmployee = true;
        request.isModified = true;
        request.modificationCount = (request.modificationCount || 0) + 1;
        request.lastModifiedDate = new Date();
        await this.leaveRequestRepository.save(request);
        createdRequests.push(request);

        // Document Linking for Full Modification
        const employeeDetails = await this.employeeDetailsRepository.findOne({
          where: { employeeId },
        });
        if (employeeDetails) {
          if (updateData.documentKeys && updateData.documentKeys.length > 0) {
            for (const docId of updateData.documentKeys) {
              const docMeta = await this.documentRepo.findOne({
                where: {
                  id: docId,
                  entityType: EntityType.LEAVE_REQUEST,
                  entityId: employeeDetails.id,
                },
              });
              if (docMeta) {
                if (docMeta.refId === 0) {
                  docMeta.refId = id;
                  await this.documentRepo.save(docMeta);
                } else if (docMeta.refId !== id) {
                  const clone = this.documentRepo.create({
                    ...docMeta,
                    id: undefined,
                    refId: id,
                  });
                  await this.documentRepo.save(clone);
                }
              }
            }
          } else {
            const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
            const orphanedDocs = await this.documentRepo.find({
              where: {
                entityType: EntityType.LEAVE_REQUEST,
                entityId: employeeDetails.id,
                refId: 0,
                createdAt: MoreThan(oneHourAgo),
              },
            });
            for (const doc of orphanedDocs) {
              doc.refId = id;
              await this.documentRepo.save(doc);
            }
          }
        }

        // Notify only of submission — no approval triggered here
        await this.notifyManagerOfRequest(request);
        await this.notifyEmployeeOfSubmission(request);
      } else {
        // PARTIAL modification — create child records as before
        for (const range of ranges) {
          let rangeRequestType = request.requestType;
          let rangeIsHalfDay = request.isHalfDay;

          if (fHalf === sHalf) {
            rangeRequestType = fHalf;
            rangeIsHalfDay = false;
          } else {
            const parts = [fHalf, sHalf].filter(
              (h) => h && h !== WorkLocation.OFFICE,
            );
            rangeRequestType = parts.join(' + ');
            rangeIsHalfDay = true;
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
            requestType: rangeRequestType,
            isHalfDay: rangeIsHalfDay,
            isRead: false,
            isReadEmployee: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            duration: range.count,
            requestModifiedFrom: `${request.id}:${request.requestType}`,
            availableDates: JSON.stringify(
              datesToModify.filter((d) => {
                const ds = dayjs(d).format('YYYY-MM-DD');
                return ds >= range.start && ds <= range.end;
              }),
            ),
            isModified: true,
            modificationCount: 1,
            lastModifiedDate: new Date(),
          }) as unknown as LeaveRequest;

          const savedNew = (await this.leaveRequestRepository.save(
            newRequest,
          )) as unknown as LeaveRequest;
          // Removed copyRequestDocuments so partial modification only contains new documents

          // Document Linking for Partial Modification segments
          const employeeDetails = await this.employeeDetailsRepository.findOne({
            where: { employeeId },
          });
          if (employeeDetails) {
            if (updateData.documentKeys && updateData.documentKeys.length > 0) {
              for (const docId of updateData.documentKeys) {
                const docMeta = await this.documentRepo.findOne({
                  where: {
                    id: docId,
                    entityType: EntityType.LEAVE_REQUEST,
                    entityId: employeeDetails.id,
                  },
                });
                if (docMeta) {
                  if (docMeta.refId === 0) {
                    docMeta.refId = savedNew.id;
                    await this.documentRepo.save(docMeta);
                  } else {
                    const clone = this.documentRepo.create({
                      ...docMeta,
                      id: undefined,
                      refId: savedNew.id,
                    });
                    await this.documentRepo.save(clone);
                  }
                }
              }
            } else {
              const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
              const orphanedDocs = await this.documentRepo.find({
                where: {
                  entityType: EntityType.LEAVE_REQUEST,
                  entityId: employeeDetails.id,
                  refId: 0,
                  createdAt: MoreThan(oneHourAgo),
                },
              });
              for (const doc of orphanedDocs) {
                const clone = this.documentRepo.create({
                  ...doc,
                  id: undefined,
                  refId: savedNew.id,
                });
                await this.documentRepo.save(clone);
              }
            }
          }

          createdRequests.push(savedNew);

          // Notify only of submission - NO Approval triggered here
          await this.notifyManagerOfRequest(savedNew);
          await this.notifyEmployeeOfSubmission(savedNew);
        }
      }

      this._recalcMonthStatus(employeeId, datesToModify[0]).catch(() => {});
      this.logger.log(
        `[MODIFY_APPROVED] Successfully created ${createdRequests.length} modification requests`,
      );
      return {
        success: true,
        modifiedRequests: createdRequests,
        message: 'Modification requests created successfully',
      };
    } catch (error) {
      this.logger.error(
        `[MODIFY_APPROVED] Failed: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to create modification requests',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async undoModificationRequest(id: number, employeeId: string) {
    this.logger.log(`[UNDO_MODIFY] id=${id}, employee=${employeeId}`);
    try {
      const request = await this.leaveRequestRepository.findOne({
        where: { id, employeeId },
      });
      if (!request) throw new NotFoundException('Request not found');

      if (request.status !== LeaveRequestStatus.REQUESTING_FOR_MODIFICATION) {
        throw new BadRequestException(
          'Only requests with status "Requesting for Modification" can be undone.',
        );
      }

      if (request.requestModifiedFrom) {
        // PARTIAL modification (child record)
        request.status = LeaveRequestStatus.MODIFICATION_CANCELLED;
        request.availableDates = JSON.stringify([]); // No longer blocking/claiming dates
        await this.leaveRequestRepository.save(request);
      } else {
        // FULL modification (parent record itself)
        // Revert it back to APPROVED so the original leave remains active
        request.status = LeaveRequestStatus.APPROVED;
        await this.leaveRequestRepository.save(request);
        this.logger.log(
          `[UNDO_MODIFY] Reverted parent request ${id} to APPROVED status.`,
        );
      }

      // Notifications: everyone gets the MODIFICATION_CANCELLED update
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: request.employeeId },
        });
        if (employee) {
          await this.sendStatusUpdateEmails(request, employee, request.status);
        }
      } catch (err) {
        this.logger.error(`[UNDO_MODIFY] Notification failed: ${err.message}`);
      }

      this._recalcMonthStatus(employeeId, String(request.fromDate)).catch(
        () => {},
      );
      this.logger.log(
        `[UNDO_MODIFY] Successfully cancelled modification request ${id}`,
      );

      return {
        success: true,
        message: 'Modification request undone successfully',
      };
    } catch (error) {
      this.logger.error(
        `[UNDO_MODIFY] Failed for ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to undo modification request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getMonthlyLeaveBalance(
    employeeId: string,
    month: number,
    year: number,
  ) {
    this.logger.log(
      `[BALANCE_MONTH] employeeId=${employeeId}, month=${month}, year=${year}`,
    );
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId },
        select: [
          'id',
          'employeeId',
          'designation',
          'employmentType',
          'joiningDate',
          'conversionDate',
        ],
      });

      if (!employee)
        throw new NotFoundException(`Employee ${employeeId} not found`);

      const isIntern =
        employee.employmentType === EmploymentType.INTERN ||
        (employee.designation || '')
          .toLowerCase()
          .includes(EmploymentType.INTERN.toLowerCase());

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
        const dateStr =
          rec.workingDate instanceof Date
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
          const convDate = (employee as any).conversionDate
            ? dayjs((employee as any).conversionDate)
            : null;
          if (convDate && convDate.isValid()) {
            const convMonth = convDate.month() + 1;
            const convYear = convDate.year();
            if (
              curYear > convYear ||
              (curYear === convYear && m >= convMonth)
            ) {
              isInternThisMonth = false;
              if (
                curYear === convYear &&
                m === convMonth &&
                convDate.date() > 10
              )
                isInternThisMonth = true;
            } else {
              isInternThisMonth = true;
            }
          }

          if (curYear === year && m === month)
            targetMonthStats.carryOver = runningBalance;

          let effectiveAccrual = isInternThisMonth ? 1.0 : 1.5;
          if (curYear === joinYear && m === joinMonth && joinDate.date() > 10)
            effectiveAccrual = 0;

          runningBalance += effectiveAccrual;
          if (curYear === year && m === month)
            targetMonthStats.monthlyAccrual = effectiveAccrual;

          const attendance = attendanceMap.get(`${curYear}-${m}`) || [];
          const monthlyUsage = attendance.reduce((acc, rec) => {
            let dailyUsage = 0;
            const status = (rec.status || '').toLowerCase().trim();
            if (rec.firstHalf || rec.secondHalf) {
              const processHalf = (half: string | null) => {
                if (!half) return 0;
                const h = half.toLowerCase().trim();
                // Exclude Comp Off from standard leave deduction
                if (h.includes('comp off') || h === 'comp-off leave') return 0;

                return h.includes(AttendanceStatus.LEAVE.toLowerCase()) ||
                  h.includes(AttendanceStatus.ABSENT.toLowerCase())
                  ? 0.5
                  : 0;
              };
              dailyUsage =
                processHalf(rec.firstHalf) + processHalf(rec.secondHalf);
            } else {
              // Exclude Comp Off from standard leave deduction
              if (status.includes('comp off') || status === 'comp-off leave') {
                dailyUsage = 0;
              } else if (
                status.includes(AttendanceStatus.LEAVE.toLowerCase()) ||
                status.includes(AttendanceStatus.ABSENT.toLowerCase())
              ) {
                dailyUsage = 1;
              } else if (
                status.includes(AttendanceStatus.HALF_DAY.toLowerCase())
              ) {
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

      this.logger.log(
        `[BALANCE_MONTH] Calculated: current=${targetMonthStats.balance}, ytdUsed=${targetMonthStats.ytdUsed}`,
      );
      return targetMonthStats;
    } catch (error) {
      this.logger.error(
        `[BALANCE_MONTH] Calculation failed for ${employeeId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to calculate monthly leave balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
