import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Like } from 'typeorm';
import dayjs from 'dayjs';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MailService } from '../../common/mail/mail.service';
import {
  getGeneralNotificationTemplate,
  getWorkAnniversaryTemplate,
  getWorkAnniversarySubject,
} from '../../common/mail/templates';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import { UserStatus } from '../../users/enums/user-status.enum';
import { MonthStatus } from '../../employeeTimeSheet/enums/month-status.enum';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepo: Repository<ManagerMapping>,
    private readonly mailService: MailService,
  ) { }

  async sendWeeklyReminder(): Promise<number> {
    this.logger.log('Starting Weekly Attendance Reminder broadcast...');
    try {
      const employees = await this.employeeRepo.find();
      let count = 0;
 
      for (const emp of employees) {
        if (emp.email) {
          const title = 'Weekly Reminder.';
          const message =
            'Please log your hours for this week.\n\nRegards,\nAdmin Team';
          const html = getGeneralNotificationTemplate({
            recipientName: emp.fullName || 'Employee',
            title: title,
            message: message,
          });
 
          await this.mailService.sendMailAsync(emp.email, title, message, html);
          count++;
          // Create Notification
          await this.notificationRepo.save({
            employeeId: emp.employeeId,
            title: title,
            message:
              'Please log your hours for this week.',
            type: 'alert',
          });
 
        }
      }
 
      this.logger.log(`Weekly reminders sent to ${count} employees.`);
      return count;
    } catch (error) {
      this.logger.error(`Failed to send weekly reminders: ${error.message}`, error.stack);
      throw new Error(`Weekly reminder failed: ${error.message}`);
    }
  }
 
  async sendWeekendReminder(): Promise<number> {
    this.logger.log('Starting Weekend Attendance Reminder broadcast...');
    try {
      const employees = await this.employeeRepo.find();
      let count = 0;
 
      for (const emp of employees) {
        if (emp.email) {
          const title = 'Weekend Reminder';
          const message =
            'Please complete your Friday and pending logs for the week.\n\nRegards,\nAdmin Team';
          const html = getGeneralNotificationTemplate({
            recipientName: emp.fullName || 'Employee',
            title: title,
            message: message,
          });
 
          await this.mailService.sendMailAsync(emp.email, title, message, html);
          count++;
          // Create Notification
          await this.notificationRepo.save({
            employeeId: emp.employeeId,
            title: title,
            message:
              'Please complete your Friday and pending logs for the week.',
            type: 'alert',
          });
 
        }
      }
 
      this.logger.log(`Weekend reminders sent to ${count} employees.`);
      return count;
    } catch (error) {
      this.logger.error(`Failed to send weekend reminders: ${error.message}`, error.stack);
      throw new Error(`Weekend reminder failed: ${error.message}`);
    }
  }

  async getUnreadNotifications(employeeId: string): Promise<Notification[]> {
    this.logger.log(`Fetching unread notifications for employee: ${employeeId}`);
    try {
      return await this.notificationRepo.find({
        where: { employeeId: employeeId, isRead: false },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Error fetching notifications for ${employeeId}: ${error.message}`);
      return [];
    }
  }

  async findOne(id: number): Promise<Notification | null> {
    try {
      return await this.notificationRepo.findOne({ where: { id } });
    } catch (error) {
      this.logger.error(`Error finding notification ${id}: ${error.message}`);
      return null;
    }
  }

  async markAsRead(id: number) {
    this.logger.log(`Marking notification ${id} as read`);
    try {
      return await this.notificationRepo.update(id, { isRead: true });
    } catch (error) {
      this.logger.error(`Error marking notification ${id} as read: ${error.message}`);
    }
  }

  async markAllAsRead(employeeId: string) {
    this.logger.log(`Marking all notifications as read for employee: ${employeeId}`);
    try {
      return await this.notificationRepo.update(
        { employeeId, isRead: false },
        { isRead: true },
      );
    } catch (error) {
      this.logger.error(`Error marking all notifications as read for ${employeeId}: ${error.message}`);
    }
  }

  async markByTitleAsRead(employeeId: string, title: string) {
    this.logger.log(`Marking "${title}" notifications as read for employee: ${employeeId}`);
    try {
      return await this.notificationRepo.update(
        { employeeId, title, isRead: false },
        { isRead: true },
      );
    } catch (error) {
      this.logger.error(
        `Error marking "${title}" notifications as read for ${employeeId}: ${error.message}`,
      );
    }
  }

  async createNotification(data: {
    employeeId: string;
    title: string;
    message: string;
    type?: string;
  }) {
    this.logger.log(`Creating notification for ${data.employeeId}: ${data.title}`);
    try {
      return await this.notificationRepo.save({
        ...data,
        type: data.type || 'general',
        isRead: false,
      });
    } catch (error) {
      this.logger.error(`Error creating notification: ${error.message}`);
    }
  }

  /** 10 AM — General reminder sent to ALL active employees */
  async sendMonthEndGeneralReminder(): Promise<number> {
    this.logger.log('Starting Month-End General Reminder (10 AM) broadcast...');
    try {
      const employees = await this.employeeRepo.find({
        where: { userStatus: UserStatus.ACTIVE },
      } as any);
      let count = 0;

      for (const emp of employees) {
        if (emp.email) {
          try {
            const title = 'Month-End Attendance Reminder';
            const message =
              'Today is the last working day of the month.\n\n' +
              'Please ensure all your attendance records are up to date before 11 AM.\n\n' +
              'Regards,\nAdmin Team';
            const html = getGeneralNotificationTemplate({
              recipientName: emp.fullName || 'Employee',
              title,
              message,
            });

            await this.mailService.sendMailAsync(emp.email, title, message, html);
            count++;

            await this.notificationRepo.save({
              employeeId: emp.employeeId,
              title,
              message:
                'Today is the last working day. Please update all your attendance records.',
              type: 'alert',
            });

          } catch (itemError) {
            this.logger.error(`Failed individual reminder for ${emp.email}: ${itemError.message}`);
          }
        }
      }

      this.logger.log(`Month-End General Reminders sent to ${count} employees.`);
      return count;
    } catch (error) {
      this.logger.error(`Month-end general reminder failed: ${error.message}`, error.stack);
      throw new Error(`Month-end general reminder failed: ${error.message}`);
    }
  }

  /** 12 PM — Last call sent only to employees whose monthStatus is still 'Pending' */
  async sendMonthEndLastCallReminder(pendingEmployees: any[]): Promise<number> {
    this.logger.log(
      `Starting Month-End Last-Call Reminder (12 PM) for ${pendingEmployees.length} pending employees...`,
    );
    try {
      let count = 0;

      for (const emp of pendingEmployees) {
        if (emp.email) {
          try {
            const title = 'Last Call: Update Your Attendance Now';
            const message =
              'You still have pending attendance entries for this month.\n\n' +
              'This is your last chance to update them. If not updated by 1 PM, ' +
              'the pending days will be automatically marked as Absent.\n\n' +
              'Please log in and update your attendance immediately.\n\n' +
              'Regards,\nAdmin Team';
            const html = getGeneralNotificationTemplate({
              recipientName: emp.fullName || 'Employee',
              title,
              message,
            });

            await this.mailService.sendMailAsync(emp.email, title, message, html);
            count++;

            await this.notificationRepo.save({
              employeeId: emp.employeeId,
              title,
              message:
                'Last call: You have pending attendance. Update before EOD or days will be marked Absent.',
              type: 'alert',
            });

          } catch (itemError) {
            this.logger.error(`Failed individual last-call for ${emp.email}: ${itemError.message}`);
          }
        }
      }

      this.logger.log(
        `Month-End Last-Call Reminders sent to ${count} employees.`,
      );
      return count;
    } catch (error) {
      this.logger.error(`Month-end last-call failed: ${error.message}`, error.stack);
      throw new Error(`Month-end last-call failed: ${error.message}`);
    }
  }

  /** 1 PM — Sends each manager a list of their pending employees */
  async sendManagerPendingReport(
    manager: any,
    pendingEmployeeNames: string[],
  ): Promise<void> {
    this.logger.log(`Sending pending report to manager: ${manager?.fullName}`);
    try {
      if (!manager?.email || pendingEmployeeNames.length === 0) return;

      const employeeList = pendingEmployeeNames
        .map((name, i) => `${i + 1}. ${name}`)
        .join('\n');

      const title = 'Pending Attendance Report — Your Team';
      const message =
        `The following employee(s) under your team have not yet updated their attendance for this month:\n\n` +
        `${employeeList}\n\n` +
        `Please take necessary actions.\n\n` +
        `Regards,\nAdmin Team`;
      const html = getGeneralNotificationTemplate({
        recipientName: manager.fullName || 'Manager',
        title,
        message,
      });

      await this.mailService.sendMailAsync(manager.email, title, message, html);
      this.logger.log(
        `Pending report sent to manager: ${manager.fullName} (${pendingEmployeeNames.length} pending employees).`,
      );
    } catch (error) {
      this.logger.error(`Error sending manager pending report to ${manager?.email}: ${error.message}`);
    }
  }

  async sendMonthEndLastCallByPending(): Promise<number> {
    this.logger.log('Starting sendMonthEndLastCallByPending');
    try {
      const pendingEmployees = await this.employeeRepo.find({
        where: { monthStatus: MonthStatus.PENDING, userStatus: UserStatus.ACTIVE } as any,
      });
      return await this.sendMonthEndLastCallReminder(pendingEmployees);
    } catch (error) {
      this.logger.error(`sendMonthEndLastCallByPending failed: ${error.message}`, error.stack);
      return 0;
    }
  }

  async sendManagerPendingReportAll(): Promise<void> {
    this.logger.log('Starting sendManagerPendingReportAll');
    try {
      const mappings = await this.managerMappingRepo.find({
        where: { status: ManagerMappingStatus.ACTIVE },
      });

      const managerPendingMap = new Map<string, string[]>();
      for (const mapping of mappings) {
        try {
          const emp = await this.employeeRepo.findOne({
            where: { employeeId: mapping.employeeId, monthStatus: MonthStatus.PENDING, userStatus: UserStatus.ACTIVE } as any,
          });
          if (emp) {
            const list = managerPendingMap.get(mapping.managerName) || [];
            list.push(emp.fullName);
            managerPendingMap.set(mapping.managerName, list);
          }
        } catch (itemError) {
          this.logger.error(`Error processing mapping for ${mapping.employeeId}: ${itemError.message}`);
        }
      }

      for (const [managerName, pendingList] of managerPendingMap.entries()) {
        try {
          const manager = await this.employeeRepo.findOne({
            where: { fullName: managerName, userStatus: UserStatus.ACTIVE } as any,
          });
          if (manager?.email) {
            await this.sendManagerPendingReport(manager, pendingList);
          } else {
            this.logger.warn(`sendManagerPendingReportAll: No email found for manager "${managerName}"`);
          }
        } catch (mgrError) {
          this.logger.error(`Error sending report to manager ${managerName}: ${mgrError.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`sendManagerPendingReportAll failed: ${error.message}`, error.stack);
    }
  }

  // ─── Work Anniversary Notifications & Emails ─────────────────────────────────

  private toYmd(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) return dayjs(val).format('YYYY-MM-DD');
    return String(val).slice(0, 10);
  }

  private nextOccurrence(ymd: string, today: dayjs.Dayjs): dayjs.Dayjs | null {
    const source = dayjs(ymd);
    if (!source.isValid()) return null;
    const build = (year: number) => {
      const daysInMonth = dayjs(new Date(year, source.month(), 1)).daysInMonth();
      const safeDay = Math.min(source.date(), daysInMonth);
      return dayjs(new Date(year, source.month(), safeDay)).startOf('day');
    };
    const thisYear = build(today.year());
    if (!thisYear.isBefore(today, 'day')) return thisYear;
    return build(today.year() + 1);
  }

  /**
   * Send work anniversary wish (specifically 1st year or milestone) to a particular employee.
   * Dispatches both an in-app notification and a styled celebratory HTML email.
   *
   * @param employeeIdOrEmp employee ID string or EmployeeDetails object
   * @param forceYears optional manual override for completed years (defaults to calculation based on joining date)
   */
  async sendWorkAnniversaryWish(
    employeeIdOrEmp: string | EmployeeDetails,
    forceYears?: number,
  ): Promise<{
    success: boolean;
    employeeId: string;
    employeeName: string;
    email?: string;
    years: number;
    emailSent: boolean;
    notificationCreated: boolean;
    message?: string;
  }> {
    let emp: EmployeeDetails | null = null;
    if (typeof employeeIdOrEmp === 'string') {
      emp = await this.employeeRepo.findOne({ where: { employeeId: employeeIdOrEmp } });
      if (!emp) {
        throw new Error(`Employee with ID "${employeeIdOrEmp}" not found`);
      }
    } else {
      emp = employeeIdOrEmp;
    }

    if (!emp.joiningDate) {
      throw new Error(`Employee ${emp.fullName} (${emp.employeeId}) does not have a joining date configured.`);
    }

    const today = dayjs().startOf('day');
    const joinedStr = this.toYmd(emp.joiningDate);
    const joinedDay = dayjs(joinedStr).startOf('day');
    const diffYears = today.diff(joinedDay, 'year');
    const years = forceYears && forceYears > 0 ? forceYears : Math.max(1, diffYears);

    const milestoneTitle = years === 1 ? '1st Work Anniversary' : `${years} Year Work Anniversary`;
    const notificationTitle = `🎉 Happy ${milestoneTitle}!`;
    const notificationMessage = years === 1
      ? `Congratulations ${emp.fullName}! Today marks your 1st work anniversary at InvenTech. Thank you for 1 year (365 days) of incredible dedication, passion, and excellence!`
      : `Congratulations ${emp.fullName}! Celebrating ${years} wonderful years with InvenTech. Thank you for your continued dedication, leadership, and excellence!`;

    // 1. Create In-App Notification in DB
    const notif = await this.notificationRepo.save({
      employeeId: emp.employeeId,
      title: notificationTitle,
      message: notificationMessage,
      type: 'celebration',
      isRead: false,
    });

    // 2. Prepare & Send Rich Email
    let emailSent = false;
    if (emp.email) {
      const subject = getWorkAnniversarySubject(emp.fullName, years);
      const html = getWorkAnniversaryTemplate({
        employeeName: emp.fullName,
        employeeId: emp.employeeId,
        designation: emp.designation,
        department: emp.department,
        joiningDate: emp.joiningDate,
        anniversaryDate: new Date(),
        years,
      });

      await this.mailService.sendMailAsync(
        emp.email,
        subject,
        notificationMessage,
        html,
      );
      emailSent = true;
      this.logger.log(`Anniversary email queued for ${emp.fullName} (${emp.email}) - ${years} year(s) completed`);
    } else {
      this.logger.warn(`Employee ${emp.fullName} (${emp.employeeId}) has no email address configured.`);
    }

    return {
      success: true,
      employeeId: emp.employeeId,
      employeeName: emp.fullName,
      email: emp.email,
      years,
      emailSent,
      notificationCreated: !!notif,
      message: `Anniversary wish sent successfully to ${emp.fullName}`,
    };
  }

  /**
   * Daily check: Checks all active employees. For any employee whose work anniversary is TODAY
   * and who has completed >= 1 year (e.g. 1-year completed), sends the notification & email.
   * Skips employees who already received anniversary wishes this calendar year.
   */
  async sendDailyWorkAnniversaryWishes(): Promise<{
    processed: number;
    sent: number;
    skipped: number;
    recipients: Array<{ employeeId: string; name: string; years: number }>;
  }> {
    this.logger.log('Starting daily work anniversary check for eligible employees...');
    const today = dayjs().startOf('day');
    const startOfYear = today.startOf('year').toDate();

    const employees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE },
    } as any);

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const recipients: Array<{ employeeId: string; name: string; years: number }> = [];

    for (const emp of employees) {
      if (!emp.joiningDate) continue;

      const joinedStr = this.toYmd(emp.joiningDate);
      const next = this.nextOccurrence(joinedStr, today);
      if (!next) continue;

      // Anniversary is today
      if (next.isSame(today, 'day')) {
        const years = next.year() - dayjs(joinedStr).year();
        if (years >= 1) {
          processed++;

          // Duplicate check via notifications table:
          // If a 'Work Anniversary' notification already exists for this employee
          // in the current calendar year, skip sending another one.
          const alreadySent = await this.notificationRepo.findOne({
            where: {
              employeeId: emp.employeeId,
              title: Like(`%Work Anniversary%`),
              createdAt: MoreThanOrEqual(startOfYear),
            },
          });

          if (alreadySent) {
            this.logger.log(`Anniversary wish already sent to ${emp.fullName} (${emp.employeeId}) this year. Skipping.`);
            skipped++;
            continue;
          }

          try {
            await this.sendWorkAnniversaryWish(emp, years);
            sent++;
            recipients.push({ employeeId: emp.employeeId, name: emp.fullName, years });
            this.logger.log(`Successfully sent ${years}-year anniversary wish to ${emp.fullName} (${emp.employeeId})`);
          } catch (err) {
            this.logger.error(`Error sending anniversary wish to ${emp.fullName}: ${err.message}`, err.stack);
          }
        }
      }
    }

    this.logger.log(`Daily work anniversary check completed: ${processed} eligible, ${sent} sent, ${skipped} skipped.`);
    return { processed, sent, skipped, recipients };
  }
}

