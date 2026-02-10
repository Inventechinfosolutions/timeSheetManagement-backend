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
// import { Between, Repository } from 'typeorm';
// import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
// import { AttendanceStatus } from '../enums/attendance-status.enum';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { AttendanceStatus } from '../enums/attendance-status.enum';
import { WorkLocation } from '../enums/work-location.enum';
import { LeaveRequest } from '../entities/leave-request.entity';
// import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmployeeAttendanceDto } from '../dto/employeeAttendance.dto';
import { MasterHolidayService } from '../../master/service/master-holiday.service';
import { TimesheetBlockerService } from './timesheetBlocker.service';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import * as ExcelJS from 'exceljs';

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
  ) {}

    async create(createEmployeeAttendanceDto: EmployeeAttendanceDto, isAdmin: boolean = false, isManager: boolean = false): Promise<EmployeeAttendance | null> {
    const METHOD = 'create';
    this.logger.log(`[${METHOD}] Started creating attendance for employee: ${createEmployeeAttendanceDto.employeeId} on ${createEmployeeAttendanceDto.workingDate}`);

    try {
      // STEP 1: Validations
      this.logger.debug(`[${METHOD}][STEP 1] Validating request (Locked month, Blockers)...`);
      
      if (!isAdmin && !isManager && createEmployeeAttendanceDto.workingDate && 
          !this.isEditableMonth(new Date(createEmployeeAttendanceDto.workingDate))) {
          this.logger.warn(`[${METHOD}][STEP 1] Attendance locked for month of ${createEmployeeAttendanceDto.workingDate}`);
          throw new BadRequestException('Attendance for this month is locked.');
      }

      const workingDateObj = new Date(createEmployeeAttendanceDto.workingDate);
      const today = new Date();
      today.setHours(0,0,0,0);
      workingDateObj.setHours(0,0,0,0);

      // (Moved future check down)

      if (!isAdmin && createEmployeeAttendanceDto.employeeId && createEmployeeAttendanceDto.workingDate) {
        const blocker = await this.blockerService.isBlocked(
          createEmployeeAttendanceDto.employeeId, 
          createEmployeeAttendanceDto.workingDate
        );
        if (blocker) {
          const blockedByName = blocker.blockedBy || 'Administrator';
          this.logger.warn(`[${METHOD}][STEP 1] Date blocked by ${blockedByName}`);
          throw new BadRequestException(`Timesheet is locked for this date by ${blockedByName}. Please contact them to unlock.`);
        }
      }

      // STEP 2: Check Existing Record & Future cleanup
      this.logger.debug(`[${METHOD}][STEP 2] Checking for existing records...`);
      const startOfDay = new Date(createEmployeeAttendanceDto.workingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(createEmployeeAttendanceDto.workingDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingRecord = await this.employeeAttendanceRepository.findOne({
        where: {
          employeeId: createEmployeeAttendanceDto.employeeId,
          workingDate: Between(startOfDay, endOfDay),
        },
      });

      // Rule: Do not create future records with 0 hours, UNLESS status or workLocation is provided.
      // Only apply this checks if NO existing record exists. If record exists, we might intend to update/clear it.
      if (!existingRecord && !createEmployeeAttendanceDto.status && !createEmployeeAttendanceDto.workLocation && (!createEmployeeAttendanceDto.totalHours || createEmployeeAttendanceDto.totalHours === 0) && workingDateObj > today) {
         this.logger.debug(`[${METHOD}][STEP 2] Skipping empty future record creation`);
         return null; 
      }

      // STEP 3: Handle Existing Record (Update vs Skip based on Priority)
      if (existingRecord) {
        this.logger.debug(`[${METHOD}][STEP 3] Existing record found. ID: ${existingRecord.id}. Checking priority...`);
        
        // Priority Hierarchy: Leave (3) > Client Visit (2) > Work From Home / Office (1)
        const existingPriority = this.getPriority(existingRecord.status, existingRecord.workLocation);
        const incomingPriority = this.getPriority(createEmployeeAttendanceDto.status || null, createEmployeeAttendanceDto.workLocation || null);

        // Rule: Only overwrite if incoming priority is GREATER THAN OR EQUAL to existing priority
        // Exception: Always allow updates if the incoming update is from an Admin or Manager, or is explicitly clearing the status
        // Also, if status/location are NOT provided (undefined), we are not changing them, so ignore priority check.
        const isStatusOrLocationProvided = createEmployeeAttendanceDto.status !== undefined || createEmployeeAttendanceDto.workLocation !== undefined;

        if (isStatusOrLocationProvided && incomingPriority < existingPriority && !isAdmin && !isManager && createEmployeeAttendanceDto.status !== null && createEmployeeAttendanceDto.workLocation !== null) {
          this.logger.warn(`[${METHOD}][STEP 3] Priority check failed. Existing: ${existingPriority}, Incoming: ${incomingPriority}. Ignoring update.`);
          return existingRecord;
        }
        
        // Update existing record
        this.logger.debug(`[${METHOD}][STEP 3] Updating existing record...`);
        Object.assign(existingRecord, createEmployeeAttendanceDto);
        if (
          !createEmployeeAttendanceDto.status &&
          existingRecord.totalHours !== undefined &&
          existingRecord.totalHours !== null
        ) {
          existingRecord.status = await this.determineStatus(
            existingRecord.totalHours,
            existingRecord.workingDate,
            existingRecord.workLocation || undefined,
          );
        }
        const updated = await this.employeeAttendanceRepository.save(existingRecord);
        this.logger.log(`[${METHOD}] Successfully updated existing attendance record ID: ${updated.id}`);
        return updated;
      }

      // STEP 4: Create New Record
      this.logger.debug(`[${METHOD}][STEP 4] Creating new record...`);
      const attendance = this.employeeAttendanceRepository.create(
        createEmployeeAttendanceDto,
      );

      // Only calculate status if NOT provided
      if (
        !attendance.status &&
        attendance.totalHours !== undefined &&
        attendance.totalHours !== null
      ) {
        attendance.status = await this.determineStatus(
          attendance.totalHours,
          attendance.workingDate,
          attendance.workLocation || undefined,
        );
      }

      const saved = await this.employeeAttendanceRepository.save(attendance);
      this.logger.log(`[${METHOD}] Successfully created attendance record ID: ${saved.id}`);
      return saved;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`[${METHOD}] Failed to create attendance: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create attendance: ' + error.message);
    }
  }


  async createBulk(attendanceDtos: EmployeeAttendanceDto[], isAdmin: boolean = false, isManager: boolean = false): Promise<EmployeeAttendance[]> {
    const METHOD = 'createBulk';
    this.logger.log(`[${METHOD}] Started bulk processing of ${attendanceDtos.length} records.`);
    
    const results: EmployeeAttendance[] = [];
    
    // STEP 1: Process Items
    this.logger.debug(`[${METHOD}][STEP 1] processing items...`);
    
    for (const dto of attendanceDtos) {
        try {
            let record;
            if (dto.id) {
                // Update existing
                record = await this.update(dto.id, dto, isAdmin, isManager);
            } else {
                // Create new
                record = await this.create(dto, isAdmin, isManager);
            }
            
            if (record) {
                 results.push(record);
            }
        } catch (error) {
            this.logger.error(`[${METHOD}] Failed to process bulk item for ${dto.workingDate}: ${error.message}`);
        }
    }
    
    this.logger.log(`[${METHOD}] Completed bulk processing. Success: ${results.length}/${attendanceDtos.length}`);
    return results;
  }

  async autoUpdateTimesheet(employeeId: string, month: string, year: string): Promise<any> {
    const METHOD = 'autoUpdateTimesheet';
    this.logger.log(`[${METHOD}] Started auto-update for ${employeeId} - ${month}/${year}`);

    try {
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      const today = new Date();
      
      // Ensure we only auto-update for current month
      if (today.getMonth() + 1 !== monthNum || today.getFullYear() !== yearNum) {
        this.logger.warn(`[${METHOD}] Auto-update blocked: Request for ${month}/${year} is not current month.`);
        throw new BadRequestException('Auto-update is only available for the current month.');
      }

      this.logger.debug(`[${METHOD}] Calculating date range...`);
      const startDate = new Date(yearNum, monthNum - 1, 1, 12, 0, 0); // Noon to avoid timezone boundary issues
      
      // Set endDate to "today" to avoid future updates
      const endDate = new Date(); 
      endDate.setHours(23, 59, 59, 999);
      
      // STEP 1: Fetch External Data (Holidays)
      this.logger.debug(`[${METHOD}][STEP 1] Fetching holidays...`);
      const holidays = await this.masterHolidayService.findAll();
      const holidayDates = new Set(holidays.map(h => {
          // Handle various date formats from dirty data if needed, but usually it's Date or string
          const d = new Date(h.holidayDate || (h as any).date);
          // Normalize to YYYY-MM-DD
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
      }));
      this.logger.debug(`[${METHOD}][STEP 1] Found ${holidayDates.size} holidays.`);

      // STEP 2: Fetch Existing Attendance
      this.logger.debug(`[${METHOD}][STEP 2] Fetching existing attendance records...`);
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

          // Skip if totalHours > 0 (already filled)
          if (r.totalHours && r.totalHours > 0) {
               existingDates.add(dateStr);
               return;
          }
          
          // Skip if Leave or Half Day
          if (r.status === AttendanceStatus.LEAVE || r.status === AttendanceStatus.HALF_DAY) {
               existingDates.add(dateStr);
               return;
          }

          // If here, it is a 0-hour record (likely WFH, Client Visit, or Pending)
          // We want to UPDATE these.
          // We do NOT add to existingDates, so the loop processes this date.
          // But we store it in map to retrieve ID and Location later.
          existingZeroHourRecords.set(dateStr, r);
      });
      this.logger.debug(`[${METHOD}][STEP 2] Found ${existingRecords.length} existing records (${existingZeroHourRecords.size} editable 0-hour records).`);

      // STEP 3: Fetch Approved Leaves
      this.logger.debug(`[${METHOD}][STEP 3] Fetching approved leaves...`);
      const approvedLeaves = await this.leaveRequestRepository.find({
          where: {
              employeeId,
              status: 'Approved',
              fromDate: LessThanOrEqual(endDate.toISOString().split('T')[0]),
              toDate: MoreThanOrEqual(startDate.toISOString().split('T')[0])
          }
      });

      const leaveDates = new Set<string>();
      approvedLeaves.forEach(leave => {
          let current = new Date(leave.fromDate);
          // Start from Noon to avoid timezone shifts
          current.setHours(12, 0, 0, 0); 
          
          const end = new Date(leave.toDate);
          end.setHours(23, 59, 59, 999);

          // Safety break
          let safety = 0;
          while (current <= end && safety < 366) {
              const y = current.getFullYear();
              const m = String(current.getMonth() + 1).padStart(2, '0');
              const d = String(current.getDate()).padStart(2, '0');
              leaveDates.add(`${y}-${m}-${d}`);
              
              current.setDate(current.getDate() + 1);
              safety++;
          }
      });
      this.logger.debug(`[${METHOD}][STEP 3] Found ${leaveDates.size} leave days.`);

      // STEP 4: Generate Records
      this.logger.debug(`[${METHOD}][STEP 4] Generating records for eligible days...`);
      const recordsToCreate: EmployeeAttendanceDto[] = [];
      const updatedDateStrings: string[] = [];
      let currentDate = new Date(startDate);
      
      // Iterate from 1st of month up to today (inclusive)
      while (currentDate <= endDate) {
          // Force local string format for comparison (YYYY-MM-DD)
          const year = currentDate.getFullYear();
          const month = String(currentDate.getMonth() + 1).padStart(2, '0');
          const day = String(currentDate.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          
          // Skip Weekends (Explicit Inline Check)
          // 0 = Sunday, 6 = Saturday
          const dayOfWeek = currentDate.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          // Skip Holidays
          const isHoliday = holidayDates.has(dateStr);

          // Skip COMPLETE Existing Attendance (Hours > 0 or Leave/HalfDay)
          const hasAttendance = existingDates.has(dateStr);

          // Skip Approved Leaves (Full & Half)
          const hasLeave = leaveDates.has(dateStr);

          if (!isWeekend && !isHoliday && !hasAttendance && !hasLeave) {
              const dto = new EmployeeAttendanceDto();
              dto.employeeId = employeeId;
              dto.workingDate = new Date(currentDate); 
              dto.workingDate.setHours(0,0,0,0);
              
              // CHECK FOR EXISTING 0-HOUR RECORD TO UPDATE
              const existingZeroHour = existingZeroHourRecords.get(dateStr);
              if (existingZeroHour) {
                  dto.id = existingZeroHour.id; // Crucial: Triggers UPDATE
                  dto.status = AttendanceStatus.FULL_DAY; 
                  // Restore Work Location to pass priority check (WFH -> WFH)
                  // If it was "WFH", we send "WFH". 
                  // incomingPriority (1) >= existingPriority (1) -> Update Allowed.
                  if (existingZeroHour.workLocation) {
                      dto.workLocation = existingZeroHour.workLocation;
                  }
              } else {
                   dto.status = AttendanceStatus.FULL_DAY;
                   // Default location logic if needed, but usually null implies regular Office/Unknown
              }
              
              dto.totalHours = 9;
              recordsToCreate.push(dto);
              updatedDateStrings.push(dateStr);
          }

          // Increment day
          currentDate.setDate(currentDate.getDate() + 1);
      }

      if (recordsToCreate.length === 0) {
          this.logger.log(`[${METHOD}] No eligible days found to update.`);
          return { message: 'No eligible days found to update.', count: 0, updatedDates: [] };
      }

      // STEP 5: Bulk Persist
      this.logger.log(`[${METHOD}][STEP 5] Persisting ${recordsToCreate.length} records...`);
      // We update logic to use createBulk 
      // We rely on the fact we set IDs for existing records to trigger updates
      await this.createBulk(recordsToCreate, false, false);

      this.logger.log(`[${METHOD}] Successfully auto-updated ${recordsToCreate.length} days.`);
      
      return { 
          message: 'Timesheet updated successfully',
          count: recordsToCreate.length,
          updatedDates: updatedDateStrings
      };
    } catch (error) {
       this.logger.error(`[${METHOD}] Auto-update failed: ${error.message}`, error.stack);
       if (error instanceof BadRequestException) throw error;
       throw new BadRequestException('Failed to auto-update timesheet: ' + error.message);
    }
  }

  async findAll(): Promise<EmployeeAttendance[]> {
    const METHOD = 'findAll';
    this.logger.log(`[${METHOD}] Fetching all attendance records`);
    try {
      const records = await this.employeeAttendanceRepository.find();
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch attendance records', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findOne(id: number): Promise<EmployeeAttendance> {
    const METHOD = 'findOne';
    this.logger.log(`[${METHOD}] Fetching attendance ID: ${id}`);
    try {
      const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
      if (!attendance) {
         this.logger.warn(`[${METHOD}] Record ${id} not found`);
         throw new NotFoundException(`Record with ID ${id} not found`);
      }
      return await this.applyStatusBusinessRules(attendance);
    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       if (error instanceof HttpException) throw error;
       throw new HttpException('Failed to fetch attendance record', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

    async update(id: number, updateDto: Partial<EmployeeAttendanceDto>, isAdmin: boolean = false, isManager: boolean = false): Promise<EmployeeAttendance | null> {
    const METHOD = 'update';
    this.logger.log(`[${METHOD}] Started updating attendance ID: ${id}`);

    try {
      // STEP 1: Fetch & Validate
      this.logger.debug(`[${METHOD}][STEP 1] Fetching record and validating permissions...`);
      const attendance = await this.findOne(id);
      
      // BLOCKING LOGIC: If record is auto-generated from an approved Half Day request
      if (attendance.sourceRequestId && !isAdmin && !isManager) {
        this.logger.warn(`[${METHOD}][STEP 1] Update blocked: Record linked to approved Half Day request.`);
        throw new ForbiddenException(
            'This attendance record was auto-generated from an approved Half Day request and cannot be edited by the employee.'
        );
      }

      if (!isAdmin && !isManager && !this.isEditableMonth(new Date(attendance.workingDate))) {
        this.logger.warn(`[${METHOD}][STEP 1] Update blocked: Month is locked.`);
        throw new BadRequestException('Attendance for this month is locked.');
      }

      const workingDateObj = new Date(attendance.workingDate);
      const today = new Date();
      today.setHours(0,0,0,0);
      workingDateObj.setHours(0,0,0,0);

      // STEP 2: Handle Future Deletion Rule
      this.logger.debug(`[${METHOD}][STEP 2] Checking for future record cleanup...`);
      
      // Check if record has workLocation (WFH, Client Visit) - these should never be deleted
      const hasWorkLocation = attendance.workLocation === 'WFH' || 
                             attendance.workLocation === 'Work From Home' || 
                             attendance.workLocation === 'Client Visit' ||
                             updateDto.workLocation === 'WFH' ||
                             updateDto.workLocation === 'Work From Home' ||
                             updateDto.workLocation === 'Client Visit';

      // Rule: Delete future records if hours are cleared AND no workLocation is set
      // But NEVER delete records with workLocation (WFH, Client Visit) - preserve them even with 0 hours
      if ((updateDto.totalHours === 0 || updateDto.totalHours === null) && workingDateObj > today && !hasWorkLocation) {
          this.logger.log(`[${METHOD}][STEP 2] Deleting future record with 0 hours.`);
          await this.employeeAttendanceRepository.delete(id);
          return null;
      }

      // STEP 3: Check Blockers
      if (!isAdmin) {
        this.logger.debug(`[${METHOD}][STEP 3] Checking for blockers...`);
        const blocker = await this.blockerService.isBlocked(
          attendance.employeeId, 
          attendance.workingDate
        );
        if (blocker) {
          const blockedByName = blocker.blockedBy || 'Administrator';
          this.logger.warn(`[${METHOD}][STEP 3] Update blocked by ${blockedByName}`);
          throw new BadRequestException(`Timesheet is locked for this date by ${blockedByName}. Please contact them to unlock.`);
        }
      }

      // STEP 4: Priority Check
      this.logger.debug(`[${METHOD}][STEP 4] Checking priority...`);
      
      // Priority Hierarchy: Leave (3) > Client Visit (2) > Work From Home / Office (1)
      const existingPriority = this.getPriority(attendance.status, attendance.workLocation);
      const incomingPriority = this.getPriority(updateDto.status || null, updateDto.workLocation || null);

      // Rule: Only overwrite if incoming priority is GREATER THAN OR EQUAL to existing priority
      // Exception: Always allow updates if the incoming update is from an Admin or Manager, or is explicitly clearing the status
      // Also, if status/location are NOT provided (undefined), we are not changing them, so ignore priority check.
      const isStatusOrLocationProvided = updateDto.status !== undefined || updateDto.workLocation !== undefined;

      if (isStatusOrLocationProvided && incomingPriority < existingPriority && !isAdmin && !isManager && updateDto.status !== null && updateDto.workLocation !== null) {
        this.logger.warn(`[${METHOD}][STEP 4] Priority check failed. Existing: ${existingPriority}, Incoming: ${incomingPriority}. Ignoring update.`);
        return attendance;
      }

      // STEP 5: Apply Updates & Save
      this.logger.debug(`[${METHOD}][STEP 5] Applying updates and saving...`);
      
      // Preserve workLocation if it exists and updateDto doesn't explicitly change it
      const existingWorkLocation = attendance.workLocation;
      const existingStatus = attendance.status;
      const isLeave = existingStatus === AttendanceStatus.LEAVE;
      
      Object.assign(attendance, updateDto);
      
      // If workLocation was set (WFH, Client Visit) and updateDto doesn't explicitly clear it (undefined), preserve it.
      // Explicit null MEANs clear it.
      if (hasWorkLocation && updateDto.workLocation === undefined) {
        attendance.workLocation = existingWorkLocation; // Preserve original workLocation
      }
      
      // Preserve Leave status if it exists and updateDto doesn't explicitly change it (undefined).
      // Explicit null MEANs clear it.
      if (isLeave && updateDto.status === undefined) {
        attendance.status = existingStatus; // Preserve Leave status
      }
      
      if (attendance.totalHours !== undefined && attendance.totalHours !== null) {
        attendance.status = await this.determineStatus(attendance.totalHours, attendance.workingDate, attendance.workLocation || undefined);
      }
      
      const updated = await this.employeeAttendanceRepository.save(attendance);
      this.logger.log(`[${METHOD}] Successfully updated attendance ID: ${updated.id}`);
      return updated;
      
    } catch (error) {
       this.logger.error(`[${METHOD}] Failed to update attendance: ${error.message}`, error.stack);
       if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
       throw new BadRequestException('Failed to update attendance: ' + error.message);
    }
  }

  private async determineStatus(hours: number, workingDate: Date, workLocation?: string): Promise<AttendanceStatus> {
    const dateObj = new Date(workingDate);
    // Normalize date for comparison: YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Special Rule: WFH and Client Visit should default to NOT_UPDATED if hours are 0
    // This allows the employee to log their hours later.
    if ((workLocation === 'WFH' || workLocation === 'Client Visit') && (hours === 0 || hours === null || hours === undefined)) {
        return AttendanceStatus.NOT_UPDATED;
    }

    if (hours === 0 || hours === null || hours === undefined) {
      // 1. Check Holiday
      const holiday = await this.masterHolidayService.findByDate(dateStr);
      if (holiday) {
        return AttendanceStatus.HOLIDAY;
      }

      // 2. Check Weekend
      if (this.masterHolidayService.isWeekend(dateObj)) {
        return AttendanceStatus.WEEKEND;
      }

      // 3. Weekday with 0 hours
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateObj.setHours(0, 0, 0, 0);
      
      if (dateObj <= today) {
          // Past or Today weekday with 0 hours -> ABSENT (user purposefully didn't update)
          return AttendanceStatus.ABSENT;
      } else {
          // Future weekday -> NOT_UPDATED (Upcoming)
          return AttendanceStatus.NOT_UPDATED;
      }
    } else if (hours >= 6) {
      return AttendanceStatus.FULL_DAY;
    } else {
      return AttendanceStatus.HALF_DAY;
    }
  }

  async findByMonth(month: string, year: string, employeeId: string): Promise<EmployeeAttendance[]> {
    const METHOD = 'findByMonth';
    this.logger.log(`[${METHOD}] Fetching records for employee ${employeeId} for ${month}/${year}`);
    
    try {
      const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

      const records = await this.employeeAttendanceRepository.find({
        where: { employeeId, workingDate: Between(start, end) },
        order: { workingDate: 'ASC' },
      });
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
       this.logger.error(`[${METHOD}] Error fetching records: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch attendance records by month', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findByDate(workingDate: string, employeeId: string): Promise<EmployeeAttendance[]> {
    const METHOD = 'findByDate';
    this.logger.log(`[${METHOD}] Fetching records for employee ${employeeId} on ${workingDate}`);
    try {
      const records = await this.employeeAttendanceRepository.find({
        where: { 
          employeeId, 
          workingDate: Between(new Date(`${workingDate}T00:00:00`), new Date(`${workingDate}T23:59:59`)) 
        },
      });
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
       this.logger.error(`[${METHOD}] Error fetching records: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch attendance records by date', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findByDateRange(employeeId: string, startDate: string, endDate: string): Promise<EmployeeAttendance[]> {
    const METHOD = 'findByDateRange';
    this.logger.log(`[${METHOD}] Fetching records for employee ${employeeId} from ${startDate} to ${endDate}`);
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
       this.logger.error(`[${METHOD}] Error fetching records: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch attendance records by date range', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findWorkedDays(employeeId: string, startDate: string, endDate: string): Promise<any[]> {
    const METHOD = 'findWorkedDays';
    this.logger.log(`[${METHOD}] Fetching worked days for ${employeeId} from ${startDate} to ${endDate}`);
    
    try {
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T23:59:59`);
      
      const results = await this.employeeAttendanceRepository
        .createQueryBuilder('attendance')
        .select(['attendance.workingDate', 'attendance.status', 'attendance.totalHours']) // Changed 'hours' to 'totalHours'
        .where('attendance.employeeId = :employeeId', { employeeId })
        .andWhere('attendance.workingDate BETWEEN :start AND :end', { start, end })
        .andWhere('attendance.status NOT IN (:...excludedStatuses)', {
          excludedStatuses: ['Absent', 'HOLIDAY', 'WEEKEND'], // Changed 'Weekly Off' to 'WEEKEND' to match enum
        })
        .getMany();

      this.logger.log(`[${METHOD}] Found ${results.length} worked days`);
      return results;
    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch worked days', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

    async remove(id: number, isAdmin: boolean = false, isManager: boolean = false): Promise<void> {
    const METHOD = 'remove';
    this.logger.log(`[${METHOD}] Started deleting attendance ID: ${id}`);

    try {
      // STEP 1: Validation (Locked Month)
      this.logger.debug(`[${METHOD}][STEP 1] Validating deletion request...`);
      const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
      
      if (attendance && !isAdmin && !isManager && !this.isEditableMonth(new Date(attendance.workingDate))) {
           this.logger.warn(`[${METHOD}][STEP 1] Deletion blocked: Month is locked.`);
           throw new BadRequestException('Cannot delete locked attendance records.');
      }

      // STEP 2: Delete Record
      this.logger.debug(`[${METHOD}][STEP 2] Removing record from database...`);
      const result = await this.employeeAttendanceRepository.delete(id);
      
      if (result.affected === 0) {
        this.logger.warn(`[${METHOD}][STEP 2] Record with ID ${id} not found.`);
        throw new NotFoundException(`Record with ID ${id} not found`);
      }
      
      this.logger.log(`[${METHOD}] Successfully deleted attendance ID: ${id}`);
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to delete attendance: ${error.message}`, error.stack);
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw new BadRequestException('Failed to delete attendance');
    }
  }



  private async applyStatusBusinessRules(attendance: EmployeeAttendance): Promise<EmployeeAttendance> {
    const today = new Date().toISOString().split('T')[0];
    const workingDateObj = new Date(attendance.workingDate);
    const workingDate = workingDateObj.toISOString().split('T')[0];
    
    if (workingDate <= today) {
      if (!attendance.status || attendance.status === AttendanceStatus.NOT_UPDATED) {
        // Priority 1: Check Holiday
        const holiday = await this.masterHolidayService.findByDate(workingDate);
        if (holiday) {
           attendance.status = AttendanceStatus.HOLIDAY;
           return attendance;
        }

        // Priority 2: Check Weekend
        if (this.masterHolidayService.isWeekend(workingDateObj)) {
          attendance.status = AttendanceStatus.WEEKEND;
          return attendance;
        }

        // Priority 3: Check for approved Client Visit or Work From Home request
        const approvedRequest = await this.leaveRequestRepository.findOne({
          where: {
            employeeId: attendance.employeeId,
            requestType: In(['Client Visit', 'Work From Home']),
            status: 'Approved',
            fromDate: LessThanOrEqual(workingDate),
            toDate: MoreThanOrEqual(workingDate),
          },
        });

        if (approvedRequest) {
          // If approved Client Visit or WFH exists, mark as Present (Full Day)
          attendance.status = AttendanceStatus.FULL_DAY;
          return attendance;
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
  }

  private getPriority(status: string | null, location: string | null): number {
    const s = String(status || '').toLowerCase();
    const l = String(location || '').toLowerCase();

    // Leave - Priority 3
    if (status === AttendanceStatus.LEAVE || s === 'leave') return 3;

    // Client Visit - Priority 2
    if (location === WorkLocation.CLIENT_VISIT || l === 'client visit' || l.includes('client') || l.includes('visit')) return 2;

    // WFH / Office - Priority 1 (Equal footing, allowing switch)
    if (
        location === WorkLocation.WFH || 
        location === WorkLocation.WORK_FROM_HOME || 
        l.includes('wfh') || 
        l.includes('home') ||
        location === WorkLocation.OFFICE ||
        l === 'office'
    ) return 1;

    return 0;
  }

  private isEditableMonth(workingDate: Date): boolean {
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
  }

  async getTrends(employeeId: string, endDateStr: string, startDateStr?: string): Promise<any[]> {
    const METHOD = 'getTrends';
    this.logger.log(`[${METHOD}] Fetching trends for ${employeeId}`);

    try {
      const endDate = new Date(`${endDateStr}T23:59:59`);
      let startDate: Date;

      if (startDateStr) {
        startDate = new Date(`${startDateStr}T00:00:00`);
      } else {
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
      }

      this.logger.debug(`[${METHOD}] Querying data between ${startDate.toISOString()} and ${endDate.toISOString()}...`);
      const records = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(startDate, endDate),
        },
        order: { workingDate: 'ASC' },
      });

      this.logger.log(`[${METHOD}] Found ${records.length} records for trends`);
      return records.map(r => ({
        date: r.workingDate,
        hours: r.totalHours, // Changed 'hours' to 'totalHours'
        status: r.status,
      }));
    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch attendance trends', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAllMonthlyDetails(month: string, year: string, managerName?: string, managerId?: string): Promise<EmployeeAttendance[]> {
    const METHOD = 'findAllMonthlyDetails';
    this.logger.log(`[${METHOD}] Fetching details (Month: ${month}, Year: ${year}, Manager: ${managerName || 'All'})`);

    try {
      const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

      this.logger.debug(`[${METHOD}] Building search query...`);
      const query = this.employeeAttendanceRepository
        .createQueryBuilder('attendance')
        .innerJoin(
          EmployeeDetails,
          'ed',
          'ed.employeeId = attendance.employeeId',
        )
        .where('attendance.workingDate BETWEEN :start AND :end', { start, end })
        .andWhere('ed.userStatus = :userStatus', { userStatus: 'ACTIVE' });

      if (managerName || managerId) {
        query.innerJoin(
          ManagerMapping,
          'mm',
          'mm.employeeId = attendance.employeeId',
        );
        query.andWhere(
          '(mm.status = :mappingStatus AND (mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery))',
          {
            managerNameQuery: `%${managerName}%`,
            managerIdQuery: `%${managerId}%`,
            mappingStatus: 'ACTIVE',
          },
        );
      }

      query.orderBy('attendance.workingDate', 'ASC');

      const records = await query.getMany();
      this.logger.log(`[${METHOD}] Successfully found ${records.length} monthly detail records`);
      return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
    } catch (error) {
      this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch monthly attendance details', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  async getDashboardStats(employeeId: string, queryMonth?: string, queryYear?: string) {
    const METHOD = 'getDashboardStats';
    this.logger.log(`[${METHOD}] Fetching stats for ${employeeId} (${queryMonth || 'Now'}/${queryYear || 'Now'})`);

    try {
      const today = new Date();
      const currentMonth = queryMonth ? parseInt(queryMonth) : today.getMonth() + 1;
      const currentYear = queryYear ? parseInt(queryYear) : today.getFullYear();
      
      // 1. Total Week Hours
      this.logger.debug(`[${METHOD}] Calculating week range hours...`);
      const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
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

      const totalWeekHours = weekRecords.reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

      // 2. Total Monthly Hours
      this.logger.debug(`[${METHOD}] Calculating monthly hours...`);
      const monthStart = new Date(currentYear, currentMonth - 1, 1);
      const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

      const monthRecords = await this.employeeAttendanceRepository.find({
        where: {
          employeeId,
          workingDate: Between(monthStart, monthEnd),
        },
      });

      const totalMonthlyHours = monthRecords.reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

      // 3. Pending Updates
      this.logger.debug(`[${METHOD}] Calculating pending updates...`);
      const checkEndDate = new Date(today);
      checkEndDate.setHours(23, 59, 59, 999);
      
      let pendingLimitDate = checkEndDate;
      if (monthEnd < pendingLimitDate) {
          pendingLimitDate = monthEnd;
      }

      let pendingUpdates = 0;

      // Better: Fetch approved leaves for the range
      const leaves = await this.leaveRequestRepository.find({
        where: {
          employeeId,
          status: 'Approved',
          fromDate: Between(monthStart.toISOString().split('T')[0], pendingLimitDate.toISOString().split('T')[0])
        }
      });

      // Helper to avoid timezone shifts when converting to YYYY-MM-DD
      const toLocalYMD = (dateInput: Date | string) => {
          const date = new Date(dateInput);
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
      };

      // Optimization: Create Set of existing attendance dates (string YYYY-MM-DD)
      const existingAttendanceDates = new Set(
          monthRecords.map(r => toLocalYMD(r.workingDate))
      );

      // Optimization: Set of Holidays
      const yearHolidays = await this.masterHolidayService.findAll();
      const holidayDates = new Set(
          yearHolidays.map(h => {
               const d = h.holidayDate || (h as any).date; 
               return toLocalYMD(d);
          })
      );

      const allApprovedLeaves = await this.leaveRequestRepository.find({
          where: {
              employeeId,
              status: 'Approved'
          }
      });

      let loopDate = new Date(monthStart);
      while (loopDate <= pendingLimitDate) {
          if (loopDate > today) break;

          const dateStr = toLocalYMD(loopDate);
          
          const isWeekend = this.masterHolidayService.isWeekend(loopDate);
          const isHoliday = holidayDates.has(dateStr);
          const hasAttendance = existingAttendanceDates.has(dateStr);
          const hasLeave = allApprovedLeaves.some(l => {
               const lStartStr = toLocalYMD(l.fromDate);
               const lEndStr = toLocalYMD(l.toDate);
               return dateStr >= lStartStr && dateStr <= lEndStr;
          });

          if (!isWeekend && !isHoliday && !hasAttendance && !hasLeave) {
              pendingUpdates++;
          }
          
          loopDate.setDate(loopDate.getDate() + 1);
      }

      this.logger.log(`[${METHOD}] Completed calc: WeekHours=${totalWeekHours}, MonthlyHours=${totalMonthlyHours}, Pending=${pendingUpdates}`);
      
      const isFutureMonth = (currentYear > today.getFullYear()) || (currentYear === today.getFullYear() && currentMonth > today.getMonth() + 1);

      return {
        totalWeekHours: parseFloat(totalWeekHours.toFixed(2)),
        totalMonthlyHours: parseFloat(totalMonthlyHours.toFixed(2)),
        pendingUpdates,
        monthStatus: (!isFutureMonth && pendingUpdates === 0) ? 'Completed' : 'Pending',
      };
    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       throw new HttpException('Failed to fetch dashboard stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAllDashboardStats(queryMonth?: string, queryYear?: string, managerName?: string, managerId?: string) {
    const METHOD = 'getAllDashboardStats';
    this.logger.log(`[${METHOD}] Fetching batch stats (Month: ${queryMonth || 'Now'}, Year: ${queryYear || 'Now'}, Manager: ${managerName || 'All'})`);

    try {
      const today = new Date();
      const currentMonth = queryMonth ? parseInt(queryMonth) : today.getMonth() + 1;
      const currentYear = queryYear ? parseInt(queryYear) : today.getFullYear();
      
      this.logger.debug(`[${METHOD}] Calculating date boundaries...`);
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

      const checkEndDate = new Date(today);
      checkEndDate.setHours(23, 59, 59, 999);
      let pendingLimitDate = checkEndDate;
      if (monthEnd < pendingLimitDate) {
          pendingLimitDate = monthEnd;
      }

      // 1. Fetch all employees
      this.logger.debug(`[${METHOD}] STEP 1: Fetching filtered employees...`);
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .select(['employee.employeeId', 'employee.fullName']);

      query.andWhere('employee.userStatus = :userStatus', { userStatus: 'ACTIVE' });

      if (managerName || managerId) {
        query.innerJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId');
        query.andWhere(
          '(mm.status = :mStatus AND (mm.managerName LIKE :mName OR mm.managerId LIKE :mId))',
          {
            mName: `%${managerName}%`,
            mId: `%${managerId}%`,
            mStatus: 'ACTIVE'
          },
        );
      }

      const employees = await query.getMany();
      this.logger.log(`[${METHOD}] Processing ${employees.length} employees`);

      // 2. Fetch all attendance for the range
      this.logger.debug(`[${METHOD}] STEP 2: Fetching attendance batch...`);
      const allRecords = await this.employeeAttendanceRepository.find({
        where: {
          workingDate: Between(fetchStart, fetchEnd),
        },
      });

      const attendanceByEmployee = new Map<string, any[]>();
      allRecords.forEach(r => {
        let list = attendanceByEmployee.get(r.employeeId);
        if (!list) {
          list = [];
          attendanceByEmployee.set(r.employeeId, list);
        }
        list.push(r);
      });

      // 3. Fetch all approved leaves
      this.logger.debug(`[${METHOD}] STEP 3: Fetching leaves batch...`);
      const allApprovedLeaves = await this.leaveRequestRepository.find({
        where: {
          status: 'Approved',
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
      const holidayDates = new Set(yearHolidays.map(h => toLocalYMD(h.holidayDate || (h as any).date)));

      const results = {};
      const isFutureMonth = (currentYear > today.getFullYear()) || (currentYear === today.getFullYear() && currentMonth > today.getMonth() + 1);

      this.logger.debug(`[${METHOD}] STEP 4: Aggregating results...`);
      for (const emp of employees) {
          const empId = emp.employeeId;
          const empRecords = attendanceByEmployee.get(empId) || [];
          const empLeaves = leavesByEmployee.get(empId) || [];

          const totalWeekHours = empRecords
              .filter(r => {
                  const d = new Date(r.workingDate);
                  return d >= weekStart && d <= weekEnd;
              })
              .reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

          const totalMonthlyHours = empRecords
              .filter(r => {
                  const d = new Date(r.workingDate);
                  return d >= monthStart && d <= monthEnd;
              })
              .reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

          const existingAttendanceDates = new Set(
              empRecords
                  .filter(r => {
                      const d = new Date(r.workingDate);
                      return d >= monthStart && d <= monthEnd;
                  })
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
              totalWeekHours: parseFloat(totalWeekHours.toFixed(2)),
              totalMonthlyHours: parseFloat(totalMonthlyHours.toFixed(2)),
              pendingUpdates,
              monthStatus: (!isFutureMonth && pendingUpdates === 0) ? 'Completed' : 'Pending',
          };
      }
      this.logger.log(`[${METHOD}] Collective stats processed successfully for ${employees.length} employees`);
      return results;
    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       throw new HttpException('Failed to generate collective dashboard stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  async generateMonthlyReport(month: number, year: number, managerName?: string, managerId?: string): Promise<Buffer> {
    const METHOD = 'generateMonthlyReport';
    this.logger.log(`[${METHOD}] Generating Excel report (Month: ${month}, Year: ${year}, Manager: ${managerName || 'All'})`);

    try {
      // 1. Fetch employees
      this.logger.debug(`[${METHOD}] STEP 1: Fetching employees for report...`);
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .where('employee.userStatus = :userStatus', { userStatus: 'ACTIVE' });

      if (managerName || managerId) {
        query.leftJoin(
          ManagerMapping,
          'mm',
          'mm.employeeId = employee.employeeId',
        );
        query.andWhere(
          '( (mm.status = :mappingStatus AND (mm.managerName LIKE :mName OR mm.managerId LIKE :mId)) OR (employee.employeeId = :exactId OR employee.fullName = :exactName) )',
          {
            mName: `%${managerName}%`,
            mId: `%${managerId}%`,
            exactId: managerId,
            exactName: managerName,
            mappingStatus: 'ACTIVE',
          },
        );
      }

      query.orderBy('employee.fullName', 'ASC');
      const employees = await query.getMany();
      this.logger.log(`[${METHOD}] Generating report for ${employees.length} employees`);

      // 2. Fetch Metadata
      this.logger.debug(`[${METHOD}] STEP 2: Fetching holidays and metadata...`);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const daysInMonth = endDate.getDate();

      const holidays = await this.masterHolidayService.findAll();
      const holidayMap = new Map<string, string>(); // Date -> Name
      const toLocalYMD = (dateInput: Date | string) => {
          const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dayNum = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dayNum}`;
      };
      holidays.forEach(h => {
          const d = h.holidayDate || (h as any).date;
          const key = toLocalYMD(d);
          holidayMap.set(key, (h as any).name || 'Holiday');
      });

      // 3. Fetch Attendance
      this.logger.debug(`[${METHOD}] STEP 3: Fetching attendance records...`);
      const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      
      const employeeIds = employees.map(e => e.employeeId);
      if (employeeIds.length === 0) {
          this.logger.warn(`[${METHOD}] No employees found for report criteria`);
      }

      const attendanceQuery = this.employeeAttendanceRepository.createQueryBuilder('attendance')
        .where('attendance.workingDate BETWEEN :start AND :end', { 
          start: new Date(startStr + 'T00:00:00'), 
          end: new Date(endStr + 'T23:59:59') 
        });

      if (employeeIds.length > 0) {
        attendanceQuery.andWhere('attendance.employeeId IN (:...employeeIds)', { employeeIds });
      }

      const allAttendance = await attendanceQuery.getMany();

      const attendanceMap = new Map<string, Map<string, EmployeeAttendance>>();
      allAttendance.forEach(record => {
        if (!attendanceMap.has(record.employeeId)) {
          attendanceMap.set(record.employeeId, new Map());
        }
        const dateKey = toLocalYMD(record.workingDate);
        const empMap = attendanceMap.get(record.employeeId);
        if (empMap) {
          empMap.set(dateKey, record);
        }
      });

      // 4. Create Excel
      this.logger.debug(`[${METHOD}] STEP 4: Creating Excel workbook...`);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`Attendance - ${month}-${year}`);

      const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '92D050' } };
      const weekendFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0000' } };
      const blueFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ADD8E6' } };
      
      const dateHeaders = ['']; 
      const dayHeaders = ['Name'];
      const dateKeys: string[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
          const dateObj = new Date(year, month - 1, day);
          const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          dateKeys.push(dateKey);
          dateHeaders.push(`${day}-${dateObj.toLocaleDateString('en-US', { month: 'short' })}`);
          dayHeaders.push(dateObj.toLocaleDateString('en-US', { weekday: 'long' }));
      }

      const titleRow = sheet.addRow([`ATTENDANCE - ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`]);
      sheet.mergeCells(1, 1, 1, daysInMonth + 1);
      titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.getCell(1).font = { bold: true, size: 14 };
      titleRow.getCell(1).fill = headerFill;

      const dRow = sheet.addRow(dateHeaders);
      dRow.eachCell((cell, colNumber) => {
         if (colNumber > 1) {
             cell.fill = headerFill; 
             cell.alignment = { horizontal: 'center' };
             cell.font = { bold: true };
         }
      });

      const dayRow = sheet.addRow(dayHeaders);
      dayRow.eachCell((cell, colNumber) => {
          if (colNumber === 1) {
             cell.fill = headerFill;
             cell.font = { bold: true };
          } else {
             const dateK = dateKeys[colNumber - 2];
             const dateO = new Date(dateK + 'T00:00:00');
             const isW = dateO.getDay() === 0 || dateO.getDay() === 6;
             const hName = holidayMap.get(dateK);
             if (hName) { cell.fill = blueFill; cell.font = { color: { argb: '000000' } }; }
             else if (isW) { cell.fill = weekendFill; cell.font = { color: { argb: 'FFFFFFFF' } }; }
             cell.alignment = { horizontal: 'center' };
          }
      });

      const yellowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
      const todayYMD = toLocalYMD(new Date());

      for (const employee of employees) {
          const employeeName = employee.fullName || employee.employeeId || 'Unknown';
          const row = sheet.addRow([employeeName]);
          row.getCell(1).font = { bold: true };
          row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
          
          for (let i = 0; i < daysInMonth; i++) {
              const dateK = dateKeys[i];
              const dateO = new Date(dateK + 'T00:00:00');
              const hName = holidayMap.get(dateK);
              const cell = row.getCell(i + 2);
              const record = attendanceMap.get(employee.employeeId)?.get(dateK);

              if (hName) {
                  cell.value = hName;
                  cell.fill = blueFill;
                  cell.font = { size: 10 };
              } else if (dateO.getDay() === 0) {
                  cell.fill = weekendFill; cell.value = 'Weekend'; cell.font = { color: { argb: 'FFFFFFFF' } };
              } else if (dateO.getDay() === 6 && (!record || !((record.totalHours || 0) > 0))) {
                  cell.fill = weekendFill; cell.value = 'Weekend'; cell.font = { color: { argb: 'FFFFFFFF' } };
              } else if (record) {
                  let text = 'Present';
                  let color = '000000';
                  if (record.status === AttendanceStatus.ABSENT) { text = 'Absent'; color = '8B0000'; }
                  else if (record.status === AttendanceStatus.LEAVE) { text = 'Leave'; color = 'FF6666'; }
                  else if (record.status === AttendanceStatus.HALF_DAY) { text = 'Half day'; color = 'FFA500'; }
                  else if (record.workLocation === 'Client Visit') { text = 'Client Visit'; color = '0000FF'; }
                  else if (record.status === AttendanceStatus.FULL_DAY) { text = 'Present'; }
                  
                  cell.value = text;
                  cell.font = { color: { argb: color } };
              } else {
                  if (dateK > todayYMD) {
                      cell.value = 'Upcoming';
                      cell.font = { italic: true, color: { argb: '808080' } };
                  } else {
                      cell.value = 'Not Updated';
                      cell.fill = yellowFill;
                  }
              }
              cell.alignment = { horizontal: 'center' };
          }
      }

      this.logger.debug(`[${METHOD}] STEP 5: Finalizing report...`);
      sheet.columns.forEach(column => { column.width = 15; });
      sheet.getColumn(1).width = 25;

      const buffer = await workbook.xlsx.writeBuffer();
      this.logger.log(`[${METHOD}] Successfully generated report for ${employees.length} employees`);
      return Buffer.from(buffer);
    } catch (error) {
       this.logger.error(`[${METHOD}] Report Generation Failed: ${error.message}`, error.stack);
       throw new HttpException('Failed to generate attendance report', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
