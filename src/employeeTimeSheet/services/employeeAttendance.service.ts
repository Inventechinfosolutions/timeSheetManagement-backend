import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  EmployeeAttendance,
  AttendanceStatus,
} from '../entities/employeeAttendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmployeeAttendanceDto } from '../dto/employeeAttendance.dto';
import { MasterHolidayService } from '../../master/service/master-holiday.service';
import { TimesheetBlockerService } from './timesheetBlocker.service';

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

  async create(createEmployeeAttendanceDto: EmployeeAttendanceDto, isAdmin: boolean = false): Promise<EmployeeAttendance | null> {
    try {
      if (!isAdmin && createEmployeeAttendanceDto.workingDate && 
          !this.isEditableMonth(new Date(createEmployeeAttendanceDto.workingDate))) {
          throw new BadRequestException('Attendance for this month is locked.');
      }

      const workingDateObj = new Date(createEmployeeAttendanceDto.workingDate);
      const today = new Date();
      today.setHours(0,0,0,0);
      workingDateObj.setHours(0,0,0,0);

      // Rule: Do not create future records with 0 hours, UNLESS status or workLocation is provided
      if (!createEmployeeAttendanceDto.status && !createEmployeeAttendanceDto.workLocation && (!createEmployeeAttendanceDto.totalHours || createEmployeeAttendanceDto.totalHours === 0) && workingDateObj > today) {
         return null; 
      }

      if (!isAdmin && createEmployeeAttendanceDto.employeeId && createEmployeeAttendanceDto.workingDate) {
        const isBlocked = await this.blockerService.isBlocked(
          createEmployeeAttendanceDto.employeeId, 
          createEmployeeAttendanceDto.workingDate
        );
        if (isBlocked) {
          throw new BadRequestException('Timesheet is locked for this date by admin.');
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

      if (existingRecord) {
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


  async createBulk(attendanceDtos: EmployeeAttendanceDto[], isAdmin: boolean = false): Promise<EmployeeAttendance[]> {
    const results: EmployeeAttendance[] = [];
    for (const dto of attendanceDtos) {
        try {
            let record;
            if (dto.id) {
                // Update existing
                record = await this.update(dto.id, dto, isAdmin);
            } else {
                // Create new
                record = await this.create(dto, isAdmin);
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

  async findAll(): Promise<EmployeeAttendance[]> {
    const records = await this.employeeAttendanceRepository.find();
    return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
  }

  async findOne(id: number): Promise<EmployeeAttendance> {
    const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
    if (!attendance) throw new NotFoundException(`Record with ID ${id} not found`);
    return await this.applyStatusBusinessRules(attendance);
  }

  async update(id: number, updateDto: Partial<EmployeeAttendanceDto>, isAdmin: boolean = false): Promise<EmployeeAttendance | null> {
    const attendance = await this.findOne(id);
    
    if (!isAdmin && !this.isEditableMonth(new Date(attendance.workingDate))) {
      throw new BadRequestException('Attendance for this month is locked.');
    }

    const workingDateObj = new Date(attendance.workingDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    workingDateObj.setHours(0,0,0,0);

    // Rule: Delete future records if hours are cleared
    if ((updateDto.totalHours === 0 || updateDto.totalHours === null) && workingDateObj > today) {
        await this.employeeAttendanceRepository.delete(id);
        return null;
    }

    if (!isAdmin) {
      const isBlocked = await this.blockerService.isBlocked(
        attendance.employeeId, 
        attendance.workingDate
      );
      if (isBlocked) {
        throw new BadRequestException('Timesheet is locked for this date by admin.');
      }
    }

    Object.assign(attendance, updateDto);
    
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
          // Past or Today weekday with 0 hours -> LEAVE
          return AttendanceStatus.LEAVE;
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

  async remove(id: number): Promise<void> {
    const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
    if (attendance && !this.isEditableMonth(new Date(attendance.workingDate))) {
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

        // Priority 3: Default to Leave for past weekdays with missing status
        attendance.status = AttendanceStatus.LEAVE;
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
        // Default: Start 4 months prior to the input month (total 5 months window)
        start = new Date(endInput.getFullYear(), endInput.getMonth() - 4, 1);
    }
    
    // Ensure start is the beginning of that month
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endInput.getFullYear(), endInput.getMonth() + 1, 0, 23, 59, 59);

    // Fetch confirmed requests from LeaveRequest table as it is the source of truth for approvals
    const requests = await this.leaveRequestRepository.createQueryBuilder('req')
        .where('req.employeeId = :employeeId', { employeeId })
        .andWhere('req.status = :status', { status: 'Approved' })
        .andWhere('req.fromDate <= :end', { end: end.toISOString().split('T')[0] })
        .andWhere('req.toDate >= :start', { start: start.toISOString().split('T')[0] })
        .getMany();

    const monthsData: any[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Calculate number of months to iterate
    const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

    for (let i = 0; i < totalMonths; i++) {
        const currentRef = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const monthIdx = currentRef.getMonth();
        const year = currentRef.getFullYear();
        const monthName = monthNames[monthIdx];

        const stats = {
            month: monthName,
            year: year,
            totalLeaves: 0,
            workFromHome: 0,
            clientVisits: 0
        };

        // Aggregation logic using Approved Requests
        requests.forEach(req => {
            let loopDate = new Date(req.fromDate);
            const reqEnd = new Date(req.toDate);
            
            // Iterate each day of the request
            while (loopDate <= reqEnd) {
                // If the day falls in the current month loop
                if (loopDate.getMonth() === monthIdx && loopDate.getFullYear() === year) {
                     const type = req.requestType; 
                     
                     if (type === 'Work From Home') {
                         stats.workFromHome++;
                     } else if (type === 'Client Visit') {
                         stats.clientVisits++;
                     } else {
                         // Leaves (Sick, Casual, Leave, etc.)
                         stats.totalLeaves++;
                     }
                }
                // Next day
                loopDate.setDate(loopDate.getDate() + 1);
            }
        });

        monthsData.push(stats);
    }
    return monthsData;
  }

  async findAllMonthlyDetails(month: string, year: string): Promise<EmployeeAttendance[]> {
    const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

    const records = await this.employeeAttendanceRepository.find({
      where: { workingDate: Between(start, end) },
      order: { workingDate: 'ASC' },
    });
    return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
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

  async getAllDashboardStats(queryMonth?: string, queryYear?: string) {
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

    // 1. Fetch all employees
    const employees = await this.employeeDetailsRepository.find({
      select: ['employeeId', 'fullName']
    });

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
}
