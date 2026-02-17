import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MailService } from '../../common/mail/mail.service';
import { getGeneralNotificationTemplate } from '../../common/mail/templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly mailService: MailService,
  ) {}

  async sendWeeklyReminder(): Promise<number> {
    this.logger.log('Starting Weekly Attendance Reminder broadcast...');
    const employees = await this.employeeRepo.find();
    let count = 0;

    for (const emp of employees) {
      if (emp.email) {
        const title = 'Weekly Attendance Reminder';
        const message = 'Please make sure to update your timesheets for the current week.\n\nRegards,\nAdmin Team';
        const html = getGeneralNotificationTemplate({
          recipientName: emp.fullName || 'Employee',
          title: title,
          message: message
        });

        await this.mailService.sendMail(
          emp.email,
          title,
          message,
          html
        );
        count++;
        // Create Notification
        await this.notificationRepo.save({
          employeeId: emp.employeeId,
          title: title,
          message: 'Please make sure to update your timesheets for the current week.',
          type: 'alert',
        });

        // Add delay to respect mailtrap rate limits
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    this.logger.log(`Weekly reminders sent to ${count} employees.`);
    return count;
  }

  async sendMonthEndReminder(): Promise<number> {
    this.logger.log('Starting Month-End Attendance Reminder broadcast...');
    const employees = await this.employeeRepo.find();
    let count = 0;

    for (const emp of employees) {
      if (emp.email) {
        const title = 'Month-End Attendance Reminder';
        const message = 'This is a reminder to ensure all your attendance records for the month are up to date. Please finalize your timesheets.\n\nRegards,\nAdmin Team';
        const html = getGeneralNotificationTemplate({
          recipientName: emp.fullName || 'Employee',
          title: title,
          message: message
        });

        await this.mailService.sendMail(
          emp.email,
          title,
          message,
          html
        );
        count++;
        // Create Notification
        await this.notificationRepo.save({
          employeeId: emp.employeeId,
          title: title,
          message:
            'This is a reminder to ensure all your attendance records for the month are up to date.',
          type: 'alert',
        });

        // Add delay to respect mailtrap rate limits
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    this.logger.log(`Month-end reminders sent to ${count} employees.`);
    return count;
  }

  async sendWeekendReminder(): Promise<number> {
    this.logger.log('Starting Weekend Attendance Reminder broadcast...');
    const employees = await this.employeeRepo.find();
    let count = 0;

    for (const emp of employees) {
      if (emp.email) {
        const title = 'Weekend Attendance Reminder';
        const message =
          'Please make sure to fill in your Friday hours and any pending work from the week before the weekend starts.\n\nRegards,\nAdmin Team';
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
            'Please make sure to fill in your Friday hours and any pending work from the week.',
          type: 'alert',
        });

        // Add delay to respect mailtrap rate limits
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    this.logger.log(`Weekend reminders sent to ${count} employees.`);
    return count;
  }
  async getUnreadNotifications(employeeId: string): Promise<Notification[]> {
    return await this.notificationRepo.find({
      where: { employeeId: employeeId, isRead: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Notification | null> {
    return await this.notificationRepo.findOne({ where: { id } });
  }

  async markAsRead(id: number) {
    return this.notificationRepo.update(id, { isRead: true });
  }

  async markAllAsRead(employeeId: string) {
    return await this.notificationRepo.update(
      { employeeId, isRead: false },
      { isRead: true },
    );
  }

  async createNotification(data: { employeeId: string; title: string; message: string; type?: string }) {
    return await this.notificationRepo.save({
      ...data,
      type: data.type || 'general',
      isRead: false,
    });
  }
}
