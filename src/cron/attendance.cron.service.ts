import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { EmployeeAttendance } from '../employeeTimeSheet/entities/employeeAttendance.entity';
import { AttendanceStatus } from '../employeeTimeSheet/enums/attendance-status.enum';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping, ManagerMappingStatus } from '../managerMapping/entities/managerMapping.entity';
import { MasterHolidayService } from '../master/service/master-holiday.service';
import { NotificationsService } from '../notifications/Services/notifications.service';

@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);

  constructor(
    @InjectRepository(EmployeeAttendance)
    private attendanceRepo: Repository<EmployeeAttendance>,

    @InjectRepository(EmployeeDetails)
    private employeeRepo: Repository<EmployeeDetails>,

    @InjectRepository(ManagerMapping)
    private managerMappingRepo: Repository<ManagerMapping>,

    private readonly masterHolidayService: MasterHolidayService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns true if today is the last working day of the month.
   * If the true last calendar day falls on a weekend or public holiday,
   * the previous working day becomes the "last working day".
   */
  private async isLastWorkingDayOfMonth(): Promise<boolean> {
    const today = new Date();
    let check = new Date(today);
    check.setDate(today.getDate() + 1);

    // Walk forward from tomorrow until we find the next working day
    while (true) {
      const isWeekend = check.getDay() === 0 || check.getDay() === 6;
      const dateStr = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
      const isHoliday = !!(await this.masterHolidayService.findByDate(dateStr));
      if (!isWeekend && !isHoliday) break;
      check.setDate(check.getDate() + 1);
    }

    // If the next working day is in a different month, today is the last working day
    return check.getMonth() !== today.getMonth();
  }

  // ─── Month-End Last-Working-Day Cron Jobs ───────────────────────────────────

  /**
   * 10 AM — Last working day of month
   * Sends a general month-end reminder to ALL active employees.
   */
  @Cron('0 10 * * *')
  async monthEndGeneralReminder() {
    if (!(await this.isLastWorkingDayOfMonth())) return;
    this.logger.debug('Month-End 10AM: Sending general reminder to all employees...');
    const count = await this.notificationsService.sendMonthEndGeneralReminder();
    this.logger.log(`Month-End 10AM: General reminder sent to ${count} employees.`);
  }

  /**
   * 12 PM — Last working day of month
   * Sends a "last call" reminder ONLY to employees whose monthStatus = 'Pending'.
   */
  @Cron('0 12 * * *')
  async monthEndLastCallReminder() {
    if (!(await this.isLastWorkingDayOfMonth())) return;
    this.logger.debug('Month-End 12PM: Sending last-call reminder to pending employees...');

    const pendingEmployees = await this.employeeRepo.find({
      where: { monthStatus: 'Pending', userStatus: 'ACTIVE' } as any,
    });

    this.logger.log(`Month-End 12PM: Found ${pendingEmployees.length} employees with pending status.`);
    const count = await this.notificationsService.sendMonthEndLastCallReminder(pendingEmployees);
    this.logger.log(`Month-End 12PM: Last-call reminder sent to ${count} employees.`);
  }

  /**
   * 1 PM — Last working day of month
   * Sends each manager an email listing their mapped employees who still have monthStatus = 'Pending'.
   */
  @Cron('0 13 * * *')
  async monthEndManagerReport() {
    if (!(await this.isLastWorkingDayOfMonth())) return;
    this.logger.debug('Month-End 1PM: Sending pending-employee reports to managers...');

    // Fetch all active manager mappings
    const mappings = await this.managerMappingRepo.find({
      where: { status: ManagerMappingStatus.ACTIVE },
    });

    // Group pending employee names by manager name
    const managerPendingMap = new Map<string, string[]>();
    for (const mapping of mappings) {
      const emp = await this.employeeRepo.findOne({
        where: { employeeId: mapping.employeeId, monthStatus: 'Pending', userStatus: 'ACTIVE' } as any,
      });
      if (emp) {
        const list = managerPendingMap.get(mapping.managerName) || [];
        list.push(emp.fullName);
        managerPendingMap.set(mapping.managerName, list);
      }
    }

    this.logger.log(`Month-End 1PM: Found ${managerPendingMap.size} managers with pending employees.`);

    // Send one email per manager
    for (const [managerName, pendingList] of managerPendingMap.entries()) {
      const manager = await this.employeeRepo.findOne({
        where: { fullName: managerName, userStatus: 'ACTIVE' } as any,
      });
      if (manager?.email) {
        await this.notificationsService.sendManagerPendingReport(manager, pendingList);
      } else {
        this.logger.warn(`Month-End 1PM: Could not find email for manager "${managerName}"`);
      }
    }

    this.logger.log('Month-End 1PM: Manager reports dispatched.');
  }

  // ─── Existing Cron Jobs ─────────────────────────────────────────────────────

  // Run at 10:00 AM every Saturday
  @Cron('0 10 * * 6')
  async weeklyReminder() {
    this.logger.debug('Running Weekly Reminder...');
    await this.notificationsService.sendWeeklyReminder();
  }

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
    // 3. Get all employees
    const allEmployees = await this.employeeRepo.find();
    // 4. Get all attendance records for Today
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);

    const records = await this.attendanceRepo.find({
      where: { workingDate: Between(startOfDay, endOfDay) },
    });

    // 5. Find Employees with NO record today OR a record with NULL status
    const presentRecordIds = new Set(records.filter(r => r.status !== null && r.status !== undefined).map(r => r.employeeId));
    
    // Employees needing a new record
    const employeesNeedingRecord = allEmployees.filter(
      (emp) => !records.some(r => r.employeeId === emp.employeeId)
    );

    // Existing records with NULL status that need updating
    const nullStatusRecords = records.filter(
      (r) => r.status === null || r.status === undefined
    );

    this.logger.log(
      `Weekend Check: ${employeesNeedingRecord.length} needing new records, ${nullStatusRecords.length} needing status updates on ${dateStr}`,
    );

    // 6. Bulk Insert/Update WEEKEND Records
    const newWeekendRecords = employeesNeedingRecord.map((emp) => {
      return this.attendanceRepo.create({
        employeeId: emp.employeeId,
        workingDate: new Date(dateStr),
        status: AttendanceStatus.WEEKEND,
        totalHours: 0,
      });
    });

    // Update NULL status records
    for (const record of nullStatusRecords) {
        record.status = AttendanceStatus.WEEKEND;
        record.totalHours = 0;
    }

    if (newWeekendRecords.length > 0) {
      await this.attendanceRepo.save(newWeekendRecords);
    }
    
    if (nullStatusRecords.length > 0) {
        await this.attendanceRepo.save(nullStatusRecords);
    }

    if (newWeekendRecords.length > 0 || nullStatusRecords.length > 0) {
      this.logger.log(
        `Successfully processed ${newWeekendRecords.length + nullStatusRecords.length} weekend records.`,
      );
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
    const dayOfWeek = yesterday.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      this.logger.debug(
        `Skipping Weekend check for Not Updated: ${dateStr}`,
      );
      return;
    }

    // 3. Get all employees
    const allEmployees = await this.employeeRepo.find();

    // 4. Get all attendance records for Yesterday
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);

    const records = await this.attendanceRepo.find({
      where: { workingDate: Between(startOfDay, endOfDay) },
    });

    // 5. Find Missing Employees OR Records with NULL status
    const employeesNeedingRecord = allEmployees.filter(
      (emp) => !records.some(r => r.employeeId === emp.employeeId)
    );

    const nullStatusRecords = records.filter(
      (r) => r.status === null || r.status === undefined
    );

    // Check if Yesterday was a Holiday
    const holiday = await this.masterHolidayService.findByDate(dateStr);
    const targetStatus = holiday
      ? AttendanceStatus.HOLIDAY
      : AttendanceStatus.NOT_UPDATED;

    this.logger.log(
      `Found ${employeesNeedingRecord.length} missing and ${nullStatusRecords.length} NULL status entries on ${dateStr}. Marking as ${targetStatus}`,
    );

    // 6. Bulk Insert/Update Records
    const newRecords = employeesNeedingRecord.map((emp) => {
      return this.attendanceRepo.create({
        employeeId: emp.employeeId,
        workingDate: new Date(dateStr),
        status: targetStatus,
        totalHours: 0,
      });
    });

    for (const record of nullStatusRecords) {
        record.status = targetStatus;
        record.totalHours = 0;
    }

    if (newRecords.length > 0) {
      await this.attendanceRepo.save(newRecords);
    }

    if (nullStatusRecords.length > 0) {
        await this.attendanceRepo.save(nullStatusRecords);
    }

    if (newRecords.length > 0 || nullStatusRecords.length > 0) {
      this.logger.log(
        `Successfully marked ${newRecords.length + nullStatusRecords.length} records as ${targetStatus}.`,
      );
    }
  }

  // Run at 11:00 AM on the 1st day of every month to process the previous month's cleanup.
  @Cron('0 11 1 * *')
  async handleMonthlyLeaveUpdate() {
    const today = new Date();
    // Calculate start and end of the PREVIOUS month
    const prevMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const year = prevMonthDate.getFullYear();
    const month = prevMonthDate.getMonth();
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

    this.logger.debug(
      `Running Monthly Leave Update for past month ${month + 1}-${year}...`,
    );

    // Find all records with status 'Not Updated' or 'Pending' for the past month
    const recordsToUpdate = await this.attendanceRepo.find({
      where: [
        {
          workingDate: Between(startOfMonth, endOfMonth),
          status: AttendanceStatus.NOT_UPDATED,
        },
        {
          workingDate: Between(startOfMonth, endOfMonth),
          status: AttendanceStatus.PENDING,
        },
        {
          workingDate: Between(startOfMonth, endOfMonth),
          status: null as any, // Include records with NULL status (cleared leaves)
        },
      ],
    });

    this.logger.log(
      `Found ${recordsToUpdate.length} records to mark as ABSENT for past month ${month + 1}-${year}`,
    );

    if (recordsToUpdate.length === 0) return;

    // Update status and split fields to ABSENT
    for (const record of recordsToUpdate) {
      record.status = AttendanceStatus.ABSENT;
      record.firstHalf = AttendanceStatus.ABSENT;
      record.secondHalf = AttendanceStatus.ABSENT;
      record.totalHours = 0;
    }

    await this.attendanceRepo.save(recordsToUpdate);
    this.logger.log(
      `Successfully updated ${recordsToUpdate.length} records to ABSENT with split field resets.`,
    );
  }

  // Run at 6:00 PM every Friday (Weekend Reminder)
  @Cron('0 18 * * 5')
  async weekendReminder() {
    this.logger.debug('Running Weekend Reminder...');
    await this.notificationsService.sendWeekendReminder();
  }
}
