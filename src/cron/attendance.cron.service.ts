import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { EmployeeAttendance } from '../employeeTimeSheet/entities/employeeAttendance.entity';
import { AttendanceStatus } from '../employeeTimeSheet/enums/attendance-status.enum';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping, ManagerMappingStatus } from '../managerMapping/entities/managerMapping.entity';
import { MasterDepartment } from '../master/models/master-department.entity';
import { LockType } from '../master/enums/lock-type.enum';
import { MasterHolidayService } from '../master/service/master-holiday.service';
import { NotificationsService } from '../notifications/Services/notifications.service';
import { UserStatus } from '../users/enums/user-status.enum';
import { MonthStatus } from '../employeeTimeSheet/enums/month-status.enum';

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

    @InjectRepository(MasterDepartment)
    private departmentRepo: Repository<MasterDepartment>,

    private readonly masterHolidayService: MasterHolidayService,
    private readonly notificationsService: NotificationsService,
  ) { }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns true if today is the last working day of the month.
   * If the true last calendar day falls on a weekend or public holiday,
   * the previous working day becomes the "last working day".
   */
  private async isLastWorkingDayOfMonth(): Promise<boolean> {
    const today = new Date();

    // 1. If today itself is a weekend or holiday, it cannot be a working day.
    const todayIsWeekend = today.getDay() === 0 || today.getDay() === 6;
    const todayDateStr = dayjs(today).format('YYYY-MM-DD');
    const todayIsHoliday = !!(await this.masterHolidayService.findByDate(todayDateStr));

    if (todayIsWeekend || todayIsHoliday) {
      return false;
    }

    // 2. Start from the strict calendar last day of the current month
    let check = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // 3. Walk backward from the last calendar day to find the true last working day
    while (true) {
      const isWeekend = check.getDay() === 0 || check.getDay() === 6;
      const dateStr = dayjs(check).format('YYYY-MM-DD');
      const isHoliday = !!(await this.masterHolidayService.findByDate(dateStr));

      if (!isWeekend && !isHoliday) {
        // We found the very last true working day of the month!
        break;
      }

      // Keep stepping backward
      check.setDate(check.getDate() - 1);
    }

    // 4. Return true only if today exactly matches that found last working day
    return check.getDate() === today.getDate();
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
      where: { monthStatus: MonthStatus.PENDING, userStatus: UserStatus.ACTIVE } as any,
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
        where: { employeeId: mapping.employeeId, monthStatus: MonthStatus.PENDING, userStatus: UserStatus.ACTIVE } as any,
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
        where: { fullName: managerName, userStatus: UserStatus.ACTIVE } as any,
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
    const dateStr = dayjs(today).format('YYYY-MM-DD'); // "YYYY-MM-DD"

    // 2. Check if it is a Weekend using Master Service
    const isWeekend = this.masterHolidayService.isWeekend(today);

    if (!isWeekend) {
      return;
    }
    // 3. Get all Active employees
    const allEmployees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE },
    });
    // 4. Get all attendance records for Today
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);

    const records = await this.attendanceRepo.find({
      where: { workingDate: Between(startOfDay, endOfDay) },
    });

    // 5. Find Employees with NO record today OR a record with NULL status
    const presentRecordIds = new Set(records.filter(r => r.status !== null && r.status !== undefined).map(r => r.employeeId));

    // Employees needing a new record
    const employeesNeedingRecord = allEmployees.filter((emp) => {
      // 1. Must not already have a record
      const hasRecord = records.some((r) => r.employeeId === emp.employeeId);
      if (hasRecord) return false;

      // 2. Must not be inactive on this specific date
      if (emp.inactiveDate) {
        const inactiveDate = dayjs(emp.inactiveDate).startOf('day');
        const processingDate = dayjs(today).startOf('day');
        if (
          processingDate.isSame(inactiveDate) ||
          processingDate.isAfter(inactiveDate)
        ) {
          return false;
        }
      }
      return true;
    });

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
        firstHalf: AttendanceStatus.WEEKEND,
        secondHalf: AttendanceStatus.WEEKEND,
        totalHours: null,
      });
    });

    // Update NULL status records
    for (const record of nullStatusRecords) {
      record.status = AttendanceStatus.WEEKEND;
      record.firstHalf = AttendanceStatus.WEEKEND;
      record.secondHalf = AttendanceStatus.WEEKEND;
      record.totalHours = null;
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
    const dateStr = dayjs(yesterday).format('YYYY-MM-DD'); // "YYYY-MM-DD"

    // 2. Identify Weekends (Skip Saturday=6, Sunday=0) for "Not Updated" logic
    const dayOfWeek = yesterday.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      this.logger.debug(
        `Skipping Weekend check for Not Updated: ${dateStr}`,
      );
      return;
    }

    // 3. Get all Active employees
    const allEmployees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE },
    });

    // 4. Get all attendance records for Yesterday
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);

    const records = await this.attendanceRepo.find({
      where: { workingDate: Between(startOfDay, endOfDay) },
    });

    // 5. Find Missing Employees OR Records with NULL status
    const employeesNeedingRecord = allEmployees.filter((emp) => {
      // 1. Must not already have a record
      const hasRecord = records.some((r) => r.employeeId === emp.employeeId);
      if (hasRecord) return false;

      // 2. Must not be inactive on this specific date (Yesterday)
      if (emp.inactiveDate) {
        const inactiveDate = dayjs(emp.inactiveDate).startOf('day');
        const processingDate = dayjs(yesterday).startOf('day');
        if (
          processingDate.isSame(inactiveDate) ||
          processingDate.isAfter(inactiveDate)
        ) {
          return false;
        }
      }
      return true;
    });

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
        firstHalf: targetStatus,
        secondHalf: targetStatus,
        totalHours: null,
      });
    });

    for (const record of nullStatusRecords) {
      record.status = targetStatus;
      record.firstHalf = targetStatus;
      record.secondHalf = targetStatus;
      record.totalHours = null;
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

  // 1st of every month at 6:00 AM. Previous month for ALL active employees.
  @Cron('0 6 1 * *')
  async handleMonthlyLeaveUpdate() {
    const start = dayjs().subtract(1, 'month').startOf('month');
    const end = dayjs().subtract(1, 'month').endOf('month');
    const allActive = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE },
    });
    const allActiveEmployeeIds = allActive.map((emp) => emp.employeeId);

    this.logger.log(
      `Running Monthly Lock for ${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')} (${allActiveEmployeeIds.length} active employees)...`,
    );

    if (allActiveEmployeeIds.length === 0) {
      return {
        message: 'Monthly lock skipped: no active employees',
        from: start.format('YYYY-MM-DD'),
        to: end.format('YYYY-MM-DD'),
        employees: 0,
        locked: 0,
        created: 0,
        updated: 0,
      };
    }

    const result = await this.lockWorkdaysForEmployees(
      allActiveEmployeeIds,
      start,
      end,
    );
    this.logger.log(
      `Monthly lock: locked=${result.locked} created=${result.created} updated=${result.updated}`,
    );
    return {
      message: 'Monthly lock cron completed',
      from: start.format('YYYY-MM-DD'),
      to: end.format('YYYY-MM-DD'),
      employees: allActiveEmployeeIds.length,
      ...result,
    };
  }

  /**
   * Sunday 6:00 AM weekly lock. Weekly departments only.
   * Last month + this month past weeks (current week is not locked).
   */
  @Cron('0 6 * * 0')
  async handleWeeklyLock() {
    const start = dayjs().subtract(1, 'month').startOf('month');
    const end = dayjs().startOf('week').subtract(1, 'day');
    const weeklyEmployeeIds = await this.getEmployeeIdsWithLockType(
      LockType.WEEKLY,
    );

    this.logger.log(
      `Running Weekly Lock for ${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')} (${weeklyEmployeeIds.length} employees)...`,
    );

    if (weeklyEmployeeIds.length === 0) {
      return {
        message: 'Weekly lock skipped: no Weekly employees',
        from: start.format('YYYY-MM-DD'),
        to: end.format('YYYY-MM-DD'),
        employees: 0,
        locked: 0,
        created: 0,
        updated: 0,
      };
    }

    const result = await this.lockWorkdaysForEmployees(
      weeklyEmployeeIds,
      start,
      end,
    );
    this.logger.log(
      `Weekly lock: locked=${result.locked} created=${result.created} updated=${result.updated}`,
    );
    return {
      message: 'Weekly lock cron completed',
      from: start.format('YYYY-MM-DD'),
      to: end.format('YYYY-MM-DD'),
      employees: weeklyEmployeeIds.length,
      ...result,
    };
  }

  private isOpenForLock(status: AttendanceStatus | null | undefined): boolean {
    return (
      !status ||
      status === AttendanceStatus.NOT_UPDATED ||
      status === AttendanceStatus.PENDING
    );
  }

  private async lockWorkdaysForEmployees(
    employeeIds: string[],
    start: dayjs.Dayjs,
    end: dayjs.Dayjs,
  ): Promise<{ locked: number; created: number; updated: number }> {
    if (employeeIds.length === 0) {
      return { locked: 0, created: 0, updated: 0 };
    }

    const today = dayjs().startOf('day');
    const rangeStart = start.startOf('day');
    const rangeEnd = end.endOf('day');
    const startStr = rangeStart.format('YYYY-MM-DD');
    const endStr = rangeEnd.format('YYYY-MM-DD');

    const existing = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('a.workingDate BETWEEN :start AND :end', {
        start: startStr,
        end: endStr,
      })
      .getMany();

    const byKey = new Map<string, EmployeeAttendance>();
    existing.forEach((row) => {
      const dateKey = dayjs(row.workingDate).format('YYYY-MM-DD');
      byKey.set(`${row.employeeId}|${dateKey}`, row);
    });

    const holidays = await this.masterHolidayService.findByDateRange(
      startStr,
      endStr,
    );
    const holidaySet = new Set(
      (holidays || []).map((h: any) => dayjs(h.date).format('YYYY-MM-DD')),
    );

    const toSave: EmployeeAttendance[] = [];
    let created = 0;
    let updated = 0;

    for (const employeeId of employeeIds) {
      let cursor = rangeStart.clone();
      while (
        cursor.isBefore(today) &&
        (cursor.isBefore(rangeEnd, 'day') || cursor.isSame(rangeEnd, 'day'))
      ) {
        const dateStr = cursor.format('YYYY-MM-DD');
        const dayOfWeek = cursor.day();
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
          const key = `${employeeId}|${dateStr}`;
          const row = byKey.get(key);
          if (!row) {
            toSave.push(
              this.attendanceRepo.create({
                employeeId,
                workingDate: new Date(`${dateStr}T00:00:00`),
                status: AttendanceStatus.LOCKED,
                firstHalf: AttendanceStatus.LOCKED,
                secondHalf: AttendanceStatus.LOCKED,
                totalHours: null,
                workLocation: null,
              }),
            );
            created += 1;
          } else if (this.isOpenForLock(row.status)) {
            row.status = AttendanceStatus.LOCKED;
            row.firstHalf = AttendanceStatus.LOCKED;
            row.secondHalf = AttendanceStatus.LOCKED;
            row.totalHours = null;
            row.workLocation = null;
            toSave.push(row);
            updated += 1;
          }
        }
        cursor = cursor.add(1, 'day');
      }
    }

    if (toSave.length > 0) {
      await this.attendanceRepo.save(toSave);
    }

    return { locked: toSave.length, created, updated };
  }

  private async getEmployeeIdsWithLockType(
    lockType: LockType,
  ): Promise<string[]> {
    const departments = await this.departmentRepo.find();
    const monthlyNames = new Set(
      departments
        .filter((d) => d.lockType === LockType.MONTHLY)
        .map((d) => (d.departmentName || '').trim().toLowerCase()),
    );
    const allActive = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE },
    });
    return allActive
      .filter((emp) => {
        const dept = (emp.department || '').toString().trim().toLowerCase();
        const isMonthly = !!dept && monthlyNames.has(dept);
        return lockType === LockType.MONTHLY ? isMonthly : !isMonthly;
      })
      .map((emp) => emp.employeeId);
  }

  // Run at 6:00 PM every Friday (Weekend Reminder)
  @Cron('0 18 * * 5')
  async weekendReminder() {
    this.logger.debug('Running Weekend Reminder...');
    await this.notificationsService.sendWeekendReminder();
  }
}
