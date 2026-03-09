import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository, LessThanOrEqual, MoreThanOrEqual, In } from 'typeorm';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { AttendanceStatus } from '../enums/attendance-status.enum';
import { LeaveRequestStatus } from '../enums/leave-notification-status.enum';
import { MonthStatus } from '../enums/month-status.enum';
import { WorkLocation, WorkLocationKeyword } from '../enums/work-location.enum';
import { LeaveRequestType } from '../enums/leave-request-type.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { Department } from '../enums/department.enum';
import { CompOffService } from './comp-off.service';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeAttendanceDto } from '../dto/employeeAttendance.dto';
import { MasterHolidayService } from '../../master/service/master-holiday.service';
import { TimesheetBlockerService } from './timesheetBlocker.service';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmploymentType } from '../enums/employment-type.enum';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';

@Injectable()
export class EmployeeAttendanceService {
  private readonly logger = new Logger(EmployeeAttendanceService.name);

  constructor(
    @InjectRepository(EmployeeAttendance)
    private readonly employeeAttendanceRepository: Repository<EmployeeAttendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly masterHolidayService: MasterHolidayService,
    private readonly blockerService: TimesheetBlockerService,
    private readonly compOffService: CompOffService,
  ) { }

  /**
   * Calculate total working hours based on firstHalf and secondHalf values
   * @param firstHalf - Activity for first half
   * @param secondHalf - Activity for second half
   * @param providedHours - Optional hours provided by user
   * @returns Total working hours
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
        const normalized = half.toLowerCase().trim();
        return normalized.includes(WorkLocationKeyword.OFFICE) ||
          normalized.includes(WorkLocationKeyword.WFH) ||
          normalized.includes(WorkLocationKeyword.WORK_FROM_HOME) ||
          normalized.includes(WorkLocationKeyword.CLIENT_VISIT) ||
          normalized.includes(WorkLocationKeyword.PRESENT);
      };

      const h1Work = isWork(firstHalf);
      const h2Work = isWork(secondHalf);

      if (h1Work && h2Work) return 9; // Full Day default
      if (h1Work || h2Work) return 6; // Half Day default
      return 0;
    } catch (error) {
      this.logger.error(`Error calculating total hours: ${error.message}`);
      throw error;
    }
  }

  private determineDefaultActivity(firstHalf: WorkLocation | AttendanceStatus | string | null, secondHalf: WorkLocation | AttendanceStatus | string | null): WorkLocation {
    try {
      const h1 = (firstHalf || '').toLowerCase();
      const h2 = (secondHalf || '').toLowerCase();

      // If one half has a work activity, use that
      if (h1.includes(WorkLocationKeyword.WFH) || h1.includes(WorkLocationKeyword.WORK_FROM_HOME)) return WorkLocation.WORK_FROM_HOME;
      if (h2.includes(WorkLocationKeyword.WFH) || h2.includes(WorkLocationKeyword.WORK_FROM_HOME)) return WorkLocation.WORK_FROM_HOME;
      if (h1.includes(WorkLocationKeyword.CLIENT_VISIT) || h1.includes(WorkLocationKeyword.CV)) return WorkLocation.CLIENT_VISIT;
      if (h2.includes(WorkLocationKeyword.CLIENT_VISIT) || h2.includes(WorkLocationKeyword.CV)) return WorkLocation.CLIENT_VISIT;
      if (h1.includes(WorkLocationKeyword.OFFICE)) return WorkLocation.OFFICE;
      if (h2.includes(WorkLocationKeyword.OFFICE)) return WorkLocation.OFFICE;

      return WorkLocation.OFFICE; // Default to Office
    } catch (error) {
      this.logger.error(`Error determining default activity: ${error.message}`);
      throw error;
    }
  }

  private isActivity(half: string | null, pattern: WorkLocationKeyword | string): boolean {
    try {
      if (!half || !pattern) return false;
      return half.toLowerCase().includes(pattern.toLowerCase());
    } catch (error) {
      return false;
    }
  }


  async create(createEmployeeAttendanceDto: EmployeeAttendanceDto, isPrivileged: boolean = false): Promise<EmployeeAttendance | null> {
    try {
      if (!isPrivileged && !this.isEditableMonth(new Date(createEmployeeAttendanceDto.workingDate))) {
        throw new BadRequestException('Attendance for this month is locked.');
      }

      const workingDateObj = new Date(createEmployeeAttendanceDto.workingDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      workingDateObj.setHours(0, 0, 0, 0);

      // (Moved future check down)

      if (createEmployeeAttendanceDto.employeeId && createEmployeeAttendanceDto.workingDate) {
        const blocker = await this.blockerService.isBlocked(
          createEmployeeAttendanceDto.employeeId,
          createEmployeeAttendanceDto.workingDate
        );
        if (blocker) {
          const blockedByName = blocker.blockedBy || 'Administrator';
          throw new BadRequestException(`Timesheet is locked for this date by ${blockedByName}. Please contact them to unlock.`);
        }
      }

      const startOfDay = new Date(createEmployeeAttendanceDto.workingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(createEmployeeAttendanceDto.workingDate);
      endOfDay.setHours(23, 59, 59, 999);

      // --- Holiday/Weekend Blocking Logic (Start) ---
      const topDateStrLocal = startOfDay.toISOString().split('T')[0];
      const holiday = await this.masterHolidayService.findByDate(topDateStrLocal);
      const isSun = startOfDay.getDay() === 0;
      const isSatLocal = startOfDay.getDay() === 6;

      if (!isPrivileged) {
        const detail = await this.employeeDetailsRepository.findOne({ where: { employeeId: createEmployeeAttendanceDto.employeeId } });
        const isIT = detail?.department === Department.IT;
        const isFullTimer = detail?.employmentType === EmploymentType.FULL_TIMER;

        if (holiday && !(isIT && isFullTimer)) {
          throw new BadRequestException('Attendance is blocked for Holidays.');
        }
        if (isSun && !(isIT && isFullTimer)) {
          throw new BadRequestException('Attendance is blocked for Sundays.');
        }
        
        // Weekend/Holiday Rule: 4-9 hours validation
        const incomingHours = createEmployeeAttendanceDto.totalHours !== undefined && createEmployeeAttendanceDto.totalHours !== null 
          ? Number(createEmployeeAttendanceDto.totalHours) 
          : null;

        if ((isSatLocal || ((isSun || holiday) && (isIT && isFullTimer))) && incomingHours !== null && incomingHours > 0) {
          if (incomingHours < 4 || incomingHours > 9) {
            const msg = isSatLocal ? 'Saturday' : (isSun ? 'Sunday' : 'Holiday');
            throw new BadRequestException(`${msg} hours must be between 4 and 9.`);
          }
        }
      }
      // --- Holiday/Weekend Blocking Logic (End) ---

      const existingRecord = await this.employeeAttendanceRepository.findOne({
        where: {
          employeeId: createEmployeeAttendanceDto.employeeId,
          workingDate: Between(startOfDay, endOfDay),
        },
      });

      // Rule: Do not create future records with 0 hours, UNLESS status or workLocation is provided.
      // Only apply this checks if NO existing record exists. If record exists, we might intend to update/clear it.
      if (!existingRecord && !createEmployeeAttendanceDto.status && !createEmployeeAttendanceDto.workLocation && (!createEmployeeAttendanceDto.totalHours || createEmployeeAttendanceDto.totalHours === 0) && workingDateObj > today) {
        return null;
      }

      // Force work_location to NULL - we use first_half/second_half instead
      createEmployeeAttendanceDto.workLocation = null;

      if (existingRecord) {
        this.logger.log(`[ATTENDANCE_CREATE] Found existing record ID: ${existingRecord.id}, Date: ${existingRecord.workingDate}`);
        this.logger.log(`[ATTENDANCE_CREATE] Existing sourceRequestId: ${existingRecord.sourceRequestId}`);
        this.logger.log(`[ATTENDANCE_CREATE] Incoming sourceRequestId: ${createEmployeeAttendanceDto.sourceRequestId}`);

        // GUARD: Protect Approved Leaves for non-privileged users
        if (!isPrivileged && existingRecord.sourceRequestId && !createEmployeeAttendanceDto.sourceRequestId) {
          this.logger.warn(`[ATTENDANCE_RESTRICTION] Blocking manual update for record ${existingRecord.id} because it is linked to Leave Request ${existingRecord.sourceRequestId}`);
          return existingRecord; // Skip update and return existing record
        }

        // Update existing record
        this.logger.log(`[ATTENDANCE_CREATE] Updating existing record with new data`);

        // Calculate totalHours based on incoming or existing firstHalf/secondHalf
        const finalFirstHalf = createEmployeeAttendanceDto.firstHalf !== undefined
          ? createEmployeeAttendanceDto.firstHalf
          : existingRecord.firstHalf;
        const finalSecondHalf = createEmployeeAttendanceDto.secondHalf !== undefined
          ? createEmployeeAttendanceDto.secondHalf
          : existingRecord.secondHalf;

        // If we have firstHalf or secondHalf (either from incoming DTO or existing record), recalculate
        if (finalFirstHalf || finalSecondHalf) {
          const calculatedHours = this.calculateTotalHours(finalFirstHalf || null, finalSecondHalf || null);
          createEmployeeAttendanceDto.totalHours = calculatedHours;
          this.logger.log(`[ATTENDANCE_CREATE] Calculated totalHours: ${calculatedHours} from firstHalf: ${finalFirstHalf}, secondHalf: ${finalSecondHalf}`);
        } else if (createEmployeeAttendanceDto.totalHours === null || createEmployeeAttendanceDto.totalHours === undefined) {
          // If no firstHalf/secondHalf and incoming totalHours is null/undefined, don't overwrite existing
          delete createEmployeeAttendanceDto.totalHours;
          this.logger.log(`[ATTENDANCE_CREATE] Skipping null/undefined totalHours to preserve existing value`);
        }

        Object.assign(existingRecord, createEmployeeAttendanceDto);
        existingRecord.workLocation = null; // Ensure null

        if (
          !createEmployeeAttendanceDto.status &&
          existingRecord.totalHours !== undefined &&
          existingRecord.totalHours !== null
        ) {
          existingRecord.status = await this.determineStatus(
            existingRecord.totalHours,
            existingRecord.workingDate,
            existingRecord.firstHalf,
            existingRecord.secondHalf
          );
        }

        // CRITICAL: Synchronize splits and status for UPDATED existing records in create branch
        const hoursFromExisting = Number(existingRecord.totalHours || 0);
        const dateObjFromExisting = new Date(existingRecord.workingDate);
        const isSaturdayFromExisting = dateObjFromExisting.getDay() === 6;
        const isSundayFromExisting = dateObjFromExisting.getDay() === 0;
        const dateStrLocalFromExisting = dateObjFromExisting.toISOString().split('T')[0];
        const currentHolidayFromExisting = await this.masterHolidayService.findByDate(dateStrLocalFromExisting);
        
        const empDetailFromExisting = await this.employeeDetailsRepository.findOne({ where: { employeeId: existingRecord.employeeId } });
        const isITDeptFromExisting = empDetailFromExisting?.department === Department.IT;
        const isFTFromExisting = empDetailFromExisting?.employmentType === EmploymentType.FULL_TIMER;
        const isWeekendOrHoliday = isSaturdayFromExisting || isSundayFromExisting || !!currentHolidayFromExisting;
        const isEligibleForCompOff = isWeekendOrHoliday && isITDeptFromExisting && isFTFromExisting;

        if (isEligibleForCompOff && hoursFromExisting > 3 && hoursFromExisting <= 9) {
          existingRecord.status = AttendanceStatus.FULL_DAY;
          existingRecord.firstHalf = WorkLocation.OFFICE;
          existingRecord.secondHalf = WorkLocation.OFFICE;
        } else if (hoursFromExisting > 0 && hoursFromExisting <= 6 && !isWeekendOrHoliday) {
          // Relaxed enforcement: Only set defaults if no source request is linked and splits are empty
          if (!existingRecord.sourceRequestId && (!existingRecord.firstHalf || !existingRecord.secondHalf)) {
            existingRecord.firstHalf = WorkLocation.OFFICE;
            existingRecord.secondHalf = WorkLocation.LEAVE;
            this.logger.log(`[ATTENDANCE_CREATE] Enforced default Half Day splits for Record ${existingRecord.id}`);
          }
          existingRecord.status = AttendanceStatus.HALF_DAY;
          this.logger.log(`[ATTENDANCE_CREATE] Synchronized Half Day status (<= 6h)`);
        } else if ((hoursFromExisting > 6 && !isWeekendOrHoliday) || (isWeekendOrHoliday && hoursFromExisting >= 4)) {
          // STRICT OVERWRITE: Any entry considered "Full Day" must have "Office" splits
          existingRecord.firstHalf = WorkLocation.OFFICE;
          existingRecord.secondHalf = WorkLocation.OFFICE;
          createEmployeeAttendanceDto.firstHalf = WorkLocation.OFFICE as any;
          createEmployeeAttendanceDto.secondHalf = WorkLocation.OFFICE as any;
          existingRecord.status = AttendanceStatus.FULL_DAY;
          this.logger.log(`[ATTENDANCE_OVERWRITE] Enforced Full Day synchronization for existing record (${hoursFromExisting}h) with Office splits`);
        } else if (existingRecord.totalHours === 0 || existingRecord.totalHours === null) {
          const isClear = existingRecord.totalHours === null;


          let newStatus = isClear
            ? (workingDateObj > today ? null : AttendanceStatus.NOT_UPDATED)
            : (existingRecord.status &&
              Object.values(AttendanceStatus).includes(existingRecord.status as any) &&
              existingRecord.status !== AttendanceStatus.WEEKEND &&
              existingRecord.status !== AttendanceStatus.HOLIDAY
              ? (existingRecord.status as AttendanceStatus)
              : AttendanceStatus.ABSENT); // Explicit 0 hours defaults to ABSENT, overriding Weekend/Holiday

          if (isClear) {
            const dateStr = existingRecord.workingDate instanceof Date
              ? existingRecord.workingDate.toISOString().split('T')[0]
              : (existingRecord.workingDate as string).split('T')[0];

            const holiday = await this.masterHolidayService.findByDate(dateStr);
            if (holiday) {
              newStatus = AttendanceStatus.HOLIDAY;
            } else if (this.masterHolidayService.isWeekend(new Date(existingRecord.workingDate))) {
              newStatus = AttendanceStatus.WEEKEND;
            }
          }

          existingRecord.status = newStatus;

          if (
            newStatus === AttendanceStatus.ABSENT ||
            newStatus === AttendanceStatus.WEEKEND ||
            newStatus === AttendanceStatus.HOLIDAY ||
            newStatus === AttendanceStatus.NOT_UPDATED ||
            newStatus === AttendanceStatus.UPCOMING
          ) {
            existingRecord.firstHalf = newStatus as any;
            existingRecord.secondHalf = newStatus as any;
            existingRecord.totalHours = newStatus === AttendanceStatus.ABSENT ? 0 : null;
          } else {
            existingRecord.firstHalf = null;
            existingRecord.secondHalf = null;
            existingRecord.totalHours = null; // Explicitly set to null
          }
          this.logger.log(`[ATTENDANCE_CREATE] Synchronized ${isClear ? 'NULL' : '0'} hours status: ${existingRecord.status}`);
        }

        const saved = await this.employeeAttendanceRepository.save(existingRecord);
        if (isEligibleForCompOff && hoursFromExisting > 3 && hoursFromExisting <= 9) {
          await this.compOffService.createOrUpdateCompOff(saved.employeeId, dateStrLocalFromExisting, saved.id, hoursFromExisting);
        }
        this.logger.log(`[ATTENDANCE_CREATE] Updated record ID: ${saved.id}, sourceRequestId after save: ${saved.sourceRequestId}`);
        return saved;
      }

      this.logger.log(`[ATTENDANCE_CREATE] Creating NEW attendance record for ${createEmployeeAttendanceDto.employeeId} on ${createEmployeeAttendanceDto.workingDate}`);
      this.logger.log(`[ATTENDANCE_CREATE] sourceRequestId being set to: ${createEmployeeAttendanceDto.sourceRequestId}`);

      // Calculate totalHours if firstHalf and secondHalf are provided, or if totalHours is provided
      if (createEmployeeAttendanceDto.firstHalf || createEmployeeAttendanceDto.secondHalf || createEmployeeAttendanceDto.totalHours) {
        const calculatedHours = this.calculateTotalHours(
          createEmployeeAttendanceDto.firstHalf || null,
          createEmployeeAttendanceDto.secondHalf || null,
          createEmployeeAttendanceDto.totalHours
        );
        createEmployeeAttendanceDto.totalHours = calculatedHours;
        this.logger.log(`[ATTENDANCE_CREATE] Final totalHours for new record: ${calculatedHours}`);
      }

      const newAttendance = this.employeeAttendanceRepository.create(createEmployeeAttendanceDto as any) as unknown as EmployeeAttendance;
      newAttendance.workLocation = null; // Always null

      // Only calculate status if NOT provided
      if (
        !newAttendance.status &&
        newAttendance.totalHours !== undefined &&
        newAttendance.totalHours !== null
      ) {
        newAttendance.status = await this.determineStatus(
          newAttendance.totalHours,
          newAttendance.workingDate,
          newAttendance.firstHalf,
          newAttendance.secondHalf
        );
      }

      // CRITICAL: Strictly enforce synchronization rules for BOTH branches (Create/Update)
      const hoursFromNew = Number(newAttendance.totalHours || 0);
      const dateObjFromNew = new Date(newAttendance.workingDate);
      const isSaturdayFromNew = dateObjFromNew.getDay() === 6;
      const isSundayFromNew = dateObjFromNew.getDay() === 0;
      const dateStrLocalFromNew = dateObjFromNew.toISOString().split('T')[0];
      const currentHolidayFromNew = await this.masterHolidayService.findByDate(dateStrLocalFromNew);
      
      const empDetailFromNew = await this.employeeDetailsRepository.findOne({ where: { employeeId: newAttendance.employeeId } });
      const isITDeptFromNew = empDetailFromNew?.department === Department.IT;
      const isFTFromNew = empDetailFromNew?.employmentType === EmploymentType.FULL_TIMER;

      const isWeekendOrHoliday = isSaturdayFromNew || isSundayFromNew || !!currentHolidayFromNew;
      const isEligibleForCompOff = isWeekendOrHoliday && isITDeptFromNew && isFTFromNew;

      if (isEligibleForCompOff && hoursFromNew > 3 && hoursFromNew <= 9) {
        newAttendance.status = AttendanceStatus.FULL_DAY;
        newAttendance.firstHalf = WorkLocation.OFFICE;
        newAttendance.secondHalf = WorkLocation.OFFICE;
      } else if (hoursFromNew > 0 && hoursFromNew <= 6 && !isWeekendOrHoliday) {
        // Relaxed enforcement: Only set defaults if no source request is linked and splits are empty
        if (!newAttendance.sourceRequestId && (!newAttendance.firstHalf || !newAttendance.secondHalf)) {
          newAttendance.firstHalf = WorkLocation.OFFICE;
          newAttendance.secondHalf = WorkLocation.LEAVE;
          this.logger.log(`[ATTENDANCE_CREATE] Enforced default Half Day splits for NEW record`);
        }
        newAttendance.status = AttendanceStatus.HALF_DAY;
        this.logger.log(`[ATTENDANCE_CREATE] Synchronized Half Day status (<= 6h)`);
      } else if ((hoursFromNew > 6 && !isWeekendOrHoliday) || (isWeekendOrHoliday && hoursFromNew >= 4)) {
        // STRICT OVERWRITE: Any entry considered "Full Day" must have "Office" splits
        newAttendance.firstHalf = WorkLocation.OFFICE;
        newAttendance.secondHalf = WorkLocation.OFFICE;
        createEmployeeAttendanceDto.firstHalf = WorkLocation.OFFICE as any;
        createEmployeeAttendanceDto.secondHalf = WorkLocation.OFFICE as any;
        newAttendance.status = AttendanceStatus.FULL_DAY;
        this.logger.log(`[ATTENDANCE_OVERWRITE] Enforced Full Day synchronization for NEW record (${hoursFromNew}h) with Office splits`);
      } else if (newAttendance.totalHours === 0 || newAttendance.totalHours === null) {
        const isClear = newAttendance.totalHours === null;
        let newStatus = isClear
          ? (workingDateObj > today ? null : AttendanceStatus.NOT_UPDATED)
          : (newAttendance.status &&
            Object.values(AttendanceStatus).includes(newAttendance.status as any) &&
            newAttendance.status !== AttendanceStatus.WEEKEND &&
            newAttendance.status !== AttendanceStatus.HOLIDAY
            ? (newAttendance.status as AttendanceStatus)
            : AttendanceStatus.ABSENT); // Explicit 0 hours defaults to ABSENT, overriding Weekend/Holiday

        if (isClear) {
          const dateStr = newAttendance.workingDate instanceof Date
            ? newAttendance.workingDate.toISOString().split('T')[0]
            : (newAttendance.workingDate as string).split('T')[0];

          const holiday = await this.masterHolidayService.findByDate(dateStr);
          if (holiday) {
            newStatus = AttendanceStatus.HOLIDAY;
          } else if (this.masterHolidayService.isWeekend(new Date(newAttendance.workingDate))) {
            newStatus = AttendanceStatus.WEEKEND;
          }
        }

        newAttendance.status = newStatus;

        if (
          newAttendance.status === AttendanceStatus.ABSENT ||
          newAttendance.status === AttendanceStatus.WEEKEND ||
          newAttendance.status === AttendanceStatus.HOLIDAY ||
          newAttendance.status === AttendanceStatus.NOT_UPDATED ||
          newAttendance.status === AttendanceStatus.UPCOMING
        ) {
          newAttendance.firstHalf = newAttendance.status as any;
          newAttendance.secondHalf = newAttendance.status as any;
          newAttendance.totalHours = newAttendance.status === AttendanceStatus.ABSENT ? 0 : null;
        } else {
          newAttendance.firstHalf = null;
          newAttendance.secondHalf = null;
          newAttendance.totalHours = null; // Explicitly set to null
        }
        this.logger.log(`[ATTENDANCE_CREATE] Synchronized ${isClear ? 'NULL' : '0'} hours status: ${newAttendance.status}`);
      }

      const saved = await this.employeeAttendanceRepository.save(newAttendance);
      if (isEligibleForCompOff && hoursFromNew > 3 && hoursFromNew <= 9) {
        await this.compOffService.createOrUpdateCompOff(saved.employeeId, dateStrLocalFromNew, saved.id, hoursFromNew);
      }
      this.logger.log(`[ATTENDANCE_CREATE] Created attendance ID: ${saved.id}, sourceRequestId after save: ${saved.sourceRequestId}`);

      // Trigger monthStatus recalculation
      this.triggerMonthStatusRecalc(saved.employeeId, saved.workingDate).catch(() => { });

      return saved;
    } catch (error) {
      this.logger.error(`[ATTENDANCE_CREATE] Error creating attendance for ${createEmployeeAttendanceDto.employeeId}: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) throw error;
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof NotFoundException) throw error;
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create attendance: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async checkEntryBlock(employeeId: string, date: string): Promise<{ isBlocked: boolean; reason: string | null }> {
    this.logger.log(`Checking entry block for employee: ${employeeId} on date: ${date}`);
    try {
      const workingDate = new Date(date);

      // 1. Check Month Lock
      if (!this.isEditableMonth(workingDate)) {
        return { isBlocked: true, reason: 'Month Locked' };
      }

      // 2. Check Manual Blocker
      const blocker = await this.blockerService.isBlocked(employeeId, workingDate);
      if (blocker) {
        return { isBlocked: true, reason: blocker.reason || 'Admin Blocked' };
      }

      // 3. Check Mixed Combinations (Existing Attendance)
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const attendance = await this.employeeAttendanceRepository.findOne({
        where: {
          employeeId,
          workingDate: Between(startOfDay, endOfDay),
        },
      });

      if (attendance) {
        const h1 = (attendance.firstHalf || '').toLowerCase();
        const h2 = (attendance.secondHalf || '').toLowerCase();

        // If either half has a value that is NOT 'office', it is a restricted entry (Leave, WFH, Client Visit, etc.)
        // This effectively blocks editing for: Leave, WFH, Client Visit, and any split containing them.
        const isRestricted = (val: string) =>
          val &&
          !val.toLowerCase().includes(WorkLocationKeyword.OFFICE) &&
          !val.toLowerCase().includes(WorkLocationKeyword.NOT_UPDATED) &&
          !val.toLowerCase().includes(WorkLocationKeyword.UPCOMING) &&
          !val.toLowerCase().includes(WorkLocationKeyword.HOLIDAY) &&
          !val.toLowerCase().includes(AttendanceStatus.WEEKEND.toLowerCase());

        if (isRestricted(h1) || isRestricted(h2)) {
          return { isBlocked: true, reason: 'Restricted Activity' };
        }
      }

      return { isBlocked: false, reason: null };
    } catch (error) {
      this.logger.error(`Error checking entry block for ${employeeId}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to check entry block: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async createBulk(attendanceDtos: EmployeeAttendanceDto[], isPrivileged: boolean = false): Promise<EmployeeAttendance[]> {
    this.logger.log(`Starting bulk attendance process for ${attendanceDtos.length} items`);
    try {
      const results: EmployeeAttendance[] = [];
      for (const dto of attendanceDtos) {
        try {
          let record;
          if (dto.id) {
            // Update existing
            record = await this.update(dto.id, dto, isPrivileged);
          } else {
            // Create new
            record = await this.create(dto, isPrivileged);
          }

          if (record) {
            results.push(record);
          }
        } catch (error) {
          this.logger.error(`Failed to process bulk item for ${dto.workingDate}: ${error.message}`);
        }
      }

      // Trigger monthStatus recalculation if any records were processed
      if (attendanceDtos.length > 0) {
        this.triggerMonthStatusRecalc(attendanceDtos[0].employeeId, attendanceDtos[0].workingDate).catch(() => { });
      }

      return results;
    } catch (error) {
      this.logger.error(`Error in bulk attendance process: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to process bulk attendance: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async autoUpdateTimesheet(employeeId: string, month: string, year: string, dryRun: boolean = false): Promise<any> {
    this.logger.log(`Auto-update started for: ${employeeId}, Month: ${month}/${year}, DryRun: ${dryRun}`);

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    const today = new Date();

    try {
      if (today.getMonth() + 1 !== monthNum || today.getFullYear() !== yearNum) {
        throw new BadRequestException('Auto-update is only available for the current month.');
      }

      this.logger.debug(`Fetching holidays and existing records for ${employeeId}...`);
      const startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0);
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const holidays = await this.masterHolidayService.findAll();
      const holidayDates = new Set(holidays.map(h => {
        const d = new Date(h.holidayDate || (h as any).date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }));

      const existingRecords = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(startDate, endDate)
        }
      });

      const existingDates = new Set<string>();
      const existingZeroHourRecords = new Map<string, EmployeeAttendance>();

      existingRecords.forEach(r => {
        const d = new Date(r.workingDate);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;

        if (r.totalHours && r.totalHours > 0) {
          existingDates.add(dateStr);
          return;
        }

        if (r.status === AttendanceStatus.LEAVE || r.status === AttendanceStatus.HALF_DAY) {
          existingDates.add(dateStr);
          return;
        }

        existingZeroHourRecords.set(dateStr, r);
      });

      const approvedLeaves = await this.leaveRequestRepository.find({
        where: {
          employeeId,
          status: LeaveRequestStatus.APPROVED,
          fromDate: LessThanOrEqual(endDate.toISOString().split('T')[0]),
          toDate: MoreThanOrEqual(startDate.toISOString().split('T')[0])
        }
      });

      const absenceDates = new Set<string>();
      const locationRequestDates = new Map<string, string>(); // date -> 'WFH' | 'Client Visit'

      approvedLeaves.forEach(leave => {
        const isAbsence = leave.requestType === LeaveRequestType.APPLY_LEAVE || leave.requestType === LeaveRequestType.LEAVE || leave.requestType === LeaveRequestType.HALF_DAY;

        let current = new Date(leave.fromDate);
        current.setHours(12, 0, 0, 0);
        const end = new Date(leave.toDate);
        end.setHours(23, 59, 59, 999);

        let safety = 0;
        while (current <= end && safety < 366) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${d}`;

          if (isAbsence) {
            absenceDates.add(dateStr);
          } else {
            // Map WFH/CV request to it's type for auto-filling
            locationRequestDates.set(dateStr, leave.requestType);
          }

          current.setDate(current.getDate() + 1);
          safety++;
        }
      });

      const recordsToCreate: EmployeeAttendanceDto[] = [];
      const updatedDateStrings: string[] = [];
      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const dayOfWeek = currentDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = holidayDates.has(dateStr);
        const hasAttendance = existingDates.has(dateStr);
        const isAbsence = absenceDates.has(dateStr);

        if (!isWeekend && !isHoliday && !hasAttendance && !isAbsence) {
          const dto = new EmployeeAttendanceDto();
          dto.employeeId = employeeId;
          dto.workingDate = new Date(currentDate);
          dto.workingDate.setHours(0, 0, 0, 0);

          const existingZeroHour = existingZeroHourRecords.get(dateStr);
          const locationRequestType = locationRequestDates.get(dateStr);

          const activity = locationRequestType === LeaveRequestType.WORK_FROM_HOME || locationRequestType === WorkLocation.WFH
            ? WorkLocation.WORK_FROM_HOME
            : (locationRequestType === LeaveRequestType.CLIENT_VISIT ? WorkLocation.CLIENT_VISIT : WorkLocation.OFFICE);

          dto.firstHalf = activity;
          dto.secondHalf = activity;
          dto.workLocation = null;
          dto.status = AttendanceStatus.FULL_DAY;
          dto.totalHours = 9;

          if (existingZeroHour) {
            dto.id = existingZeroHour.id;
          }

          dto.totalHours = 9;
          recordsToCreate.push(dto);
          updatedDateStrings.push(dateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (recordsToCreate.length === 0) {
        this.logger.log(`No eligible days found to update for ${employeeId}.`);
        return { message: 'No eligible days found to update.', count: 0, updatedDates: [] };
      }

      if (dryRun) {
        this.logger.log(`Dry run completed for ${employeeId}. Found ${recordsToCreate.length} potential updates.`);
        return {
          message: 'Dry run successful',
          count: recordsToCreate.length,
          updatedDates: updatedDateStrings
        };
      }

      this.logger.log(`Updating ${recordsToCreate.length} records for ${employeeId}...`);
      await this.createBulk(recordsToCreate);

      if (!dryRun) {
        this.triggerMonthStatusRecalc(employeeId, startDate).catch(() => { });
      }

      this.logger.log(`Auto-update completed for ${employeeId}. Dates: ${updatedDateStrings.join(', ')}`);
      return {
        message: 'Timesheet updated successfully',
        count: recordsToCreate.length,
        updatedDates: updatedDateStrings
      };

    } catch (error) {
      this.logger.error(`Error during auto-update for ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to auto-update timesheet', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll(): Promise<EmployeeAttendance[]> {
    this.logger.log(`Fetching all attendance records`);
    try {
      const records = await this.employeeAttendanceRepository.find();
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
      this.logger.error(`Error fetching all attendance records: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch attendance records: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findOne(id: number): Promise<EmployeeAttendance> {
    this.logger.log(`Fetching attendance record with ID: ${id}`);
    try {
      const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
      if (!attendance) throw new NotFoundException(`Record with ID ${id} not found`);
      return await this.applyStatusBusinessRules(attendance);
    } catch (error) {
      this.logger.error(`Error fetching attendance record ${id}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch attendance record: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async update(id: number, updateDto: Partial<EmployeeAttendanceDto>, isPrivileged: boolean = false): Promise<EmployeeAttendance | null> {
    try {
      const attendance = await this.findOne(id);

      this.logger.log(`[ATTENDANCE_UPDATE] ===== START UPDATE =====`);
      this.logger.log(`[ATTENDANCE_UPDATE] Updating attendance ID: ${id}, EmployeeID: ${attendance.employeeId}`);
      this.logger.log(`[ATTENDANCE_UPDATE] Date: ${attendance.workingDate}, Current sourceRequestId: ${attendance.sourceRequestId}`);
      this.logger.log(`[ATTENDANCE_UPDATE] Incoming sourceRequestId in DTO: ${(updateDto as any).sourceRequestId}`);


      if (!isPrivileged && !this.isEditableMonth(new Date(attendance.workingDate))) {
        throw new BadRequestException('Attendance for this month is locked.');
      }

      const workingDateObj = new Date(attendance.workingDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      workingDateObj.setHours(0, 0, 0, 0);

      // Rule: Delete future records if hours are cleared AND no work activity exists in splits
      const hasWorkActivity = (val: string | null) => {
        if (!val) return false;
        const v = val.toLowerCase();
        return v.includes(WorkLocation.OFFICE.toLowerCase()) ||
          v.includes(WorkLocation.WFH.toLowerCase()) ||
          v.includes(WorkLocation.WORK_FROM_HOME.toLowerCase()) ||
          v.includes(WorkLocation.CLIENT_VISIT.toLowerCase());
      };

      const hasActivity = hasWorkActivity(attendance.firstHalf) ||
        hasWorkActivity(attendance.secondHalf) ||
        hasWorkActivity(updateDto.firstHalf as any) ||
        hasWorkActivity(updateDto.secondHalf as any);

      if ((updateDto.totalHours === 0 || updateDto.totalHours === null) && workingDateObj > today && !hasActivity) {
        this.logger.log(`[ATTENDANCE_UPDATE] Deleting future record with 0 hours and no work activity`);
        await this.employeeAttendanceRepository.delete(id);
        return null;
      }

      const blocker = await this.blockerService.isBlocked(
        attendance.employeeId,
        attendance.workingDate
      );
      if (blocker) {
        const blockedByName = blocker.blockedBy || 'Administrator';
        throw new BadRequestException(`Timesheet is locked for this date by ${blockedByName}. Please contact them to unlock.`);
      }

      // --- Holiday/Weekend Blocking Logic (Start) ---
      let dateStrLocal = workingDateObj.toISOString().split('T')[0];
      let holiday = await this.masterHolidayService.findByDate(dateStrLocal);
      let isSun = workingDateObj.getDay() === 0;
      const isSatLocal = workingDateObj.getDay() === 6;

      if (!isPrivileged) {
        const detail = await this.employeeDetailsRepository.findOne({ where: { employeeId: attendance.employeeId } });
        let isIT = detail?.department === Department.IT;
        let isFullTimer = detail?.employmentType === EmploymentType.FULL_TIMER;

        if (holiday && !(isIT && isFullTimer)) {
          throw new BadRequestException('Attendance is blocked for Holidays.');
        }
        if (isSun && !(isIT && isFullTimer)) {
          throw new BadRequestException('Attendance is blocked for Sundays.');
        }
        
        const incomingHours = updateDto.totalHours !== undefined && updateDto.totalHours !== null 
          ? Number(updateDto.totalHours) 
          : Number(attendance.totalHours || 0);

        if ((isSatLocal || (isSun && isIT && isFullTimer) || (holiday && isIT && isFullTimer)) && incomingHours > 0) {
          if (incomingHours < 4 || incomingHours > 9) {
            const msg = isSatLocal ? 'Saturday' : (isSun ? 'Sunday' : 'Holiday');
            throw new BadRequestException(`${msg} hours must be between 4 and 9.`);
          }
        }
      }
      // --- Holiday/Weekend Blocking Logic (End) ---

      const isHalfDayStatus = attendance.status === AttendanceStatus.HALF_DAY || String(attendance.status).toLowerCase() === AttendanceStatus.HALF_DAY.toLowerCase();
      const isLocked = !!attendance.sourceRequestId && isHalfDayStatus;

      // GUARD: Protect Approved Leaves for non-privileged users
      if (!isPrivileged && attendance.sourceRequestId && !(updateDto as any).sourceRequestId) {
        this.logger.warn(`[ATTENDANCE_RESTRICTION] Blocking manual single-record update for record ${attendance.id} because it is linked to Leave Request ${attendance.sourceRequestId} (Locked State: ${isLocked})`);
        return attendance; // Skip update and return existing record
      }

      // Always null out work_location - use splits instead
      updateDto.workLocation = null;
      attendance.workLocation = null;

      const existingStatus = attendance.status;
      const isLeave = existingStatus === AttendanceStatus.LEAVE;
      const originalTotalHours = attendance.totalHours; // Capture original hours 

      Object.assign(attendance, updateDto);
      attendance.workLocation = null; // Force null again after assign

      // Preserve sourceRequestId if not explicitly provided in updateDto
      if (updateDto.hasOwnProperty('sourceRequestId')) {
        attendance.sourceRequestId = (updateDto as any).sourceRequestId;
      }

      // Collect metadata for status and comp-off rules
      const dateObj = new Date(attendance.workingDate);
      const isSat = dateObj.getDay() === 6;
      isSun = dateObj.getDay() === 0;
      const empDetail = await this.employeeDetailsRepository.findOne({ where: { employeeId: attendance.employeeId } });
      const isITMetadata = empDetail?.department === Department.IT;
      const isFTMetadata = empDetail?.employmentType === EmploymentType.FULL_TIMER;
      const isWeekendOrHoliday = isSat || isSun || !!holiday;
      const isEligibleForCompOff = isWeekendOrHoliday && isITMetadata && isFTMetadata;

      // CRITICAL FIX: Synchronize splits and status with the new totalHours
      if (updateDto.totalHours !== undefined) {
        const hours = Number(updateDto.totalHours);

        // STRICT OVERWRITE: If hours > 6 (or Weekend/Holiday >= 4), it's ALWAYS a Full Day with Office splits.
        if (hours > 6 || (isWeekendOrHoliday && hours >= 4)) {
          attendance.status = AttendanceStatus.FULL_DAY;
          updateDto.status = AttendanceStatus.FULL_DAY;

          attendance.firstHalf = WorkLocation.OFFICE;
          attendance.secondHalf = WorkLocation.OFFICE;
          updateDto.firstHalf = WorkLocation.OFFICE as any;
          updateDto.secondHalf = WorkLocation.OFFICE as any;

          this.logger.log(`[ATTENDANCE_OVERWRITE] Synchronized Full Day (${hours}h) with Office splits`);
        }
        // If hours is <= 6 and > 0 (and not a Full Day Saturday), it's Half Day.
        else if (hours > 0 && hours <= 6 && !isWeekendOrHoliday) {
          attendance.status = AttendanceStatus.HALF_DAY;
          updateDto.status = AttendanceStatus.HALF_DAY;
          this.logger.log(`[ATTENDANCE_UPDATE] Synchronized Half Day (${hours}h) status`);
        }
        else if (updateDto.totalHours === 0 || updateDto.totalHours === null) {
          const isClear = updateDto.totalHours === null;
          let newStatus = isClear
            ? (workingDateObj > today ? null : AttendanceStatus.NOT_UPDATED)
            : (updateDto.status && Object.values(AttendanceStatus).includes(updateDto.status as any)
              ? (updateDto.status as AttendanceStatus)
              : AttendanceStatus.ABSENT); // Explicit 0 hours defaults to ABSENT, skipping Weekend/Holiday check

          if (isClear) {
            const dateStr = attendance.workingDate instanceof Date
              ? attendance.workingDate.toISOString().split('T')[0]
              : (attendance.workingDate as string).split('T')[0];

            holiday = await this.masterHolidayService.findByDate(dateStr);
            if (holiday) {
              newStatus = AttendanceStatus.HOLIDAY;
            } else if (this.masterHolidayService.isWeekend(new Date(attendance.workingDate))) {
              newStatus = AttendanceStatus.WEEKEND;
            }
          }

          attendance.status = newStatus;
          updateDto.status = newStatus;

          if (
            newStatus === AttendanceStatus.ABSENT ||
            newStatus === AttendanceStatus.WEEKEND ||
            newStatus === AttendanceStatus.HOLIDAY ||
            newStatus === AttendanceStatus.NOT_UPDATED ||
            newStatus === AttendanceStatus.UPCOMING
          ) {
            attendance.firstHalf = newStatus as any;
            attendance.secondHalf = newStatus as any;
            attendance.totalHours = newStatus === AttendanceStatus.ABSENT ? 0 : null;
            updateDto.firstHalf = newStatus as any;
            updateDto.secondHalf = newStatus as any;
            updateDto.totalHours = attendance.totalHours as any;
          } else {
            // For UPCOMING or NOT_UPDATED (Cleared)
            attendance.firstHalf = null;
            attendance.secondHalf = null;
            attendance.totalHours = null; // Explicitly set to null in DB
            updateDto.firstHalf = null as any;
            updateDto.secondHalf = null as any;
            updateDto.totalHours = null as any;
          }


          this.logger.log(`[ATTENDANCE_UPDATE] Reset to ${isClear ? 'NULL' : '0'} hours: ${newStatus}`);
        }

      }

      // If ONLY splits were updated (unlikely from frontend but possible from API), 
      // recalculate totalHours and status
      else if (updateDto.firstHalf !== undefined || updateDto.secondHalf !== undefined) {
        const firstHalf = updateDto.firstHalf !== undefined ? updateDto.firstHalf : attendance.firstHalf;
        const secondHalf = updateDto.secondHalf !== undefined ? updateDto.secondHalf : attendance.secondHalf;
        const calculatedHours = this.calculateTotalHours(firstHalf || null, secondHalf || null);

        attendance.totalHours = calculatedHours;
        updateDto.totalHours = calculatedHours;

        const newStatus = await this.determineStatus(calculatedHours, attendance.workingDate, firstHalf, secondHalf);
        attendance.status = newStatus;
        updateDto.status = newStatus;

        this.logger.log(`[ATTENDANCE_UPDATE] Split-based update: ${calculatedHours}h, status: ${newStatus}`);
      }


      // Auto-fill splits for Full Day (9 hours) if missing
      if (attendance.totalHours === 9 && (!attendance.firstHalf || !attendance.secondHalf)) {
        const defaultActivity = this.determineDefaultActivity(attendance.firstHalf, attendance.secondHalf);
        if (!attendance.firstHalf) {
          attendance.firstHalf = defaultActivity;
          updateDto.firstHalf = defaultActivity;
        }
        if (!attendance.secondHalf) {
          attendance.secondHalf = defaultActivity;
          updateDto.secondHalf = defaultActivity;
        }
        this.logger.log(`[ATTENDANCE_UPDATE] Auto-filled missing splits for Full Day: ${attendance.firstHalf}, ${attendance.secondHalf}`);
      }

      // Comp-Off Earning Logic: Only for eligible IT Full-Timers handled after save below
      const finalHours = Number(attendance.totalHours || 0);

      const saved = await this.employeeAttendanceRepository.save(attendance);
      if (isEligibleForCompOff && finalHours > 3 && finalHours <= 9) {
        await this.compOffService.createOrUpdateCompOff(saved.employeeId, dateStrLocal, saved.id, finalHours);
      }

      // Trigger monthStatus recalculation
      this.triggerMonthStatusRecalc(saved.employeeId, saved.workingDate).catch(() => { });

      return saved;
    } catch (error) {
      this.logger.error(`[ATTENDANCE_UPDATE] Error updating attendance ID ${id}: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) throw error;
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof NotFoundException) throw error;
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to update attendance: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async determineStatus(
    hours: number,
    workingDate: Date,
    firstHalf?: string | null,
    secondHalf?: string | null
  ): Promise<AttendanceStatus | null> {
    try {
      const dateObj = new Date(workingDate);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const isSat = dateObj.getDay() === 6;
      const isSun = dateObj.getDay() === 0;
      const holidayObj = await this.masterHolidayService.findByDate(dateStr);
      const isWeekendOrHoliday = isSat || isSun || !!holidayObj;

      // 0. Primary Rule: Hours strictly dictate status if available
      if (isWeekendOrHoliday && hours >= 4) {
        return AttendanceStatus.FULL_DAY;
      }
      if (hours > 0 && hours <= 6 && !isWeekendOrHoliday) {
        return AttendanceStatus.HALF_DAY;
      }
      if (hours > 6) {
        return AttendanceStatus.FULL_DAY;
      }

      // 1. Check Split-Day Logic if halves are provided (fallback/validation)
      if (firstHalf || secondHalf) {
        const h1 = (firstHalf || '').toLowerCase().trim();
        const h2 = (secondHalf || '').toLowerCase().trim();

        const isWork = (val: string) => 
          val.includes(WorkLocationKeyword.OFFICE) ||
          val.includes(WorkLocationKeyword.WFH) ||
          val.includes(WorkLocationKeyword.WORK_FROM_HOME) ||
          val.includes(WorkLocationKeyword.CLIENT_VISIT) ||
          val.includes(WorkLocationKeyword.CV) ||
          val.includes(WorkLocationKeyword.PRESENT);
          
        const isLeave = (val: string) => val.includes(WorkLocationKeyword.LEAVE);
        const isAbsent = (val: string) => val.includes(WorkLocationKeyword.ABSENT) || val === 'absent';

        if (isWork(h1) && isWork(h2)) return AttendanceStatus.FULL_DAY;
        if ((isWork(h1) && isLeave(h2)) || (isLeave(h1) && isWork(h2))) return AttendanceStatus.HALF_DAY;
        if ((isWork(h1) && isAbsent(h2)) || (isAbsent(h1) && isWork(h2))) return AttendanceStatus.HALF_DAY;
        if (isLeave(h1) && isLeave(h2)) return AttendanceStatus.LEAVE;
      }

      if (hours === 0 || hours === null || hours === undefined) {
        const holiday = await this.masterHolidayService.findByDate(dateStr);
        if (holiday) return AttendanceStatus.HOLIDAY;

        if (this.masterHolidayService.isWeekend(dateObj)) return AttendanceStatus.WEEKEND;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dateObj.setHours(0, 0, 0, 0);

        return dateObj > today ? null : (firstHalf === AttendanceStatus.NOT_UPDATED ? AttendanceStatus.NOT_UPDATED : AttendanceStatus.ABSENT);
      } else if (hours > 0) {
        // Hours > 0 and <= 6 is HALF_DAY
        return AttendanceStatus.HALF_DAY;
      }
      return null;
    } catch (error) {
      this.logger.error(`Error determining status: ${error.message}`);
      throw error;
    }
  }

  async findByMonth(month: string, year: string, employeeId: string): Promise<EmployeeAttendance[]> {
    this.logger.log(`Fetching attendance for employee: ${employeeId}, Month: ${month}/${year}`);
    try {
      const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

      const records = await this.employeeAttendanceRepository.find({
        where: { employeeId, workingDate: Between(start, end) },
        order: { workingDate: 'ASC' },
      });
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
      this.logger.error(`Error fetching attendance for ${employeeId} in ${month}/${year}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch monthly attendance: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findByDate(workingDate: string, employeeId: string): Promise<EmployeeAttendance[]> {
    this.logger.log(`Fetching attendance for employee: ${employeeId}, Date: ${workingDate}`);
    try {
      const records = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(new Date(`${workingDate}T00:00:00`), new Date(`${workingDate}T23:59:59`))
        },
      });
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
      this.logger.error(`Error fetching attendance for ${employeeId} on ${workingDate}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch attendance by date: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findByDateRange(employeeId: string, startDate: string, endDate: string): Promise<EmployeeAttendance[]> {
    this.logger.log(`Fetching attendance for employee: ${employeeId} from ${startDate} to ${endDate}`);
    try {
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T23:59:59`);

      const records = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(start, end)
        },
        order: { workingDate: 'ASC' },
      });
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
      this.logger.error(`Error fetching attendance range for ${employeeId}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch attendance range: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findWorkedDays(employeeId: string, startDate: string, endDate: string): Promise<any[]> {
    this.logger.log(`Fetching worked days for employee: ${employeeId} from ${startDate} to ${endDate}`);
    try {
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T23:59:59`);

      const results = await this.employeeAttendanceRepository
        .createQueryBuilder('attendance')
        .innerJoin('employee_details', 'details', 'details.employee_id = attendance.employee_id')
        .select([
          'details.id AS id',
          'details.full_name AS fullName',
          'details.employeeId AS employeeId',
          'details.department AS department',
          'details.designation AS designation',
          'attendance.workingDate AS workingDate',
          'attendance.totalHours AS totalHours',
          'attendance.status AS status'
        ])
        .where('attendance.employeeId = :employeeId', { employeeId })
        .andWhere('attendance.workingDate BETWEEN :start AND :end', { start, end })
        .orderBy('attendance.workingDate', 'ASC')
        .getRawMany();

      return results;
    } catch (error) {
      this.logger.error(`Error fetching worked days for ${employeeId}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch worked days: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async remove(id: number): Promise<void> {
    this.logger.log(`Removing attendance record with ID: ${id}`);
    try {
      const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
      if (attendance && !this.isEditableMonth(new Date(attendance.workingDate))) {
        throw new BadRequestException('Cannot delete locked attendance records.');
      }
      const result = await this.employeeAttendanceRepository.delete(id);
      if (result.affected === 0) throw new NotFoundException(`Record with ID ${id} not found`);

      // [RECALC]: Trigger MonthStatus recalculation from DB truth
      if (attendance) {
        this.triggerMonthStatusRecalc(attendance.employeeId, attendance.workingDate).catch(() => { });
      }
    } catch (error) {
      this.logger.error(`Error removing attendance record ${id}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to remove attendance record: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }



  private async applyStatusBusinessRules(attendance: EmployeeAttendance): Promise<EmployeeAttendance> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const workingDateObj = new Date(attendance.workingDate);
      const workingDate = workingDateObj.toISOString().split('T')[0];

      if (workingDate <= today) {
        // User Request: Actual statuses should come through
        // Removed the override that was intended to "unlock" weekends/holidays
        // since editability is handled separately in checkEntryBlock.

        if (!attendance.status || attendance.status === AttendanceStatus.NOT_UPDATED) {
          // Priority 1: Check Holiday
          const holiday = await this.masterHolidayService.findByDate(workingDate);
          if (holiday) {
            attendance.status = AttendanceStatus.HOLIDAY;
            return attendance;
          }

          // Priority 2: Check Weekend
          // But respect explicit status if it exists (e.g. Absent, Leave)
          if (this.masterHolidayService.isWeekend(workingDateObj)) {
            const currentStatus = attendance.status as AttendanceStatus;
            const hasExplicitStatus = currentStatus !== null &&
              (currentStatus === AttendanceStatus.ABSENT ||
                currentStatus === AttendanceStatus.LEAVE ||
                currentStatus === AttendanceStatus.HALF_DAY ||
                currentStatus === AttendanceStatus.FULL_DAY);

            if (!hasExplicitStatus) {
              attendance.status = AttendanceStatus.WEEKEND;
              return attendance;
            }
          }

          // Priority 3: Check for approved Client Visit or Work From Home request 
          // ONLY if the record is explicitly linked via sourceRequestId
          if (attendance.sourceRequestId) {
            const approvedRequest = await this.leaveRequestRepository.findOne({
              where: {
                id: attendance.sourceRequestId,
                employeeId: attendance.employeeId,
                requestType: In([LeaveRequestType.CLIENT_VISIT, LeaveRequestType.WORK_FROM_HOME, WorkLocation.WFH]),
                status: LeaveRequestStatus.APPROVED,
                fromDate: LessThanOrEqual(workingDate),
                toDate: MoreThanOrEqual(workingDate),
              },
            });

            if (approvedRequest) {
              // If approved Client Visit or WFH exists AND it is linked, mark as Present (Full Day)
              attendance.status = AttendanceStatus.FULL_DAY;
              return attendance;
            }
          }

          // Priority 4: Default to Absent for past weekdays with missing status (0 hours)
          // attendance.status = AttendanceStatus.ABSENT;
          // User Request: Keep as NOT_UPDATED instead of ABSENT
          if (!attendance.status) {
            attendance.status = AttendanceStatus.NOT_UPDATED;
          }
        }
      }
      return attendance;
    } catch (error) {
      this.logger.error(`Error applying status business rules for ${attendance.employeeId}: ${error.message}`);
      throw error;
    }
  }

  private isEditableMonth(workingDate: Date): boolean {
    try {
      const today = new Date();
      const workDate = new Date(workingDate);

      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();

      const workYear = workDate.getFullYear();
      const workMonth = workDate.getMonth();

      // Calculate month difference
      const monthDiff = (todayYear - workYear) * 12 + (todayMonth - workMonth);

      // 1. Current Month or Future -> ALWAYS Editable
      if (monthDiff <= 0) {
        return true;
      }

      // 2. Previous Month -> Editable ONLY if Today is 1st of month AND Time < 6 PM
      if (monthDiff === 1) {
        if (today.getDate() === 1 && today.getHours() < 18) {
          return true;
        }
      }

      // 3. Any other past month -> LOCKED
      return false;
    } catch (error) {
      this.logger.error(`Error checking if month is editable: ${error.message}`);
      return false;
    }
  }

  /**
   * REFACTORED: Triggers the DB-truth recalculation for an employee's month.
   */
  public async triggerMonthStatusRecalc(employeeId: string, date: Date | string): Promise<void> {
    try {
      // Use dayjs for robust month/year extraction regardless of input format
      const d = dayjs(date);
      const month = String(d.month() + 1);
      const year = String(d.year());

      // persistMonthStatus = true ensures it is saved to EmployeeDetails
      // This is the core "DB-Truth" trigger.
      await this.getDashboardStats(employeeId, month, year, true);
      this.logger.log(`[MONTH_STATUS_TRIGGER] DB-Truth Recalculated for ${employeeId} (${month}/${year})`);
    } catch (err) {
      this.logger.error(`[MONTH_STATUS_TRIGGER] ❌ FAILED for ${employeeId}: ${err.message}`);
    }
  }

