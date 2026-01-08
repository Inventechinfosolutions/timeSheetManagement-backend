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

@Injectable()
export class EmployeeAttendanceService {
  private readonly logger = new Logger(EmployeeAttendanceService.name);

  constructor(
    @InjectRepository(EmployeeAttendance)
    private readonly employeeAttendanceRepository: Repository<EmployeeAttendance>,
  ) {}

  async create(createEmployeeAttendanceDto: EmployeeAttendanceDto): Promise<EmployeeAttendance> {
    try {
      if (createEmployeeAttendanceDto.loginTime) {
        createEmployeeAttendanceDto.loginTime = this.normalizeTime(createEmployeeAttendanceDto.loginTime);
      }
      if (createEmployeeAttendanceDto.logoutTime) {
        createEmployeeAttendanceDto.logoutTime = this.normalizeTime(createEmployeeAttendanceDto.logoutTime);
      }
      const attendance = this.employeeAttendanceRepository.create(createEmployeeAttendanceDto);
      return await this.employeeAttendanceRepository.save(attendance);
    } catch (error) {
      throw new BadRequestException('Failed to create attendance record: ' + error.message);
    }
  }

  async findAll(): Promise<EmployeeAttendance[]> {
    const records = await this.employeeAttendanceRepository.find();
    return records.map(record => this.applyStatusBusinessRules(record));
  }

  async findOne(id: number): Promise<EmployeeAttendance> {
    const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
    if (!attendance) throw new NotFoundException(`Record with ID ${id} not found`);
    return this.applyStatusBusinessRules(attendance);
  }

  async update(id: number, updateDto: Partial<EmployeeAttendanceDto>): Promise<EmployeeAttendance> {
    const attendance = await this.findOne(id);
    
    if (updateDto.loginTime) updateDto.loginTime = this.normalizeTime(updateDto.loginTime);
    if (updateDto.logoutTime) updateDto.logoutTime = this.normalizeTime(updateDto.logoutTime);

    Object.assign(attendance, updateDto);
    
    // Recalculate if times are updated manually
    if (updateDto.loginTime || updateDto.logoutTime) {
      this.calculateAndSetStatus(attendance);
    }
    
    return await this.employeeAttendanceRepository.save(attendance);
  }

  async findByMonth(month: string, year: string, employeeId: string): Promise<EmployeeAttendance[]> {
    // pad month with 0 (e.g. '7' -> '07') for standard ISO format
    const start = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

    const records = await this.employeeAttendanceRepository.find({
      where: { employeeId, workingDate: Between(start, end) },
      order: { workingDate: 'ASC' },
    });
    return records.map(record => this.applyStatusBusinessRules(record));
  }

  async findByDate(workingDate: string, employeeId: string): Promise<EmployeeAttendance[]> {
    const records = await this.employeeAttendanceRepository.find({
      where: { 
        employeeId, 
        workingDate: Between(new Date(`${workingDate}T00:00:00`), new Date(`${workingDate}T23:59:59`)) 
      },
    });
    return records.map(record => this.applyStatusBusinessRules(record));
  }

  async findWorkedDays(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<EmployeeAttendance[]> {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);

    const records = await this.employeeAttendanceRepository.find({
      where: {
        employeeId,
        workingDate: Between(start, end),
      },
      order: { workingDate: 'ASC' },
    });
    return records.map((record) => this.applyStatusBusinessRules(record));
  }

