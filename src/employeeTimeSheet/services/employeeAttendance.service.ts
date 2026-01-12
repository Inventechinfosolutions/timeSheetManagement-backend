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
      if (createEmployeeAttendanceDto.workingDate && 
          !this.isEditableMonth(new Date(createEmployeeAttendanceDto.workingDate))) {
          throw new BadRequestException('Attendance for this month is locked.');
      }

      const attendance = this.employeeAttendanceRepository.create(createEmployeeAttendanceDto);
      
      if (attendance.totalHours !== undefined && attendance.totalHours !== null) {
          attendance.status = this.determineStatus(attendance.totalHours);
      }

      return await this.employeeAttendanceRepository.save(attendance);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Failed to create: ' + error.message);
    }
  }


  async createBulk(attendanceDtos: EmployeeAttendanceDto[]): Promise<EmployeeAttendance[]> {
    const results: EmployeeAttendance[] = [];
    for (const dto of attendanceDtos) {
        if (dto.id) {
            // Update existing
            results.push(await this.update(dto.id, dto));
        } else {
            // Create new
            const record = await this.create(dto);
             results.push(record);
        }
    }
    return results;
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
    
    if (!this.isEditableMonth(new Date(attendance.workingDate))) {
      throw new BadRequestException('Attendance for this month is locked.');
    }

    Object.assign(attendance, updateDto);
    
      if (attendance.totalHours !== undefined && attendance.totalHours !== null) {
      attendance.status = this.determineStatus(attendance.totalHours);
    }
    
    return await this.employeeAttendanceRepository.save(attendance);
  }

  private determineStatus(hours: number): AttendanceStatus {
      if (hours > 6) {
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

  async findWorkedDays(employeeId: string, startDate: string, endDate: string): Promise<EmployeeAttendance[]> {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);
    const records = await this.employeeAttendanceRepository.find({
      where: { employeeId, workingDate: Between(start, end) },
      order: { workingDate: 'ASC' },
    });
    return records.map(r => this.applyStatusBusinessRules(r));
  }

  async remove(id: number): Promise<void> {
    const attendance = await this.employeeAttendanceRepository.findOne({ where: { id } });
    if (attendance && !this.isEditableMonth(new Date(attendance.workingDate))) {
         throw new BadRequestException('Cannot delete locked attendance records.');
    }
    const result = await this.employeeAttendanceRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Record with ID ${id} not found`);
  }



  private applyStatusBusinessRules(attendance: EmployeeAttendance): EmployeeAttendance {
    const today = new Date().toISOString().split('T')[0];
    const workingDate = new Date(attendance.workingDate).toISOString().split('T')[0];
    
    if (workingDate < today) {
      if (!attendance.status) {
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
}

// Add this method to your Service class
