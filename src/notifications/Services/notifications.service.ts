import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MailService } from '../../common/mail/mail.service';
import { getGeneralNotificationTemplate } from '../../common/mail/templates';
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
          const title = 'Weekly Attendance Reminder';
          const message =
            'Please make sure to update your timesheets for the current week.\n\nRegards,\nAdmin Team';
          const html = getGeneralNotificationTemplate({
            recipientName: emp.fullName || 'Employee',
            title: title,
            message: message,
          });

          await this.mailService.sendMail(emp.email, title, message, html);
          count++;
          // Create Notification
          await this.notificationRepo.save({
            employeeId: emp.employeeId,
            title: title,
            message:
              'Please make sure to update your timesheets for the current week.',
            type: 'alert',
          });

          // Add delay to respect mailtrap rate limits
          await new Promise((resolve) => setTimeout(resolve, 1500));
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
          const title = 'Weekend Attendance Reminder';
          const message =
            'Please make sure to fill in your Friday attendance and any pending work from the week before the weekend starts.\n\nRegards,\nAdmin Team';
          const html = getGeneralNotificationTemplate({
            recipientName: emp.fullName || 'Employee',
            title: title,
            message: message,
          });

          await this.mailService.sendMail(emp.email, title, message, html);
          count++;
          // Create Notification
          await this.notificationRepo.save({
            employeeId: emp.employeeId,
            title: title,
            message:
              'Please make sure to fill in your Friday attendance and any pending work from the week.',
            type: 'alert',
          });

          // Add delay to respect mailtrap rate limits
          await new Promise((resolve) => setTimeout(resolve, 1500));
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

            await this.mailService.sendMail(emp.email, title, message, html);
            count++;

            await this.notificationRepo.save({
              employeeId: emp.employeeId,
              title,
              message:
                'Today is the last working day. Please update all your attendance records.',
              type: 'alert',
            });

            await new Promise((resolve) => setTimeout(resolve, 1500));
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

            await this.mailService.sendMail(emp.email, title, message, html);
            count++;

            await this.notificationRepo.save({
              employeeId: emp.employeeId,
              title,
              message:
                'Last call: You have pending attendance. Update before EOD or days will be marked Absent.',
              type: 'alert',
            });

            await new Promise((resolve) => setTimeout(resolve, 1500));
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

      await this.mailService.sendMail(manager.email, title, message, html);
      this.logger.log(
        `Pending report sent to manager: ${manager.fullName} (${pendingEmployeeNames.length} pending employees).`,
      );

      await new Promise((resolve) => setTimeout(resolve, 1500));
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
}

