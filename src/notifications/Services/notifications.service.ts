import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Readable } from 'stream';
import axios from 'axios';
import FormData from 'form-data';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Like } from 'typeorm';
import dayjs from 'dayjs';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MailService } from '../../common/mail/mail.service';
import {
  getGeneralNotificationTemplate,
  getBirthdayNotificationTemplate,
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
    @Optional()
    private readonly documentUploaderService?: DocumentUploaderService,
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

  // ─── Birthday Notifications & Emails ──────────────────────────────────────

  /**
   * Send birthday wish to a single employee.
   * Saves an in-app notification in the DB and sends a rich HTML email.
   */
  async sendBirthdayWish(
    employeeIdOrEmp: string | EmployeeDetails,
    force = false,
  ): Promise<{
    success: boolean;
    employeeId: string;
    employeeName: string;
    email?: string;
    emailSent: boolean;
    notificationCreated: boolean;
    message?: string;
  }> {
    let emp: EmployeeDetails | null = null;
    if (typeof employeeIdOrEmp === 'string') {
      const trimmed = employeeIdOrEmp.trim();
      const isNum = !isNaN(Number(trimmed));
      emp = await this.employeeRepo.findOne({
        where: isNum
          ? [{ employeeId: trimmed }, { id: Number(trimmed) }]
          : { employeeId: trimmed },
      });
      if (!emp) {
        throw new NotFoundException(`Employee with ID "${employeeIdOrEmp}" not found`);
      }
    } else {
      emp = employeeIdOrEmp;
    }

    // Check if birthday wish was already sent today — do not resend if already in notifications
    const startOfToday = dayjs().startOf('day').toDate();
    if (!force) {
      const alreadySent = await this.notificationRepo.findOne({
        where: {
          employeeId: emp.employeeId,
          title: Like(`%Birthday%`),
          createdAt: MoreThanOrEqual(startOfToday),
        },
      });

      if (alreadySent) {
        this.logger.log(
          `[BIRTHDAY] Wish already sent to ${emp.fullName} (${emp.employeeId}) today. Skipping resend.`,
        );
        return {
          success: true,
          employeeId: emp.employeeId,
          employeeName: emp.fullName,
          email: emp.email,
          emailSent: false,
          notificationCreated: false,
          message: `Birthday wish already sent to ${emp.fullName} today`,
        };
      }
    }

    const today = dayjs().format('DD-MM-YYYY');
    const notificationTitle = `🎂 Happy Birthday, ${emp.fullName}!`;
    const notificationMessage = `Wishing you a wonderful birthday, ${emp.fullName}! May this special day bring you all the joy and happiness. 🎉 — Worksphere Team`;

    // 1. Save in-app notification
    const notif = await this.notificationRepo.save({
      employeeId: emp.employeeId,
      title: notificationTitle,
      message: notificationMessage,
      type: 'success',
      isRead: false,
    });

    // 2. Send rich HTML birthday email
    let emailSent = false;
    if (emp.email) {
      let profilePhotoUrl: string | undefined;
      let photoAttachment: any = undefined;
      let hasPhoto = false;
      try {
        if (this.documentUploaderService && emp.id) {
          const docs = await this.documentUploaderService.getAllDocs(
            EntityType.EMPLOYEE,
            emp.id,
            ReferenceType.EMPLOYEE_PROFILE_PHOTO,
            emp.id,
          );
          if (docs && docs.length > 0) {
            docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const stream = await this.documentUploaderService.downloadFile(docs[0].key);
            if (stream?.Body) {
              let buffer: Buffer;
              if (stream.Body instanceof Readable) {
                const chunks: any[] = [];
                for await (const chunk of stream.Body) chunks.push(chunk);
                buffer = Buffer.concat(chunks);
              } else if (typeof (stream.Body as any).transformToByteArray === 'function') {
                const arr = await (stream.Body as any).transformToByteArray();
                buffer = Buffer.from(arr);
              } else {
                buffer = Buffer.from(stream.Body as any);
              }
              const meta = await this.documentUploaderService.getMetaData(docs[0].key);
              const mime = meta?.mimetype || 'image/jpeg';
              hasPhoto = true;

              // Upload to CDN to serve as clean HTTPS image without Gmail attachment badges or hover buttons
              try {
                const form = new FormData();
                form.append('files[]', buffer, { filename: 'avatar.jpg', contentType: mime });
                const uploadRes = await axios.post('https://uguu.se/upload', form, {
                  headers: form.getHeaders(),
                  timeout: 6000,
                });
                if (uploadRes.data?.success && uploadRes.data?.files?.[0]?.url) {
                  profilePhotoUrl = uploadRes.data.files[0].url;
                  photoAttachment = undefined; // No MIME attachment -> Zero Gmail download/view options!
                  this.logger.log(`[BIRTHDAY] Profile photo hosted on CDN: ${profilePhotoUrl}`);
                }
              } catch (upErr) {
                this.logger.warn(`[BIRTHDAY] CDN upload failed: ${upErr?.message}`);
                profilePhotoUrl = undefined;
                photoAttachment = undefined; // Zero MIME attachments -> Prevents Gmail hover download button!
              }
            }
          }
        }
      } catch (imgError) {
        this.logger.debug(`Could not load profile photo for ${emp.fullName}: ${imgError?.message}`);
      }

      const subject = `🎉 Happy Birthday, ${emp.fullName}! - From Worksphere`;
      const html = getBirthdayNotificationTemplate({
        fullName: emp.fullName,
        designation: emp.designation,
        date: today,
        gender: emp.gender,
        employeeId: emp.employeeId,
        photoUrl: profilePhotoUrl,
        hasPhoto,
      });
      const plain = `Dear ${emp.fullName},\n\nWishing you a wonderful birthday filled with happiness, laughter, and beautiful memories!\n\nMay this special day mark the beginning of an amazing year filled with new opportunities, exciting experiences, good health, and remarkable achievements. Wishing you endless happiness and success in everything you do. Have a fantastic birthday!\n\nWarmest Regards,\nWorksphere Team\nInvenTech Info Solutions`;

      try {
        await this.mailService.sendMailAsync(emp.email, subject, plain, html, undefined, undefined, photoAttachment ? [photoAttachment] : undefined);
        emailSent = true;
        this.logger.log(`[BIRTHDAY] Email queued for ${emp.fullName} <${emp.email}>`);
      } catch (mailError) {
        this.logger.error(`[BIRTHDAY] Failed to queue email for ${emp.email}: ${mailError?.message || mailError}`);
      }
    } else {
      this.logger.warn(`[BIRTHDAY] No email configured for ${emp.fullName} (${emp.employeeId})`);
    }

    return {
      success: true,
      employeeId: emp.employeeId,
      employeeName: emp.fullName,
      email: emp.email,
      emailSent,
      notificationCreated: !!notif,
      message: `Birthday wish sent to ${emp.fullName}`,
    };
  }

  /**
   * Fetches active employees whose birthday matches today.
   */
  async getTodayBirthdays() {
    const today = dayjs();
    const currentMonth = today.month();
    const currentDate = today.date();

    const employees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE } as any,
    });

    return employees.filter((emp) => {
      if (!emp.dateOfBirth) return false;
      const dob = dayjs(emp.dateOfBirth);
      if (!dob.isValid()) return false;
      return dob.month() === currentMonth && dob.date() === currentDate;
    });
  }

  /**
   * Daily birthday check — mirrors sendDailyWorkAnniversaryWishes pattern.
   * Loops all active employees, checks dateOfBirth in employee_details,
   * finds whose birthday is TODAY (month + day match).
   * Deduplicates via DB: if a Birthday notification already exists for
   * this employee today, skips to avoid re-sending.
   */
  async sendDailyBirthdayWishes(force = false): Promise<{
    processed: number;
    sent: number;
    skipped: number;
    recipients: Array<{ employeeId: string; name: string }>;
  }> {
    this.logger.log(`[BIRTHDAY] Starting daily birthday check (force=${force})...`);

    const today = dayjs().startOf('day');
    const startOfToday = today.toDate();

    const employees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE },
    } as any);

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const recipients: Array<{ employeeId: string; name: string }> = [];

    for (const emp of employees) {
      if (!emp.dateOfBirth) continue;

      const dob = dayjs(emp.dateOfBirth);
      if (!dob.isValid()) continue;

      const isBirthdayToday =
        dob.month() === today.month() && dob.date() === today.date();

      if (!isBirthdayToday) continue;

      processed++;

      if (!force) {
        const alreadySent = await this.notificationRepo.findOne({
        where: {
          employeeId: emp.employeeId,
          title: Like(`%Birthday%`),
          createdAt: MoreThanOrEqual(startOfToday),
        },
      });

      if (alreadySent) {
        this.logger.log(
          `[BIRTHDAY] Already sent to ${emp.fullName} (${emp.employeeId}) today. Skipping.`,
        );
        skipped++;
        continue;
      }
      }

      try {
        await this.sendBirthdayWish(emp);
        sent++;
        recipients.push({ employeeId: emp.employeeId, name: emp.fullName });
        this.logger.log(
          `[BIRTHDAY] Successfully sent birthday wish to ${emp.fullName} (${emp.employeeId})`,
        );
      } catch (err) {
        this.logger.error(
          `[BIRTHDAY] Error sending wish to ${emp.fullName}: ${err.message}`,
          err.stack,
        );
      }
    }

    this.logger.log(
      `[BIRTHDAY] Check complete: ${processed} eligible, ${sent} sent, ${skipped} skipped.`,
    );
    return { processed, sent, skipped, recipients };
  }
}
