import { Injectable, Logger, InternalServerErrorException, NotFoundException, HttpException } from '@nestjs/common';
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
    const METHOD = 'sendWeeklyReminder';
    this.logger.log(`[${METHOD}] Started weekly attendance reminder broadcast`);
    
    try {
      // STEP 1: Fetching all employees
      this.logger.debug(`[${METHOD}][STEP 1] Fetching all employees...`);
      const employees = await this.employeeRepo.find();
      this.logger.debug(`[${METHOD}][STEP 1] Found ${employees.length} employees`);
      
      let count = 0;
      let failedCount = 0;

      // STEP 2: Sending reminders
      this.logger.debug(`[${METHOD}][STEP 2] Sending reminders to employees...`);
      for (const emp of employees) {
        if (emp.email) {
          try {
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
            
            // Create Notification
            await this.notificationRepo.save({
              employeeId: emp.employeeId,
              title: title,
              message: 'Please make sure to update your timesheets for the current week.',
              type: 'alert',
            });
            
            count++;
            // Add delay to respect mailtrap rate limits
            await new Promise((resolve) => setTimeout(resolve, 1500));
          } catch (emailError) {
            failedCount++;
            this.logger.warn(`[${METHOD}][STEP 2] Failed to send reminder to ${emp.email}: ${emailError.message}`);
            // Continue to next employee even if this one fails
          }
        }
      }

      this.logger.log(`[${METHOD}] Completed. Sent: ${count}, Failed: ${failedCount}`);
      return count;
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to send weekly reminders. Error: ${error.message}`, error.stack);
      
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to send weekly reminders');
    }
  }

  async sendMonthEndReminder(): Promise<number> {
    const METHOD = 'sendMonthEndReminder';
    this.logger.log(`[${METHOD}] Started month-end attendance reminder broadcast`);
    
    try {
      // STEP 1: Fetching all employees
      this.logger.debug(`[${METHOD}][STEP 1] Fetching all employees...`);
      const employees = await this.employeeRepo.find();
      this.logger.debug(`[${METHOD}][STEP 1] Found ${employees.length} employees`);
      
      let count = 0;
      let failedCount = 0;

      // STEP 2: Sending reminders
      this.logger.debug(`[${METHOD}][STEP 2] Sending reminders to employees...`);
      for (const emp of employees) {
        if (emp.email) {
          try {
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
            
            // Create Notification
            await this.notificationRepo.save({
              employeeId: emp.employeeId,
              title: title,
              message:
                'This is a reminder to ensure all your attendance records for the month are up to date.',
              type: 'alert',
            });
            
            count++;
            // Add delay to respect mailtrap rate limits
            await new Promise((resolve) => setTimeout(resolve, 1500));
          } catch (emailError) {
            failedCount++;
            this.logger.warn(`[${METHOD}][STEP 2] Failed to send reminder to ${emp.email}: ${emailError.message}`);
            // Continue to next employee even if this one fails
          }
        }
      }

      this.logger.log(`[${METHOD}] Completed. Sent: ${count}, Failed: ${failedCount}`);
      return count;
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to send month-end reminders. Error: ${error.message}`, error.stack);
      
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to send month-end reminders');
    }
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
