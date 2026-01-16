import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { EmployeeAttendance, AttendanceStatus } from '../employeeTimeSheet/entities/employeeAttendance.entity';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { MasterHolidayService } from '../master/service/master-holiday.service';

@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);

  constructor(
    @InjectRepository(EmployeeAttendance)
    private attendanceRepo: Repository<EmployeeAttendance>,
    
    @InjectRepository(EmployeeDetails)
    private employeeRepo: Repository<EmployeeDetails>,

    private readonly masterHolidayService: MasterHolidayService,
  ) {}

  // Run at 11:30 PM every day to check for Weekend logic
  @Cron('30 23 * * *') 
  async handleWeekendStatus() {
    this.logger.debug('Running Weekend Check...');
    
    // 1. Get Today's Date
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // 2. Check if it is a Weekend using Master Service
    const isWeekend = this.masterHolidayService.isWeekend(today);

    if (!isWeekend) {
        return; 
    }
    
    // ... remaining logic to mark absent users as WEEKEND ...
    // 3. Get all employees
    const allEmployees = await this.employeeRepo.find();
    
    // 4. Get all attendance records for Today
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);

    const records = await this.attendanceRepo.find({
        where: { workingDate: Between(startOfDay, endOfDay) } 
    });

    const presentEmployeeIds = records.map(a => a.employeeId);

    // 5. Find Employees with NO record today
    const missingEmployees = allEmployees.filter(emp => !presentEmployeeIds.includes(emp.employeeId));
    this.logger.log(`Found ${missingEmployees.length} missing entries on weekend ${dateStr}`);

    // 6. Bulk Insert "WEEKEND" Records
    const weekendRecords = missingEmployees.map(emp => {
        return this.attendanceRepo.create({
            employeeId: emp.employeeId,
            workingDate: new Date(dateStr),
            status: AttendanceStatus.WEEKEND, 
            totalHours: 0, 
        });
    });

    if (weekendRecords.length > 0) {
        await this.attendanceRepo.save(weekendRecords);
        this.logger.log(`Successfully marked ${weekendRecords.length} records as WEEKEND.`);
    }
  }
  // Run at 01:00 AM every day
  @Cron('0 1 * * *')
  async handleDailyNotUpdated() {
    this.logger.debug('Running Daily Not Updated Check...');

    // 1. Get "Yesterday" Date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // 2. Identify Weekends (Skip Saturday=6, Sunday=0) for "Not Updated" logic
    // We only want to mark "Not Updated" for missing WEEKDAYS.
    const dayOfWeek = yesterday.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        this.logger.debug(`Skipping Weekend check for Not Updated: ${dateStr}`);
        return; 
    }

    // 3. Get all employees
    const allEmployees = await this.employeeRepo.find();

    // 4. Get all attendance records for Yesterday
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);

    const records = await this.attendanceRepo.find({
        where: { workingDate: Between(startOfDay, endOfDay) } 
    });

    const presentEmployeeIds = records.map(a => a.employeeId);

    // 5. Find Missing Employees
    const missingEmployees = allEmployees.filter(emp => !presentEmployeeIds.includes(emp.employeeId));
    
    // Check if Yesterday was a Holiday
    const holiday = await this.masterHolidayService.findByDate(dateStr);
    const targetStatus = holiday ? AttendanceStatus.HOLIDAY : AttendanceStatus.NOT_UPDATED;

    this.logger.log(`Found ${missingEmployees.length} missing entries on ${dateStr}. Marking as ${targetStatus}`);

    // 6. Bulk Insert Records
    const newRecords = missingEmployees.map(emp => {
        return this.attendanceRepo.create({
            employeeId: emp.employeeId,
            workingDate: new Date(dateStr),
            status: targetStatus,
            totalHours: 0, 
        });
    });

    if (newRecords.length > 0) {
        await this.attendanceRepo.save(newRecords);
        this.logger.log(`Successfully marked ${newRecords.length} records as NOT_UPDATED.`);
    }
  }
  // Run at 11:00 PM on the last day of the month
  @Cron('0 23 28-31 * *')
  async handleMonthlyLeaveUpdate() {
      const today = new Date();
      
      // Check if today is the last day of the month
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      if (tomorrow.getMonth() === today.getMonth()) {
          return; // Not the last day yet
      }

      this.logger.debug('Running Monthly Leave Update...');

      // Get start and end of the current month
      const year = today.getFullYear();
      const month = today.getMonth();
      const startOfMonth = new Date(year, month, 1, 0, 0, 0);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

      // Find all records with status 'Not Updated' or 'Pending' for this month
      const recordsToUpdate = await this.attendanceRepo.find({
          where: [
              { 
                  workingDate: Between(startOfMonth, endOfMonth),
                  status: AttendanceStatus.NOT_UPDATED 
              },
              { 
                  workingDate: Between(startOfMonth, endOfMonth),
                  status: AttendanceStatus.PENDING 
              }
          ]
      });

      this.logger.log(`Found ${recordsToUpdate.length} records to mark as LEAVE for month ${month + 1}-${year}`);

      if (recordsToUpdate.length === 0) return;

      // Update status to LEAVE
      for (const record of recordsToUpdate) {
          record.status = AttendanceStatus.LEAVE;
      }

      await this.attendanceRepo.save(recordsToUpdate);
      this.logger.log(`Successfully updated ${recordsToUpdate.length} records to LEAVE.`);
  }
}
