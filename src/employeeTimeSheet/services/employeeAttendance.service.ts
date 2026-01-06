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

  async create(
    createEmployeeAttendanceDto: EmployeeAttendanceDto,
  ): Promise<EmployeeAttendance> {
    try {
      this.logger.log(
        `Creating attendance record: ${JSON.stringify(createEmployeeAttendanceDto)}`,
      );
      const attendance = this.employeeAttendanceRepository.create(
        createEmployeeAttendanceDto,
      );
      return await this.employeeAttendanceRepository.save(attendance);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error creating attendance: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        'Failed to create attendance record: ' + error.message,
      );
    }
  }

  async findAll(): Promise<EmployeeAttendance[]> {
    try {
      return await this.employeeAttendanceRepository.find();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to fetch attendance records: ' + error.message,
      );
    }
  }

  async findOne(id: number): Promise<EmployeeAttendance> {
    try {
      const attendance = await this.employeeAttendanceRepository.findOne({
        where: { id },
      });
      if (!attendance) {
        throw new NotFoundException(`Attendance record with ID ${id} not found`);
      }
      return attendance;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to fetch attendance record: ' + error.message,
      );
    }
  }

  async update(
    id: number,
    updateEmployeeAttendanceDto: Partial<EmployeeAttendanceDto>,
  ): Promise<EmployeeAttendance> {
    try {
      const attendance = await this.findOne(id);
      Object.assign(attendance, updateEmployeeAttendanceDto);
      return await this.employeeAttendanceRepository.save(attendance);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to update attendance record: ' + error.message,
      );
    }
  }

  async remove(id: number): Promise<void> {
    try {
      const result = await this.employeeAttendanceRepository.delete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Attendance record with ID ${id} not found`);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to delete attendance record: ' + error.message,
      );
    }
  }

  async findByMonth(
    month: string,
    year: string,
    employeeId: string,
  ): Promise<EmployeeAttendance[]> {
    try {
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
        0,
      );

      return await this.employeeAttendanceRepository.find({
        where: {
          employeeId: employeeId,
          workingDate: Between(startDate, endDate),
        },
        order: { workingDate: 'ASC' },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to fetch monthly attendance: ' + error.message,
      );
    }
  }

  async findByDate(
    workingDate: string,
    employeeId: string,
  ): Promise<EmployeeAttendance[]> {
    try {
      return await this.employeeAttendanceRepository.find({
        where: {
          employeeId: employeeId,
          workingDate: new Date(workingDate),
        },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to fetch daily attendance: ' + error.message,
      );
    }
  }

  async findWorkedDays(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<EmployeeAttendance[]> {
    try {
      return await this.employeeAttendanceRepository.find({
        where: {
          employeeId: employeeId,
          workingDate: Between(new Date(startDate), new Date(endDate)),
          status: AttendanceStatus.FULL_DAY,
        },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to fetch worked days: ' + error.message,
      );
    }
  }

  async postLoginTime(
    employeeId: string,
    dto: { workingDate: Date; loginTime: string },
  ) {
    try {
      const { workingDate, loginTime } = dto;
      if (!workingDate) {
        throw new BadRequestException('Working date is required');
      }
      if (!loginTime) {
        throw new BadRequestException('Login time is required');
      }

      // Convert string date to Date object
      const parsedWorkingDate = new Date(workingDate);
      if (isNaN(parsedWorkingDate.getTime())) {
        throw new BadRequestException('Invalid working date format');
      }

      const existingRecord = await this.employeeAttendanceRepository.findOne({
        where: {
          employeeId,
          workingDate: parsedWorkingDate,
        },
      });

      if (existingRecord) {
        throw new BadRequestException('Login time already exists for this date');
      }

      // Validate time format roughly (simple check or regex could be used)
      const [time, period] = loginTime.split(' ');
      if (!time || !period) {
        throw new BadRequestException(
          'Invalid login time format. Expected format: "HH:MM AM/PM"',
        );
      }

      const attendance = this.employeeAttendanceRepository.create({
        employeeId,
        workingDate: parsedWorkingDate,
        loginTime,
        status: AttendanceStatus.PENDING,
      });

      return await this.employeeAttendanceRepository.save(attendance);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to save login time: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async postLogoutTime(
    employeeId: string,
    dto: { workingDate: Date; logoutTime: string },
  ) {
    try {
      const { workingDate, logoutTime } = dto;
      if (!workingDate) {
        throw new BadRequestException('Working date is required');
      }
      if (!logoutTime) {
        throw new BadRequestException('Logout time is required');
      }

      const parsedWorkingDate = new Date(workingDate);
      if (isNaN(parsedWorkingDate.getTime())) {
        throw new BadRequestException('Invalid working date format');
      }

      const attendance = await this.employeeAttendanceRepository.findOne({
        where: {
          employeeId,
          workingDate: parsedWorkingDate,
        },
      });

      if (!attendance) {
        throw new NotFoundException('Attendance record not found for logout');
      }

      // --- Time Calculation Logic from Reference ---
      const [loginTimePart, loginModifier] = attendance.loginTime.split(' ');
      const [loginHoursStr, loginMinutesStr] = loginTimePart
        .split(':')
        .map(Number);

      let loginHour = loginHoursStr;
      if (loginModifier === 'PM' && loginHour !== 12) {
        loginHour += 12;
      } else if (loginModifier === 'AM' && loginHour === 12) {
        loginHour = 0;
      }
      const totalLoginMinutes = loginHour * 60 + loginMinutesStr;

      const [logoutTimePart, logoutModifier] = logoutTime.split(' ');
      const [logoutHoursStr, logoutMinutesStr] = logoutTimePart
        .split(':')
        .map(Number);

      let logoutHour = logoutHoursStr;
      if (logoutModifier === 'PM' && logoutHour !== 12) {
        logoutHour += 12;
      } else if (logoutModifier === 'AM' && logoutHour === 12) {
        logoutHour = 0;
      }
      const totalLogoutMinutes = logoutHour * 60 + logoutMinutesStr;

      // Calculate Duration
      const diffMinutes = totalLogoutMinutes - totalLoginMinutes;
      const totalHours = Math.floor(diffMinutes / 60);
      // const minutes = diffMinutes % 60; // Not storing minutes in Entity currently, but calculated

      // --- Status Logic from Reference ---
      let status: string;
      if (totalHours >= 7) {
        status = AttendanceStatus.FULL_DAY;
      } else if (totalHours >= 4) {
        status = AttendanceStatus.HALF_DAY;
      } else {
        status = AttendanceStatus.LEAVE; // Or some logic for < 4 hours
      }

      attendance.logoutTime = logoutTime;
      attendance.totalHours = totalHours;
      attendance.status = status;

      return await this.employeeAttendanceRepository.save(attendance);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'Failed to parse and save logout time: ' + error.message,
      );
    }
  }
}