  async remove(id: number): Promise<void> {
    const result = await this.employeeAttendanceRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Record with ID ${id} not found`);
    }
  }

  async postLoginTime(employeeId: string, dto: { workingDate: string; loginTime: string }) {
    const { workingDate, loginTime } = dto;
    const parsedDate = new Date(`${workingDate}T00:00:00`);

    const existing = await this.employeeAttendanceRepository.findOne({
      where: { employeeId, workingDate: Between(parsedDate, new Date(`${workingDate}T23:59:59`)) }
    });

    if (existing) throw new BadRequestException('Login already exists for this date');

    const attendance = this.employeeAttendanceRepository.create({
      employeeId,
      workingDate: parsedDate,
      loginTime: this.normalizeTime(loginTime),
      status: AttendanceStatus.PENDING,
    });

    return await this.employeeAttendanceRepository.save(attendance);
  }

  async postLogoutTime(employeeId: string, dto: { workingDate: string; logoutTime: string }) {
    const { workingDate, logoutTime } = dto;
    const attendance = await this.employeeAttendanceRepository.findOne({
      where: { 
        employeeId, 
        workingDate: Between(new Date(`${workingDate}T00:00:00`), new Date(`${workingDate}T23:59:59`)) 
      },
    });

    if (!attendance) throw new NotFoundException('Attendance record not found for logout');

    attendance.logoutTime = this.normalizeTime(logoutTime);
    this.calculateAndSetStatus(attendance); // Apply 9h/6h Logic

    return await this.employeeAttendanceRepository.save(attendance);
  }

  /**
   * Normalizes time to "HH:MM AM/PM" format.
   * Handles 24h inputs (e.g., "14:00" -> "02:00 PM")
   */
  private normalizeTime(time: string): string {
    if (!time) return time;
    
    // Check if it already has AM/PM
    if (/\s(AM|PM)$/i.test(time)) {
      return time.toUpperCase();
    }

    // Try parsing 24h format (HH:mm or HH)
    const [timePart] = time.split(' ');
    const parts = timePart.split(':');
    let hrs = parseInt(parts[0], 10);
    const mins = parts.length > 1 ? parts[1].padStart(2, '0') : '00';

    if (isNaN(hrs)) return time;

    const modifier = hrs >= 12 ? 'PM' : 'AM';
    let displayHrs = hrs % 12;
    if (displayHrs === 0) displayHrs = 12;
    
    return `${displayHrs.toString().padStart(2, '0')}:${mins} ${modifier}`;
  }

  /**
   * Status Logic (Full Day > 6h / Half Day <= 6h)
   */
  private calculateAndSetStatus(attendance: EmployeeAttendance) {
    if (!attendance.loginTime || !attendance.logoutTime) return;

    try {
      const parseTime = (time: string) => {
        const [timePart, modifier] = time.split(' ');
        let [hrs, mins] = timePart.split(':').map(Number);
        if (modifier === 'PM' && hrs !== 12) hrs += 12;
        else if (modifier === 'AM' && hrs === 12) hrs = 0;
        return hrs * 60 + mins;
      };

      const loginMins = parseTime(attendance.loginTime);
      const logoutMins = parseTime(attendance.logoutTime);
      
      let totalMins = logoutMins - loginMins;
      if (totalMins < 0) {
        // Handle midnight rollover (e.g., 10 PM to 2 AM)
        totalMins += 24 * 60;
      }
      
      const totalHours = totalMins / 60;

      if (totalHours > 6) {
        attendance.status = AttendanceStatus.FULL_DAY;
      } else {
        attendance.status = AttendanceStatus.HALF_DAY;
      }

      attendance.totalHours = parseFloat(totalHours.toFixed(2));
    } catch (e) {
      this.logger.error('Error calculating status:', e);
    }
  }

  /**
   * Passed Day Rules: No login = LEAVE, No logout = NOT_UPDATED
   */
  private applyStatusBusinessRules(attendance: EmployeeAttendance): EmployeeAttendance {
    const today = new Date().toISOString().split('T')[0];
    const workingDate = new Date(attendance.workingDate).toISOString().split('T')[0];
    
    if (workingDate < today) {
      if (!attendance.loginTime) {
        attendance.status = AttendanceStatus.LEAVE;
      } else if (attendance.loginTime && !attendance.logoutTime) {
        attendance.status = AttendanceStatus.NOT_UPDATED;
      }
    } else if (workingDate === today) {
      if (attendance.loginTime && !attendance.logoutTime) {
        attendance.status = AttendanceStatus.PENDING;
      }
    }
    return attendance;
  }
}