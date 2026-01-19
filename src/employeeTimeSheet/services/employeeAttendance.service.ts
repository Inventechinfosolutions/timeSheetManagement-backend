import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  EmployeeAttendance,
  AttendanceStatus,
} from '../entities/employeeAttendance.entity';
import { EmployeeAttendanceDto } from '../dto/employeeAttendance.dto';
import { MasterHolidayService } from '../../master/service/master-holiday.service';
import { TimesheetBlockerService } from './timesheetBlocker.service';

@Injectable()
export class EmployeeAttendanceService {
  private readonly logger = new Logger(EmployeeAttendanceService.name);

  constructor(
    @InjectRepository(EmployeeAttendance)
    private readonly employeeAttendanceRepository: Repository<EmployeeAttendance>,
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

      // Rule: Do not create future records with 0 hours
      if ((!createEmployeeAttendanceDto.totalHours || createEmployeeAttendanceDto.totalHours === 0) && workingDateObj > today) {
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

      const attendance = this.employeeAttendanceRepository.create(createEmployeeAttendanceDto);
      
      if (attendance.totalHours !== undefined && attendance.totalHours !== null) {
          attendance.status = await this.determineStatus(attendance.totalHours, attendance.workingDate);
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
      attendance.status = await this.determineStatus(attendance.totalHours, attendance.workingDate);
    }
    
    return await this.employeeAttendanceRepository.save(attendance);
  }

  private async determineStatus(hours: number, workingDate: Date): Promise<AttendanceStatus> {
    const dateObj = new Date(workingDate);
    // Normalize date for comparison: YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

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

  async findAllMonthlyDetails(month: string, year: string): Promise<EmployeeAttendance[]> {
    const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

    const records = await this.employeeAttendanceRepository.find({
      where: { workingDate: Between(start, end) },
      order: { workingDate: 'ASC' },
    });
    return Promise.all(records.map(record => this.applyStatusBusinessRules(record)));
  }
}