  async getTrends(employeeId: string, endDateStr: string, startDateStr?: string): Promise<any[]> {
    this.logger.log(`Fetching trends for employee: ${employeeId}, EndDate: ${endDateStr}`);
    try {
      const endInput = new Date(endDateStr);
      let start: Date;

      if (startDateStr) {
        start = new Date(startDateStr);
      } else {
        // Default: Start of the month for endInput
        start = new Date(endInput.getFullYear(), endInput.getMonth(), 1);
      }

      start.setHours(0, 0, 0, 0);
      const end = new Date(endInput.getFullYear(), endInput.getMonth(), endInput.getDate(), 23, 59, 59);

      // Fetch all attendance records for this period from employee_attendance table
      const attendances = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(start, end),
        },
        order: { workingDate: 'ASC' }
      });

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyStatsMap = new Map<string, any>();

      attendances.forEach(record => {
        const date = typeof record.workingDate === 'string' ? new Date(record.workingDate) : record.workingDate;
        const key = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;

        if (!monthlyStatsMap.has(key)) {
          monthlyStatsMap.set(key, {
            month: monthNames[date.getMonth()],
            year: date.getFullYear(),
            totalLeaves: 0,
            compOffLeaves: 0,
            workFromHome: 0,
            clientVisits: 0
          });
        }

        const stats = monthlyStatsMap.get(key);
        const recordStatus = (record.status || '').toLowerCase().trim();
        const fHalf = (record.firstHalf || '').toLowerCase().trim();
        const sHalf = (record.secondHalf || '').toLowerCase().trim();

        const isCompOff = 
          recordStatus.includes('comp off') || 
          recordStatus === WorkLocationKeyword.COMP_OFF_LEAVE ||
          fHalf.includes('comp off') || 
          fHalf === WorkLocationKeyword.COMP_OFF_LEAVE ||
          sHalf.includes('comp off') ||
          sHalf === WorkLocationKeyword.COMP_OFF_LEAVE;

        // Check for Full Leaves (1.0) and Half Days (0.5)
        if (recordStatus === AttendanceStatus.LEAVE.toLowerCase() || recordStatus === 'absent' || isCompOff) {
          if (isCompOff) {
            stats.compOffLeaves += 1;
          } else {
            stats.totalLeaves += 1;
          }
        }
        else if (recordStatus === AttendanceStatus.HALF_DAY.toLowerCase()) {
          if (isCompOff) {
            stats.compOffLeaves += 0.5;
          } else {
            stats.totalLeaves += 0.5;
          }
        }

        // Check for WFH in either split
        if (this.isActivity(record.firstHalf, WorkLocation.WFH.toLowerCase()) || 
            this.isActivity(record.firstHalf, WorkLocation.WORK_FROM_HOME.toLowerCase()) ||
            this.isActivity(record.secondHalf, WorkLocation.WFH.toLowerCase()) || 
            this.isActivity(record.secondHalf, WorkLocation.WORK_FROM_HOME.toLowerCase())) {
          stats.workFromHome++;
        }
        // Check for Client Visit in either split
        else if (this.isActivity(record.firstHalf, WorkLocation.CLIENT_VISIT.toLowerCase()) ||
                 this.isActivity(record.secondHalf, WorkLocation.CLIENT_VISIT.toLowerCase())) {
          stats.clientVisits++;
        }
      });

      // Convert map to sorted array
      return Array.from(monthlyStatsMap.values());
    } catch (error) {
      this.logger.error(`Error fetching trends for ${employeeId}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch trends: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getTrendsDetailed(employeeId: string, endDateStr: string, startDateStr?: string): Promise<any[]> {
    this.logger.log(`Fetching detailed trends for employee: ${employeeId}, EndDate: ${endDateStr}`);
    try {
      const endInput = new Date(endDateStr);
      let start: Date;

      if (startDateStr) {
        start = new Date(startDateStr);
      } else {
        // Default: last 5 months including current month
        start = new Date(endInput.getFullYear(), endInput.getMonth() - 4, 1);
      }

      start.setHours(0, 0, 0, 0);
      const end = new Date(endInput.getFullYear(), endInput.getMonth(), endInput.getDate(), 23, 59, 59);

      const attendances = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(start, end),
        },
        order: { workingDate: 'ASC' }
      });

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyStatsMap = new Map<string, any>();

      attendances.forEach(record => {
        // Use a robust way to get local YYYY-MM from the workingDate
        const date = record.workingDate instanceof Date ? record.workingDate : new Date(record.workingDate);
        const m = date.getMonth();
        const y = date.getFullYear();
        const key = `${monthNames[m]} ${y}`;

        if (!monthlyStatsMap.has(key)) {
          monthlyStatsMap.set(key, {
            month: monthNames[m],
            year: y,
            totalLeaves: 0,
            compOffLeaves: 0,
            workFromHome: 0,
            clientVisits: 0,
            office: 0
          });
        }

        const stats = monthlyStatsMap.get(key);

        // 1. If splits exist, use them (most accurate for half-days)
        if (record.firstHalf || record.secondHalf) {
          const processHalf = (half: string | null) => {
            if (!half) return;
            const h = half.toLowerCase().trim();
            const isCompOffActivity = h.includes('comp off') || h === WorkLocationKeyword.COMP_OFF_LEAVE;
            
            if (h.includes(AttendanceStatus.LEAVE.toLowerCase()) || h.includes(AttendanceStatus.ABSENT.toLowerCase()) || isCompOffActivity) {
              if (isCompOffActivity) {
                stats.compOffLeaves += 0.5;
              } else {
                stats.totalLeaves += 0.5;
              }
            } else if (h.includes(WorkLocation.WFH.toLowerCase()) || h.includes(WorkLocation.WORK_FROM_HOME.toLowerCase())) {
              stats.workFromHome += 0.5;
            } else if (h.includes(WorkLocation.CLIENT_VISIT.toLowerCase())) {
              stats.clientVisits += 0.5;
            } else if (h.includes(WorkLocation.OFFICE.toLowerCase())) {
              stats.office += 0.5;
            }
          };

          processHalf(record.firstHalf);
          processHalf(record.secondHalf);
        }
        // 2. Fallback to status and totalHours if splits are missing
        else {
          const status = (record.status || '').toLowerCase();
          const hours = Number(record.totalHours || 0);

          if (status === AttendanceStatus.LEAVE.toLowerCase() || status === AttendanceStatus.ABSENT.toLowerCase()) {
            stats.totalLeaves += 1;
          } else if (status === AttendanceStatus.HALF_DAY.toLowerCase()) {
            // If it's a half day but splits are missing, assume 0.5 Leave and 0.5 Office
            stats.totalLeaves += 0.5;
            stats.office += 0.5;
          } else if (hours === 9 || status.includes(WorkLocation.PRESENT.toLowerCase()) || status.includes(AttendanceStatus.FULL_DAY.toLowerCase().split(' ')[0])) {
            // Default to Office if it's a full day without specific splits
            stats.office += 1;
          } else if (hours > 0) {
            // Any other partial work without splits
            stats.office += (hours / 9);
          }
        }
      });

      // Ensure values are rounded to 2 decimal places to avoid floating point issues
      const results = Array.from(monthlyStatsMap.values()).map(item => ({
        ...item,
        totalLeaves: Math.round(item.totalLeaves * 10) / 10,
        compOffLeaves: Math.round(item.compOffLeaves * 10) / 10,
        workFromHome: Math.round(item.workFromHome * 10) / 10,
        clientVisits: Math.round(item.clientVisits * 10) / 10,
        office: Math.round(item.office * 10) / 10
      }));

      return results;
    } catch (error) {
      this.logger.error(`Error fetching detailed trends for ${employeeId}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch detailed trends: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findAllMonthlyDetails(month: string, year: string, managerName?: string, managerId?: string): Promise<EmployeeAttendance[]> {
    this.logger.log(`Fetching all monthly details for ${month}/${year}. Filter Manager: ${managerName || 'None'}`);
    try {
      const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

      const query = this.employeeAttendanceRepository
        .createQueryBuilder('attendance')
        .innerJoin(
          EmployeeDetails,
          'ed',
          'ed.employeeId = attendance.employeeId',
        )
        .where('attendance.workingDate BETWEEN :start AND :end', { start, end });

      if (managerName || managerId) {
        query.andWhere('ed.userStatus = :userStatus', { userStatus: UserStatus.ACTIVE });
        query.innerJoin(
          ManagerMapping,
          'mm',
          'mm.employeeId = attendance.employeeId',
        );
        query.andWhere(
          '(mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)',
          {
            managerNameQuery: `%${managerName}%`,
            managerIdQuery: `%${managerId}%`,
          },
        );
        query.andWhere('mm.status = :mappingStatus', { mappingStatus: ManagerMappingStatus.ACTIVE });
      }

      query.orderBy('attendance.workingDate', 'ASC');

      const records = await query.getMany();
      return Promise.all(
        records.map((record) => this.applyStatusBusinessRules(record)),
      );
    } catch (error) {
      this.logger.error(`Error fetching all monthly details for ${month}/${year}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch all monthly details: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  async getDashboardStats(employeeId: string, queryMonth?: string, queryYear?: string, persistMonthStatus: boolean = false) {
    try {
      const today = new Date();
      const currentMonth = queryMonth ? parseInt(queryMonth) : today.getMonth() + 1;
      const currentYear = queryYear ? parseInt(queryYear) : today.getFullYear();

      // 1. Total Week Hours
      const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
      // Adjust to make Monday 0, Sunday 6
      const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(today);
      weekStart.setDate(diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekRecords = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(weekStart, weekEnd),
        },
      });

      const totalWeekHours = weekRecords.reduce((acc, curr) => acc + Number(curr.totalHours || 0), 0);

      // 2. Total Monthly Hours
      const monthStart = new Date(currentYear, currentMonth - 1, 1);
      const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

      const monthRecords = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(monthStart, monthEnd),
        },
      });

      const totalMonthlyHours = monthRecords.reduce((acc, curr) => acc + Number(curr.totalHours || 0), 0);

      // 3. Pending Updates
      // Count until today inclusive (if current month) or end of month (if past month)
      const checkEndDate = new Date(today);
      checkEndDate.setHours(23, 59, 59, 999);

      // Determine the boundary for checking pending updates:
      // If we are looking at a past month, check until the end of that month.
      // If current month, check until today.
      let pendingLimitDate = checkEndDate;
      if (monthEnd < pendingLimitDate) {
        pendingLimitDate = monthEnd;
      }

      let pendingUpdates = 0;

      // Fetch master holidays for the month
      // NOTE: validation error fixed: findAll takes no arguments. It returns ALL holidays.
      // We will filter or just put all in the Set, which is fine since the set key includes year.
      const holidayEntities = await this.masterHolidayService.findAll();

      // Standard definitions

      // Helper to avoid timezone shifts when converting to YYYY-MM-DD
      const toLocalYMD = (dateInput: Date | string) => {
        const date = new Date(dateInput);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      // [DB_TRUTH]: Define strictly filled attendance statuses.
      // Standardized: Approved leaves are synced to attendance with status 'Leave' or 'On Leave'.
      const filledStatuses = [
        AttendanceStatus.FULL_DAY,
        AttendanceStatus.HALF_DAY,
        WorkLocation.WORK_FROM_HOME,
        WorkLocation.WFH,
        WorkLocation.CLIENT_VISIT,
        WorkLocation.PRESENT,
        AttendanceStatus.LEAVE,
        AttendanceStatus.ABSENT,
        'On Leave'
      ];

      const existingAttendanceDates = new Set(
        monthRecords
          .filter(r => r.status && filledStatuses.includes(r.status))
          .map(r => toLocalYMD(r.workingDate))
      );

      // Optimization: Set of Holidays
      const yearHolidays = await this.masterHolidayService.findAll();
      const holidayDates = new Set(
        yearHolidays.map(h => {
          const d = h.holidayDate || (h as any).date;
          return toLocalYMD(d);
        })
      );

      // Leaves are now checked via attendance table


      let loopDate = new Date(monthStart);
      while (loopDate <= pendingLimitDate) {
        if (loopDate > today) break; // Extra safety

        const dateStr = toLocalYMD(loopDate);

        // 1. Check Weekend
        const isWeekend = this.masterHolidayService.isWeekend(loopDate);
        // 2. Check Holiday
        const isHoliday = holidayDates.has(dateStr);
        // 3. Check existing attendance
        const hasAttendance = existingAttendanceDates.has(dateStr);
        // [DB_TRUTH_GAP]: Gap if NOT Weekend AND NOT Holiday AND No "Filled" attendance record
        if (!isWeekend && !isHoliday && !hasAttendance) {
          pendingUpdates++;
        }

        loopDate.setDate(loopDate.getDate() + 1);
      }

      const isFutureMonth = monthStart.getTime() > today.getTime();
      let dbMonthStatus: MonthStatus = MonthStatus.PENDING;

      if (persistMonthStatus) {
        const calculatedStatus: MonthStatus = (!isFutureMonth && pendingUpdates === 0) ? MonthStatus.SUBMITTED : MonthStatus.PENDING;
        dbMonthStatus = calculatedStatus;
        try {
          await this.employeeDetailsRepository.update({ employeeId }, { monthStatus: calculatedStatus });
        } catch (dbError) {
          this.logger.warn(`Failed to persist monthStatus for employee ${employeeId}: ${dbError.message}`);
        }
      } else {
        const emp = await this.employeeDetailsRepository.findOne({ select: ['monthStatus'], where: { employeeId } });
        dbMonthStatus = emp?.monthStatus || MonthStatus.PENDING;
      }

      return {
        totalWeekHours: parseFloat(Number(totalWeekHours).toFixed(1)),
        totalMonthlyHours: parseFloat(Number(totalMonthlyHours).toFixed(1)),
        pendingUpdates,
        monthStatus: dbMonthStatus,
      };
    } catch (error) {
      this.logger.error(`Error calculating dashboard stats for employee ${employeeId}:`, error);
      throw new HttpException('Failed to calculate dashboard statistics', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAllDashboardStats(queryMonth?: string, queryYear?: string, managerName?: string, managerId?: string) {
    this.logger.log(`Fetching all dashboard stats. Month: ${queryMonth || 'Current'}, Year: ${queryYear || 'Current'}, Manager: ${managerName || 'None'}`);
    try {
      const today = new Date();
      const currentMonth = queryMonth ? parseInt(queryMonth) : today.getMonth() + 1;
      const currentYear = queryYear ? parseInt(queryYear) : today.getFullYear();

      // Range calculations
      const dayOfWeek = today.getDay();
      const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(today);
      weekStart.setDate(diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const monthStart = new Date(currentYear, currentMonth - 1, 1);
      const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

      const fetchStart = weekStart < monthStart ? new Date(weekStart) : new Date(monthStart);
      const fetchEnd = weekEnd > monthEnd ? new Date(weekEnd) : new Date(monthEnd);

      // Pending limit date logic
      const checkEndDate = new Date(today);
      checkEndDate.setHours(23, 59, 59, 999);
      let pendingLimitDate = checkEndDate;
      if (monthEnd < pendingLimitDate) {
        pendingLimitDate = monthEnd;
      }

      // 1. Fetch all employees (filtered by manager if provided)
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .select(['employee.employeeId', 'employee.fullName', 'employee.monthStatus']);

      if (managerName || managerId) {
        query.andWhere('employee.userStatus = :userStatus', { userStatus: UserStatus.ACTIVE });
        query.innerJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId');
        query.andWhere(
          '(mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)',
          {
            managerNameQuery: `%${managerName}%`,
            managerIdQuery: `%${managerId}%`,
          },
        );
        query.andWhere('mm.status = :status', { status: ManagerMappingStatus.ACTIVE });
      }

      const employees = await query.getMany();

      // 2. Fetch all attendance for the range
      const allRecords = await this.employeeAttendanceRepository.find({
        where: {
          workingDate: Between(fetchStart, fetchEnd),
        },
      });

      // Group records by employeeId
      const attendanceByEmployee = new Map<string, any[]>();
      allRecords.forEach(r => {
        let list = attendanceByEmployee.get(r.employeeId);
        if (!list) {
          list = [];
          attendanceByEmployee.set(r.employeeId, list);
        }
        list.push(r);
      });

      // 3. Fetch all approved leaves for the month for ALL employees
      const allApprovedLeaves = await this.leaveRequestRepository.find({
        where: {
          status: LeaveRequestStatus.APPROVED,
          fromDate: LessThanOrEqual(monthEnd.toISOString().split('T')[0]),
          toDate: MoreThanOrEqual(monthStart.toISOString().split('T')[0])
        }
      });

      const leavesByEmployee = new Map<string, any[]>();
      allApprovedLeaves.forEach(l => {
        let list = leavesByEmployee.get(l.employeeId);
        if (!list) {
          list = [];
          leavesByEmployee.set(l.employeeId, list);
        }
        list.push(l);
      });

      // 4. Global holidays
      const yearHolidays = await this.masterHolidayService.findAll();
      const toLocalYMD = (dateInput: Date | string) => {
        const date = new Date(dateInput);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      const holidayDates = new Set(yearHolidays.map(h => toLocalYMD(h.date || (h as any).holidayDate)));

      const results = {};
      const isFutureMonth = monthStart.getTime() > today.getTime();

      for (const emp of employees) {
        const empId = emp.employeeId;
        const empRecords = attendanceByEmployee.get(empId) || [];
        const empLeaves = leavesByEmployee.get(empId) || [];

        // Week Hours
        const totalWeekHours = empRecords
          .filter(r => {
            const d = new Date(r.workingDate);
            return d >= weekStart && d <= weekEnd;
          })
          .reduce((acc, curr) => acc + Number(curr.totalHours || 0), 0);

        // Monthly Hours
        const totalMonthlyHours = empRecords
          .filter(r => {
            const d = new Date(r.workingDate);
            return d >= monthStart && d <= monthEnd;
          })
          .reduce((acc, curr) => acc + Number(curr.totalHours || 0), 0);

        // Pending Updates (Gaps)
        const filledStatuses = [
          AttendanceStatus.FULL_DAY,
          AttendanceStatus.HALF_DAY,
          WorkLocation.WORK_FROM_HOME,
          WorkLocation.WFH,
          WorkLocation.CLIENT_VISIT,
          WorkLocation.PRESENT,
          AttendanceStatus.LEAVE,
          AttendanceStatus.ABSENT,
          'On Leave'
        ];

        const existingAttendanceDates = new Set(
          empRecords
            .filter(r => r.status && filledStatuses.includes(r.status))
            .map(r => toLocalYMD(r.workingDate))
        );

        let pendingUpdates = 0;
        let loopDate = new Date(monthStart);

        while (loopDate <= pendingLimitDate) {
          if (loopDate > today) break;
          const dateStr = toLocalYMD(loopDate);

          const isWeekend = this.masterHolidayService.isWeekend(loopDate);
          const isHoliday = holidayDates.has(dateStr);
          const hasAttendance = existingAttendanceDates.has(dateStr);
          const hasLeave = empLeaves.some(l => {
            const lStartStr = toLocalYMD(l.fromDate);
            const lEndStr = toLocalYMD(l.toDate);
            return dateStr >= lStartStr && dateStr <= lEndStr;
          });

          if (!isWeekend && !isHoliday && !hasAttendance && !hasLeave) {
            pendingUpdates++;
          }
          loopDate.setDate(loopDate.getDate() + 1);
        }

        results[empId] = {
          totalWeekHours: parseFloat(Number(totalWeekHours).toFixed(1)),
          totalMonthlyHours: parseFloat(Number(totalMonthlyHours).toFixed(1)),
          pendingUpdates,
          monthStatus: emp.monthStatus || MonthStatus.PENDING,
        };
      }
      return results;
    } catch (error) {
      this.logger.error(`Error fetching all dashboard stats: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch all dashboard statistics: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  async generateMonthlyReport(month: number, year: number, managerName?: string, managerId?: string): Promise<Buffer> {
    this.logger.log(`Generating monthly report for ${month}/${year}. Filter Manager: ${managerName || 'None'}`);
    try {
      // 1. Fetch employees (filtered by manager if provided)
      // We want all active employees for Admin, but only mapped employees (and themselves) for Manager
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee');

      if (managerName || managerId) {
        query.andWhere('employee.userStatus = :userStatus', { userStatus: UserStatus.ACTIVE });
        query.leftJoin(
          ManagerMapping,
          'mm',
          'mm.employeeId = employee.employeeId',
        );
        query.andWhere(
          '( (mm.status = :mappingStatus AND (mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)) OR (employee.employeeId = :exactManagerId OR employee.fullName = :exactManagerName) )',
          {
            managerNameQuery: `%${managerName}%`,
            managerIdQuery: `%${managerId}%`,
            exactManagerId: managerId,
            exactManagerName: managerName,
            mappingStatus: ManagerMappingStatus.ACTIVE,
          },
        );
      }

      query.orderBy('employee.fullName', 'ASC');
      const employees = await query.getMany();

      // 2. Fetch all holidays and weekends (metadata)
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const daysInMonth = endDate.getDate();

      const holidays = await this.masterHolidayService.findAll();
      const holidayMap = new Map<string, string>(); // Date -> Name
      holidays.forEach(h => {
        const d = h.holidayDate || (h as any).date;
        const dateObj = new Date(d);
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        holidayMap.set(key, (h as any).name || AttendanceStatus.HOLIDAY);
      });

      // 3. Fetch all attendance for the month for the selected employees
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const employeeIds = employees.map(e => e.employeeId);

      const attendanceQuery = this.employeeAttendanceRepository.createQueryBuilder('attendance')
        .where('attendance.workingDate BETWEEN :start AND :end', {
          start: new Date(startStr + 'T00:00:00'),
          end: new Date(endStr + 'T23:59:59')
        });

      if (employeeIds.length > 0) {
        attendanceQuery.andWhere('attendance.employeeId IN (:...employeeIds)', { employeeIds });
      }

      const allAttendance = await attendanceQuery.getMany();

      // Helper function to normalize dates to YYYY-MM-DD format
      const normalizeDate = (date: Date | string): string => {
        const d = date instanceof Date ? date : new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      // Map attendance: EmployeeID -> DateString -> Record
      const attendanceMap = new Map<string, Map<string, EmployeeAttendance>>();

      allAttendance.forEach(record => {
        if (!attendanceMap.has(record.employeeId)) {
          attendanceMap.set(record.employeeId, new Map());
        }
        const dateKey = normalizeDate(record.workingDate);
        const empMap = attendanceMap.get(record.employeeId);
        if (empMap) {
          empMap.set(dateKey, record);
        }
      });

      // 4. Create Workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`Attendance - ${month}-${year}`);

      // --- Header Construction ---
      // Row 1: Title
      // Row 2: Date
      // Row 3: Day Name

      const headerFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '92D050' } // Light Green for Headers
      };

      const weekendFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'ED3E3E' } // Red for Weekends
      };

      const leaveFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'ED3E3E' } // Light Red for Leave
      };

      const fullDayFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '90EE90' } // Light Green for Full Day Office
      };

      const wfhFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'ADD8E6' } // Light Blue for WFH
      };

      const cvFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFA07A' } // Orange for Client Visit
      };

      const halfDayFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE0' } // Light Yellow for Half Day
      };

      const absentFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'ED3E3E' } // red
      };

      const yellowFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF00' } // Yellow for Not Updated
      };

      const blueFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'ADD8E6' } // Light Blue for Holiday
      };

      // Construct columns
      const columns = ['Name']; // First column
      const dateHeaders = [''];
      const dayHeaders = ['Name'];

      const dateKeys: string[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month - 1, day);
        // Fix: Manual string construction to avoid UTC timezone shift
        const y = year;
        const m = String(month).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;

        dateKeys.push(dateKey);

        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const dayNum = `${day}-${dateObj.toLocaleDateString('en-US', { month: 'short' })}`; // e.g., 1-Jan

        dateHeaders.push(dayNum);
        dayHeaders.push(dayName);
      }

      // Add Header Rows
      const titleRow = sheet.addRow([`ATTENDANCE - ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`]);
      sheet.mergeCells(1, 1, 1, daysInMonth + 1);
      titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.getCell(1).font = { bold: true, size: 14 };
      titleRow.getCell(1).fill = headerFill;

      const dateRow = sheet.addRow(dateHeaders); // Row 2
      // Style Date Row (Light Green)
      dateRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) { // Skip "Name" column
          cell.fill = headerFill;
          cell.alignment = { horizontal: 'center' };
          cell.font = { bold: true };
        }
      });

      const dayRow = sheet.addRow(dayHeaders); // Row 3
      // Style Day Row
      dayRow.eachCell((cell, colNumber) => {
        if (colNumber === 1) {
          cell.fill = headerFill; // Match other headers (Green) instead of Yellow
          cell.font = { bold: true };
        } else {
          // Check if weekend based on header text? Easier to check date logic again
          const dayIndex = colNumber - 2; // array index
          const dateObj = new Date(year, month - 1, dayIndex + 1);
          // Fix manual key
          const m = String(month).padStart(2, '0');
          const d = String(dayIndex + 1).padStart(2, '0');
          const dateKey = `${year}-${m}-${d}`;

          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6; // Sun=0, Sat=6
          const holidayName = holidayMap.get(dateKey);

          if (holidayName) {
            cell.fill = blueFill;
            cell.font = { color: { argb: '000000' } }; // Black Text
          } else if (isWeekend) {
            cell.fill = weekendFill;
            cell.font = { color: { argb: 'FFFFFFFF' } }; // White Text
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0' } }; // Light yellow/white
          }
          cell.alignment = { horizontal: 'center' };
        }
      });


      // --- Data Rows ---
      for (const employee of employees) {
        // Initialize row with name first
        const employeeName = employee.fullName || employee.employeeId || 'Unknown';
        const row = sheet.addRow([employeeName]);

        // Style the name cell (column 1)
        const nameCell = row.getCell(1);
        // nameCell.fill = yellowFill; // Removed per user request
        nameCell.font = { bold: true };
        nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
        nameCell.value = employeeName; // Ensure value is set

        // Loop through days
        for (let i = 0; i < daysInMonth; i++) {
          const dateKey = dateKeys[i];
          const dateObj = new Date(dateKey + 'T00:00:00'); // Ensure proper date parsing
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
          const holidayName = holidayMap.get(dateKey);
          const isHoliday = !!holidayName;

          const cell = row.getCell(i + 2); // +2 because 1-based and 1st col is Name

          const empAttendanceMap = attendanceMap.get(employee.employeeId);
          const record = empAttendanceMap?.get(dateKey);

          // PRIORITY 1: Holiday (Check first, overrides everything)
          if (isHoliday) {
            cell.value = holidayName;
            cell.fill = blueFill;
            cell.alignment = { horizontal: 'center', wrapText: true }; // Wrap text for long holiday names
            cell.font = { size: 10 }; // Slightly smaller for names
            continue;
          }

          // PRIORITY 2: Strict Sunday Rule (Even if worked, Excel shows Weekend as per requirement)
          if (dateObj.getDay() === 0) { // 0 = Sunday
            cell.fill = weekendFill;
            cell.value = AttendanceStatus.WEEKEND;
            cell.font = { color: { argb: 'FFFFFFFF' } }; // White text
            cell.alignment = { horizontal: 'center' };
            continue;
          }

          // PRIORITY 3: Saturday Logic (Show Status ONLY if totalHours > 0)
          if (dateObj.getDay() === 6) { // 6 = Saturday
            // Check if valid work
            const hasWork = record && (record.totalHours !== null && record.totalHours > 0);

            if (!hasWork) {
              // No work on Saturday -> Show Weekend
              cell.fill = weekendFill;
              cell.value = AttendanceStatus.WEEKEND;
              cell.font = { color: { argb: 'FFFFFFFF' } }; // White text
              cell.alignment = { horizontal: 'center' };
              continue;
            }
            // If hasWork, fall through to "Record Exists" logic below (which will display Present/etc)
          }

          // PRIORITY 4: Record Exists (User filled timesheet)
          // Handles Weekdays AND worked Saturdays
          if (record) {
            let text = '';
            let cellFill: ExcelJS.Fill | undefined;
            let fontColor = '000000'; // Black default

            const getHalfText = (half: string | null): string => {
              if (!half) return AttendanceStatus.ABSENT;
              if (this.isActivity(half, WorkLocation.CLIENT_VISIT.toLowerCase())) return WorkLocation.CLIENT_VISIT;
              if (this.isActivity(half, WorkLocation.WFH.toLowerCase()) || this.isActivity(half, WorkLocation.WORK_FROM_HOME.toLowerCase())) return WorkLocation.WFH;
              if (this.isActivity(half, WorkLocation.OFFICE.toLowerCase())) return WorkLocation.OFFICE;
              if (half === AttendanceStatus.LEAVE) return AttendanceStatus.LEAVE;
              if (half === AttendanceStatus.ABSENT) return AttendanceStatus.ABSENT;
              return half;
            };

            // 1. Handle Full Day statuses
            if (record.status === AttendanceStatus.FULL_DAY) {
              const h1 = getHalfText(record.firstHalf);
              const h2 = getHalfText(record.secondHalf);

              if (h1 === h2) {
                if (h1 === WorkLocation.WFH) {
                  text = WorkLocation.WFH;
                  cellFill = wfhFill;
                } else if (h1 === WorkLocation.CLIENT_VISIT) {
                  text = WorkLocation.CLIENT_VISIT;
                  cellFill = cvFill;
                } else {
                  text = AttendanceStatus.FULL_DAY;
                  cellFill = fullDayFill;
                }
              } else {
                // Mixed Full Day (e.g., CV / WFH)
                text = `${h1} / ${h2}`;
                cellFill = halfDayFill;
              }
            }
            // 2. Handle Half Day combinations
            else if (record.status === AttendanceStatus.HALF_DAY) {
              const h1 = getHalfText(record.firstHalf);
              const h2 = getHalfText(record.secondHalf);
              text = `${h1} / ${h2}`;
              cellFill = halfDayFill;
            }
            // 3. Handle specific single statuses
            else if (record.status === AttendanceStatus.LEAVE) {
              text = AttendanceStatus.LEAVE;
              cellFill = leaveFill;
            } else if (record.status === AttendanceStatus.ABSENT) {
              text = AttendanceStatus.ABSENT;
              cellFill = absentFill;
              fontColor = 'FFFFFF'; // White text on red background
            } else if (!record.status || record.status === AttendanceStatus.NOT_UPDATED || record.status === AttendanceStatus.PENDING) {
              // Null or not-yet-updated status -> show Not Updated (do not show as Present)
              text = AttendanceStatus.NOT_UPDATED;
              cellFill = yellowFill;
            } else {
              // Other statuses (e.g. Weekend, Holiday, or any string) show as-is; only use Present if clearly full day
              text = record.status;
              cellFill = fullDayFill;
            }

            cell.value = text;
            if (cellFill) cell.fill = cellFill;
            cell.font = { color: { argb: fontColor } };
            cell.alignment = { horizontal: 'center' };
            continue;
          }

          // PRIORITY 4: Future / Past Logic - for weekdays with no record
          const today = new Date().toISOString().split('T')[0];

          if (dateKey > today) {
            // Future -> "Upcoming"
            cell.value = AttendanceStatus.UPCOMING;
            cell.font = { italic: true, color: { argb: '808080' } }; // Grey
            cell.alignment = { horizontal: 'center' };
          } else {
            // Past/Today weekday with NO record -> "Not Updated"
            cell.value = AttendanceStatus.NOT_UPDATED;
            cell.fill = yellowFill; // Light Orange/Yellow
            cell.alignment = { horizontal: 'center' };
          }
        }
      }

      // Auto-fit columns
      sheet.columns.forEach(column => {
        column.width = 15;
      });
      sheet.getColumn(1).width = 25; // Name column wider

      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error(`Error generating monthly report for ${month}/${year}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to generate monthly report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async generateIndividualPdfReport(employeeId: string, startDate: Date, endDate: Date): Promise<Buffer> {
    this.logger.log(`Generating individual PDF report for employee: ${employeeId} from ${startDate} to ${endDate}`);
    try {
      // 1. Fetch Employee Details
      const employee = await this.employeeDetailsRepository.findOne({ where: { employeeId } });
      if (!employee) throw new NotFoundException(`Employee with ID ${employeeId} not found`);

      // 2. Fetch Attendance Records for the range
      const attendanceRecords = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(startDate, endDate)
        },
        order: { workingDate: 'ASC' }
      });

      // 3. Fetch Holidays
      const holidays = await this.masterHolidayService.findAll();
      const holidayMap = new Map<string, string>();
      holidays.forEach(h => {
        const d = h.holidayDate || (h as any).date;
        if (d) {
          const dateKey = new Date(d).toISOString().split('T')[0];
          holidayMap.set(dateKey, (h as any).name || (h as any).holidayName || AttendanceStatus.HOLIDAY);
        }
      });

      if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid start date provided for PDF report');
      }
      if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid end date provided for PDF report');
      }

      // 4. Generate PDF
      return new Promise((resolve, reject) => {
        try {
          this.logger.log(`Starting PDF generation for employee ${employeeId}`);
          this.logger.log(`Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
          this.logger.log(`Found ${attendanceRecords.length} attendance records and ${holidayMap.size} holidays`);

          const doc = new PDFDocument({ margin: 50 });
          const buffers: Buffer[] = [];

          doc.on('data', (chunk) => buffers.push(chunk));
          doc.on('end', () => {
            this.logger.log(`PDF generation stream ended for employee ${employeeId}`);
            resolve(Buffer.concat(buffers));
          });

          doc.on('error', (err) => {
            this.logger.error(`Stream error during PDF generation for ${employeeId}: ${err.message}`, err.stack);
            reject(err);
          });

          const blueColor = "#2B3674";
          const grayColor = "#505050";
          const lightGrayColor = "#EEEEEE";
          const borderColor = "#CCCCCC";

          // Header Area (Blue Banner)
          doc.fillColor(blueColor).rect(0, 0, 612, 100).fill();

          // Logo or Text Fallback
          const logoPath = path.join(__dirname, '..', '..', 'assets', 'inventech-logo.jpg');
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 25, { width: 120 });
          } else {
            doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('INVENTECH', 50, 30);
            doc.fontSize(10).font('Helvetica').text('Info Solutions Pvt. Ltd.', 50, 60);
          }

          // Report Title
          doc.fillColor('white').fontSize(16).font('Helvetica-Bold').text('TIMESHEET REPORT', 350, 40, { align: 'right', width: 212 });

          // Employee Details
          doc.fillColor(blueColor).fontSize(11).font('Helvetica-Bold').text('EMPLOYEE DETAILS', 50, 120);
          doc.strokeColor(borderColor).lineWidth(1).moveTo(50, 133).lineTo(562, 133).stroke();

          doc.fillColor(grayColor).fontSize(10).font('Helvetica').text('Name:', 50, 150);
          doc.fillColor(blueColor).font('Helvetica-Bold').text(employee.fullName || 'N/A', 130, 150);

          doc.fillColor(grayColor).font('Helvetica').text('Department:', 320, 150);
          doc.fillColor(blueColor).font('Helvetica-Bold').text(employee.department || 'N/A', 410, 150, { width: 160 });

          doc.fillColor(grayColor).font('Helvetica').text('Employee ID:', 50, 168);
          doc.fillColor(blueColor).font('Helvetica-Bold').text(employeeId, 130, 168);

          doc.fillColor(grayColor).font('Helvetica').text('Designation:', 320, 168);
          doc.fillColor(blueColor).font('Helvetica-Bold').text(employee.designation || 'N/A', 410, 168, { width: 160 });

          doc.fillColor(blueColor).fontSize(10).font('Helvetica-Bold').text(`Period: ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, 50, 195);

          let currentY = 220;
          let totalGrandHours = 0;

          // Group records by month
          const months: { month: number, year: number, name: string, days: any[] }[] = [];
          let tempDate = new Date(startDate);
          while (tempDate <= endDate) {
            const m = tempDate.getMonth();
            const y = tempDate.getFullYear();
            const monthName = tempDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

            let monthObj = months.find(item => item.month === m && item.year === y);
            if (!monthObj) {
              monthObj = { month: m, year: y, name: monthName, days: [] };
              months.push(monthObj);
            }

            const dateKey = tempDate.toISOString().split('T')[0];
            const record = attendanceRecords.find(r => new Date(r.workingDate).toISOString().split('T')[0] === dateKey);
            const dayName = tempDate.toLocaleDateString('en-US', { weekday: 'long' });
            const holiday = holidayMap.get(dateKey);

            let status = '';
            let hours = 0;
            let originalStatus = record?.status;

            if (record) {
              const getHalfCode = (half: string | null) => {
                if (!half) return '';
                if (this.isActivity(half, WorkLocation.OFFICE.toLowerCase())) return WorkLocation.OFFICE;
                if (this.isActivity(half, WorkLocation.WFH.toLowerCase()) || this.isActivity(half, WorkLocation.WORK_FROM_HOME.toLowerCase())) return WorkLocation.WFH;
                if (this.isActivity(half, WorkLocation.CLIENT_VISIT.toLowerCase())) return WorkLocation.CLIENT_VISIT;
                if (half === AttendanceStatus.LEAVE || half === AttendanceStatus.LEAVE) return AttendanceStatus.LEAVE;
                if (half === AttendanceStatus.ABSENT || half === AttendanceStatus.ABSENT) return AttendanceStatus.ABSENT;
                return half;
              };

              const h1 = getHalfCode(record.firstHalf);
              const h2 = getHalfCode(record.secondHalf);

              if (h1 && h2) {
                if (h1 === WorkLocation.OFFICE && h2 === WorkLocation.OFFICE) {
                  status = AttendanceStatus.FULL_DAY;
                } else if (h1 === h2) {
                  status = h1;
                } else {
                  status = `${h1} / ${h2}`;
                }
              } else {
                const s = record.status;
                if (tempDate > new Date()) {
                  status = AttendanceStatus.UPCOMING;
                } else if (!s || s === AttendanceStatus.NOT_UPDATED || s === AttendanceStatus.PENDING) {
                  status = AttendanceStatus.NOT_UPDATED.toUpperCase();
                } else {
                  status = s;
                }
              }
              hours = Number(record.totalHours || 0);
            } else if (holiday) {
              status = holiday.toUpperCase();
            } else if (tempDate.getDay() === 0 || tempDate.getDay() === 6) {
              status = AttendanceStatus.WEEKEND.toUpperCase();
            } else if (tempDate > new Date()) {
              status = AttendanceStatus.UPCOMING;
            } else {
              status = AttendanceStatus.NOT_UPDATED.toUpperCase();
            }

            monthObj.days.push({
              date: new Date(tempDate),
              dateStr: tempDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              day: dayName,
              hours,
              status,
              originalStatus
            });

            tempDate.setDate(tempDate.getDate() + 1);
          }

          // Render each month
          months.forEach((monthObj, mIndex) => {
            if (mIndex > 0) {
              doc.addPage();
              currentY = 50;
            }

            doc.fillColor(blueColor).fontSize(11).font('Helvetica-Bold').text(monthObj.name, 50, currentY);
            currentY += 20;

            // Table Header
            doc.fillColor(blueColor).rect(50, currentY, 512, 20).fill();
            doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
            doc.text('Date', 60, currentY + 5);
            doc.text('Day', 150, currentY + 5);
            doc.text('Total Hours', 270, currentY + 5);
            doc.text('Status', 380, currentY + 5);
            currentY += 25;

            let monthlyFullDays = 0;
            let monthlyHalfDays = 0;
            let monthlyLeaves = 0;
            let monthlyNotUpdated = 0;
            let monthlyTotalHours = 0;

            monthObj.days.forEach(day => {
              if (currentY > 720) {
                doc.addPage();
                currentY = 50;
                // Redraw Header on new page if within same month? 
                // For simplicity, just continue
              }

              doc.fillColor('#333333').fontSize(9).font('Helvetica');
              doc.text(day.dateStr, 60, currentY);
              doc.text(day.day, 150, currentY);
              doc.text(day.hours > 0 ? day.hours.toFixed(1) : '--', 270, currentY);
              doc.text(day.status, 380, currentY);

              // Summarize
              monthlyTotalHours += day.hours;
              if (day.originalStatus === AttendanceStatus.FULL_DAY || day.status === AttendanceStatus.FULL_DAY) monthlyFullDays++;
              else if (day.originalStatus === AttendanceStatus.HALF_DAY || day.status === AttendanceStatus.HALF_DAY) monthlyHalfDays++;
              else if (day.originalStatus === AttendanceStatus.LEAVE || day.status === AttendanceStatus.LEAVE || day.status === AttendanceStatus.HOLIDAY) {
                // Option to count holiday as leave? Usually not, but following user logic
              }

              if (day.status === AttendanceStatus.NOT_UPDATED.toUpperCase()) monthlyNotUpdated++;
              if (day.status === AttendanceStatus.LEAVE || day.originalStatus === AttendanceStatus.LEAVE) monthlyLeaves++;

              currentY += 18;
              doc.strokeColor(lightGrayColor).lineWidth(0.5).moveTo(50, currentY - 2).lineTo(562, currentY - 2).stroke();
            });

            totalGrandHours += monthlyTotalHours;

            // Monthly Summary Box
            currentY += 10;
            if (currentY > 720) {
              doc.addPage();
              currentY = 50;
            }

            doc.fillColor('#F8F9FA').rect(50, currentY, 512, 25).fill();
            doc.strokeColor(borderColor).lineWidth(0.5).rect(50, currentY, 512, 25).stroke();

            doc.fillColor(blueColor).fontSize(9).font('Helvetica-Bold');
            const summaryText = `Full Days: ${monthlyFullDays}    Half Days: ${monthlyHalfDays}    Leaves: ${monthlyLeaves}    Not Updated: ${monthlyNotUpdated}    Total Hours: ${monthlyTotalHours.toFixed(1)}`;
            doc.text(summaryText, 60, currentY + 8);

            currentY += 45;
          });

          // Grand Total
          if (currentY > 750) {
            doc.addPage();
            currentY = 50;
          }

          doc.fillColor('#F0F2F8').rect(50, currentY, 512, 30).fill();
          doc.fillColor(blueColor).fontSize(11).font('Helvetica-Bold').text(`GRAND TOTAL HOURS: ${totalGrandHours.toFixed(1)}`, 60, currentY + 10);

          doc.end();
        } catch (err) {
          this.logger.error(`Synchronous error during PDF setup for employee ${employeeId}: ${err.message}`, err.stack);
          reject(err);
        }
      });
    } catch (error) {
      this.logger.error(`Error generating individual PDF report for ${employeeId}: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to generate individual PDF report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
