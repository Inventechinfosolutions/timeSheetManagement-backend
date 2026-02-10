import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository, LessThanOrEqual, MoreThanOrEqual, In } from 'typeorm';
// import { Between, Repository } from 'typeorm';
// import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
// import { AttendanceStatus } from '../enums/attendance-status.enum';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { AttendanceStatus } from '../enums/attendance-status.enum';
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
    try {
      if (!isAdmin && !isManager && createEmployeeAttendanceDto.workingDate && 
          !this.isEditableMonth(new Date(createEmployeeAttendanceDto.workingDate))) {
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
          throw new BadRequestException(`Timesheet is locked for this date by ${blockedByName}. Please contact them to unlock.`);
        }
      }

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
         return null; 
      }

      if (existingRecord) {
        // Priority Hierarchy: Leave (3) > Client Visit (2) > Work From Home (1)
        const getPriority = (status: string | null, location: string | null) => {
          if (status === AttendanceStatus.LEAVE || String(status).toLowerCase() === 'leave') return 3;
          if (location === 'Client Visit' || String(location).toLowerCase() === 'client visit') return 2;
          if (location === 'WFH' || location === 'Work From Home' || String(location).toLowerCase().includes('wfh')) return 1;
          return 0;
        };

        const existingPriority = getPriority(existingRecord.status, existingRecord.workLocation);
        const incomingPriority = getPriority(createEmployeeAttendanceDto.status || null, createEmployeeAttendanceDto.workLocation || null);

        // Rule: Only overwrite if incoming priority is GREATER THAN OR EQUAL to existing priority
        // Exception: Always allow updates if the incoming update is from an Admin or is explicitly clearing the status
        if (incomingPriority < existingPriority && !isAdmin && createEmployeeAttendanceDto.status !== null && createEmployeeAttendanceDto.workLocation !== null) {
          // If trying to downgrade priority (e.g., WFH trying to overwrite CV), ignore the change
          return existingRecord;
        }
        
        // Update existing record
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
        return await this.employeeAttendanceRepository.save(existingRecord);
      }

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

      return await this.employeeAttendanceRepository.save(attendance);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Failed to create: ' + error.message);
    }
  }


  async createBulk(attendanceDtos: EmployeeAttendanceDto[], isAdmin: boolean = false, isManager: boolean = false): Promise<EmployeeAttendance[]> {
    const results: EmployeeAttendance[] = [];
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
            this.logger.error(`Failed to process bulk item for ${dto.workingDate}: ${error.message}`);
        }
    }
    return results;
  }

  async autoUpdateTimesheet(employeeId: string, month: string, year: string): Promise<any> {
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    const today = new Date();
    
    // Ensure we only auto-update for current month
    if (today.getMonth() + 1 !== monthNum || today.getFullYear() !== yearNum) {
      throw new BadRequestException('Auto-update is only available for the current month.');
    }

    const startDate = new Date(yearNum, monthNum - 1, 1, 12, 0, 0); // Noon to avoid timezone boundary issues
    
    // Set endDate to "today" to avoid future updates
    const endDate = new Date(); 
    endDate.setHours(23, 59, 59, 999);
    
    // 1. Fetch holidays (using existing findAll helper which seems to return entities with date/holidayDate)
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

    // 2. Fetch existing attendance for the month
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

    // 3. Fetch approved leaves (Full & Half)
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

    // 4. Generate records for eligible days
    const recordsToCreate: EmployeeAttendanceDto[] = [];
    const updatedDateStrings: string[] = [];
    let currentDate = new Date(startDate);
    
    // Iterate from 1st of month up to today (inclusive)
    while (currentDate <= endDate) {
        // Stop if we go past "today"
        if (currentDate > today) break;

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
            }
            
            
            dto.totalHours = 9;
            recordsToCreate.push(dto);
            updatedDateStrings.push(dateStr);
        }

        // Increment day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    if (recordsToCreate.length === 0) {
        return { message: 'No eligible days found to update.', count: 0, updatedDates: [] };
    }

    // 5. Bulk Create
    // We update logic to use createBulk 
    // We rely on the fact we set IDs for existing records to trigger updates
    await this.createBulk(recordsToCreate, false, false);

    return { 
        message: 'Timesheet updated successfully',
        count: recordsToCreate.length,
        updatedDates: updatedDateStrings
    };
  }

  async findAll(): Promise<EmployeeAttendance[]> {
    const records = await this.employeeAttendanceRepository.find();
    return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
  }

  async findOne(id: number): Promise<EmployeeAttendance> {
    const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
    if (!attendance) throw new NotFoundException(`Record with ID ${id} not found`);
    return await this.applyStatusBusinessRules(attendance);
  }

  async update(id: number, updateDto: Partial<EmployeeAttendanceDto>, isAdmin: boolean = false, isManager: boolean = false): Promise<EmployeeAttendance | null> {
    const attendance = await this.findOne(id);
    
    // BLOCKING LOGIC: If record is auto-generated from an approved Half Day request
    // Only Admin and Manager can override this block.
    if (attendance.sourceRequestId && !isAdmin && !isManager) {
      throw new ForbiddenException(
          'This attendance record was auto-generated from an approved Half Day request and cannot be edited by the employee.'
      );
    }

    if (!isAdmin && !isManager && !this.isEditableMonth(new Date(attendance.workingDate))) {
      throw new BadRequestException('Attendance for this month is locked.');
    }

    const workingDateObj = new Date(attendance.workingDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    workingDateObj.setHours(0,0,0,0);

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
        await this.employeeAttendanceRepository.delete(id);
        return null;
    }

    if (!isAdmin) {
      const blocker = await this.blockerService.isBlocked(
        attendance.employeeId, 
        attendance.workingDate
      );
      if (blocker) {
        // If the current user is a Manager AND they are the one who blocked it, or they are a manager 
        // we might want to allow override here, but the user said "manger can also unblock that" 
        // suggesting they should unblock first. However, many systems allow the blocker to edit.
        // For now, let's just make the error message dynamic as requested.
        const blockedByName = blocker.blockedBy || 'Administrator';
        throw new BadRequestException(`Timesheet is locked for this date by ${blockedByName}. Please contact them to unlock.`);
      }
    }

    // Priority Hierarchy: Leave (3) > Client Visit (2) > Work From Home (1)
    const getPriority = (status: string | null, location: string | null) => {
      if (status === AttendanceStatus.LEAVE || String(status).toLowerCase() === 'leave') return 3;
      if (location === 'Client Visit' || String(location).toLowerCase() === 'client visit') return 2;
      if (location === 'WFH' || location === 'Work From Home' || String(location).toLowerCase().includes('wfh')) return 1;
      return 0;
    };

    const existingPriority = getPriority(attendance.status, attendance.workLocation);
    const incomingPriority = getPriority(updateDto.status || null, updateDto.workLocation || null);

    // Rule: Only overwrite if incoming priority is GREATER THAN OR EQUAL to existing priority
    // Exception: Always allow updates if the incoming update is from an Admin or Manager, or is explicitly clearing the status
    if (incomingPriority < existingPriority && !isAdmin && !isManager && updateDto.status !== null && updateDto.workLocation !== null) {
      // If trying to downgrade priority (e.g., WFH trying to overwrite CV), ignore the change
      return attendance;
    }

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
    
    return await this.employeeAttendanceRepository.save(attendance);
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
    const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

    const records = await this.employeeAttendanceRepository.find({
      where: { employeeId, workingDate: Between(start, end) },
      order: { workingDate: 'ASC' },
    });
    return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
  }



  async findByDate(workingDate: string, employeeId: string): Promise<EmployeeAttendance[]> {
    const records = await this.employeeAttendanceRepository.find({
      where: { 
        employeeId, 
        workingDate: Between(new Date(`${workingDate}T00:00:00`), new Date(`${workingDate}T23:59:59`)) 
      },
    });
    return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
  }

  async findByDateRange(employeeId: string, startDate: string, endDate: string): Promise<EmployeeAttendance[]> {
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
  }

  async findWorkedDays(employeeId: string, startDate: string, endDate: string): Promise<any[]> {
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
  }

  async remove(id: number, isAdmin: boolean = false, isManager: boolean = false): Promise<void> {
    const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
    if (attendance && !isAdmin && !isManager && !this.isEditableMonth(new Date(attendance.workingDate))) {
         throw new BadRequestException('Cannot delete locked attendance records.');
    }
    const result = await this.employeeAttendanceRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Record with ID ${id} not found`);
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
                workFromHome: 0,
                clientVisits: 0
            });
        }

        const stats = monthlyStatsMap.get(key);
        const status = (record.status || '').toLowerCase();
        const location = (record.workLocation || '').toLowerCase();

        // Check for Full Leaves (1.0) and Half Days (0.5)
        if (status === 'leave' || status === 'absent') {
            stats.totalLeaves += 1;
        }
        else if (status === 'half day') {
            stats.totalLeaves += 0.5;
        }

        // Check for WFH
        if (location.includes('home') || location.includes('wfh')) {
            stats.workFromHome++;
        } 
        // Check for Client Visit
        else if (location.includes('client') || location.includes('visit') || location.includes('cv')) {
            stats.clientVisits++;
        }
    });

    // Convert map to sorted array
    return Array.from(monthlyStatsMap.values());
  }

  async findAllMonthlyDetails(month: string, year: string, managerName?: string, managerId?: string): Promise<EmployeeAttendance[]> {
    const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

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
        '(mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)',
        {
          managerNameQuery: `%${managerName}%`,
          managerIdQuery: `%${managerId}%`,
        },
      );
      query.andWhere('mm.status = :mappingStatus', { mappingStatus: 'ACTIVE' });
    }

    query.orderBy('attendance.workingDate', 'ASC');

    const records = await query.getMany();
    return Promise.all(
      records.map((record) => this.applyStatusBusinessRules(record)),
    );
  }
  async getDashboardStats(employeeId: string, queryMonth?: string, queryYear?: string) {
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

    const totalWeekHours = weekRecords.reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

    // 2. Total Monthly Hours
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
             // If d is string 'YYYY-MM-DD', direct usage is safest. 
             // If ISO string with time, we might still want to parse it to check local date if it was saved with timezone? 
             // Usually holiday is just a date. Let's rely on standard parsing.
             return toLocalYMD(d);
        })
    );

    // Optimization: Approved Leaves ranges
    // We already fetched `leaves`? No, simpler to query fully covering leaves or check day by day in memory.
    const allApprovedLeaves = await this.leaveRequestRepository.find({
        where: {
            employeeId,
            status: 'Approved'
        }
    });


    // Loop from monthStart to pendingLimitDate
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
        // 4. Check Leave
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

    const isFutureMonth = monthStart.getTime() > today.getTime();

    return {
      totalWeekHours: parseFloat(totalWeekHours.toFixed(2)),
      totalMonthlyHours: parseFloat(totalMonthlyHours.toFixed(2)),
      pendingUpdates,
      monthStatus: (!isFutureMonth && pendingUpdates === 0) ? 'Completed' : 'Pending',
    };
  }

  async getAllDashboardStats(queryMonth?: string, queryYear?: string, managerName?: string, managerId?: string) {
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
      .select(['employee.employeeId', 'employee.fullName']);

    query.andWhere('employee.userStatus = :userStatus', { userStatus: 'ACTIVE' });

    if (managerName || managerId) {
      query.innerJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId');
      query.andWhere(
        '(mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)',
        {
          managerNameQuery: `%${managerName}%`,
          managerIdQuery: `%${managerId}%`,
        },
      );
      query.andWhere('mm.status = :status', { status: 'ACTIVE' });
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
            .reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

        // Monthly Hours
        const totalMonthlyHours = empRecords
            .filter(r => {
                const d = new Date(r.workingDate);
                return d >= monthStart && d <= monthEnd;
            })
            .reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

        // Pending Updates
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
    return results;
  }
  async generateMonthlyReport(month: number, year: number, managerName?: string, managerId?: string): Promise<Buffer> {
    // 1. Fetch employees (filtered by manager if provided)
    // We want all active employees for Admin, but only mapped employees (and themselves) for Manager
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
        '( (mm.status = :mappingStatus AND (mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)) OR (employee.employeeId = :exactManagerId OR employee.fullName = :exactManagerName) )',
        {
          managerNameQuery: `%${managerName}%`,
          managerIdQuery: `%${managerId}%`,
          exactManagerId: managerId,
          exactManagerName: managerName,
          mappingStatus: 'ACTIVE',
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
        holidayMap.set(key, (h as any).name || 'Holiday');
    });

    // 3. Fetch all attendance for the month for the selected employees
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    const employeeIds = employees.map(e => e.employeeId);
    
    if (employeeIds.length === 0) {
      // Return empty report with headers only if no employees
    }

    const attendanceQuery = this.employeeAttendanceRepository.createQueryBuilder('attendance')
      .where('attendance.workingDate BETWEEN :start AND :end', { 
        start: new Date(startStr + 'T00:00:00'), 
        end: new Date(endStr + 'T23:59:59') 
      });

    if (employeeIds.length > 0) {
      attendanceQuery.andWhere('attendance.employeeId IN (:...employeeIds)', { employeeIds });
    } else {
      // If no employees found for this manager, we should probably still show the manager themselves if they are active?
      // But query above should have found them. 
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
        fgColor: { argb: '92D050' } // Light Green from screenshot
    };
    
    const weekendFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0000' } // Red
    };

    const yellowFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF00' } // Yellow
    };

    const blueFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'ADD8E6' } // Light Blue
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
                cell.value = 'Weekend';
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
                    cell.value = 'Weekend';
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
                let fontColor = '000000'; // Black
                
                // 1. Check specific statuses first (Leave, Half Day, Absent)
                if (record.status === AttendanceStatus.ABSENT) {
                    text = 'Absent';
                    fontColor = '8B0000'; // Dark Red
                } else if (record.status === AttendanceStatus.LEAVE) {
                    text = 'Leave';
                    fontColor = 'FF6666'; // Light Red (User asked for light red)
                } else if (record.status === AttendanceStatus.HALF_DAY) {
                    text = 'Half day';
                    fontColor = 'FFA500'; // Orange
                } 
                // 2. Then check Work Location (Client Visit / WFH)
                else if (record.workLocation === 'Client Visit') {
                    text = 'Client Visit';
                    fontColor = '0000FF'; // Blue
                } else if (record.workLocation === 'WFH') {
                    text = 'WFH';
                    fontColor = '000000'; 
                } 
                // 3. Finally standard Present
                else if (record.status === AttendanceStatus.FULL_DAY) {
                    text = 'Present';
                } else {
                    // Fallback
                    if (record.totalHours !== null && record.totalHours !== undefined) {
                        if (record.totalHours >= 6) text = 'Present';
                        else if (record.totalHours > 0) text = 'Half day';
                        else text = 'Absent'; // 0 hours fallback to Absent now logic
                    } else {
                        text = 'Present'; 
                    }
                }
                
                cell.value = text;
                cell.font = { color: { argb: fontColor } };
                cell.alignment = { horizontal: 'center' };
                continue; // Done for this cell
            }

            // PRIORITY 4: Future / Past Logic - for weekdays with no record
            const today = new Date().toISOString().split('T')[0];
            
            if (dateKey > today) {
                // Future -> "Upcoming"
                cell.value = 'Upcoming';
                cell.font = { italic: true, color: { argb: '808080' } }; // Grey
                cell.alignment = { horizontal: 'center' };
            } else {
                // Past/Today weekday with NO record -> "Not Updated"
                cell.value = 'Not Updated';
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
  }
}
