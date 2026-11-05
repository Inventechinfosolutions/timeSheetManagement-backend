import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, MoreThanOrEqual } from 'typeorm';
import dayjs from 'dayjs';
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MailService } from '../../common/mail/mail.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UserType } from '../../users/enums/user-type.enum';
import { Department } from '../../employeeTimeSheet/enums/department.enum';
import { getBirthdayNotificationTemplate, getColleagueBirthdayTemplate } from '../../common/mail/templates';

@Injectable()
export class BirthdayNotificationService {
  private readonly logger = new Logger(BirthdayNotificationService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly mailService: MailService,
    private readonly documentUploaderService?: DocumentUploaderService,
  ) {}

  /**
   * Send birthday wish to a single employee.
   * Saves an in-app notification in the DB and sends a rich HTML email.
   * Also broadcasts colleague notification to active employees.
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

    // Broadcast announcement to all colleagues (excluding birthday employees)
    try {
      await this.notifyColleaguesOfBirthday(emp);
    } catch (colleagueErr) {
      this.logger.error(
        `[BIRTHDAY] Failed to notify colleagues for ${emp.fullName}: ${colleagueErr?.message || colleagueErr}`,
      );
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
   * CEO, General Manager, and Manager do not get the colleague birthday mail.
   * Matched on role, department, employee id, and designation so a mismatched
   * role string still keeps them out before production.
   */
  private isLeadershipExcludedFromColleagueMail(emp: EmployeeDetails): boolean {
    const role = String(emp.role || '').trim().toUpperCase();
    const department = String(emp.department || '').trim().toLowerCase();
    const designation = String(emp.designation || '').trim().toLowerCase();
    const employeeId = String(emp.employeeId || '').trim().toUpperCase();

    const isCEO =
      role === UserType.CEO ||
      department === Department.CEO.toLowerCase() ||
      department === 'ceo' ||
      employeeId === 'CEO' ||
      designation.includes('ceo') ||
      designation.includes('chief executive');

    const isGeneralManager =
      role === UserType.GENERAL_MANAGER ||
      role === 'GENERAL MANAGER' ||
      department === Department.GENERAL_MANAGER.toLowerCase() ||
      employeeId === 'GM' ||
      designation.includes('general manager');

    // Managers get their own employee birthday mail, not the colleague announcement.
    const isManager =
      !isGeneralManager &&
      (role === UserType.MANAGER ||
        role.includes('MNG') ||
        designation === 'manager' ||
        designation.includes('manager'));

    return isCEO || isGeneralManager || isManager;
  }

  /**
   * Broadcasts birthday announcement email to all colleagues across the company.
   * - Uses baseLayout with Worksphere header and footer.
   * - Dynamically pulls employee details, department, and role from the database.
   * - Excludes the birthday employee and anyone else celebrating a birthday today.
   * - Colleague mail goes only to active employees (and other non-leadership roles).
   * - CEO, General Manager, and Manager do not receive the colleague announcement.
   *   Their own birthday still uses the employee birthday mail.
   * - Deduplicates via notifications table so colleagues are never spammed twice.
   */
  async notifyColleaguesOfBirthday(birthdayEmp: EmployeeDetails): Promise<number> {
    const today = dayjs();
    const currentMonth = today.month();
    const currentDate = today.date();
    const startOfToday = today.startOf('day').toDate();

    this.logger.log(
      `[COLLEAGUE_BIRTHDAY] Broadcasting birthday of ${birthdayEmp.fullName} (${birthdayEmp.department || 'General'}) to colleagues...`,
    );

    // 1. Fetch all active employees from the database
    const allEmployees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE } as any,
    });

    // Colleague mail: active employees only.
    // CEO, General Manager, and Manager are not colleagues for this mail.
    // If it is their birthday, sendBirthdayWish still sends the employee birthday mail.
    const colleagues = allEmployees.filter((emp) => {
      if (!emp.email || emp.email.trim() === '') return false;

      // Exclude self (the celebrant)
      if (emp.employeeId === birthdayEmp.employeeId || emp.id === birthdayEmp.id) {
        return false;
      }

      // Exclude anyone whose birthday is also today
      if (emp.dateOfBirth) {
        const empDob = dayjs(emp.dateOfBirth);
        if (empDob.isValid() && empDob.month() === currentMonth && empDob.date() === currentDate) {
          return false;
        }
      }

      if (this.isLeadershipExcludedFromColleagueMail(emp)) {
        return false;
      }

      return true;
    });

    let sentCount = 0;

    for (const colleague of colleagues) {
      try {
        // 3. Deduplicate: check if this colleague was already notified about this birthday today
        const alreadyNotified = await this.notificationRepo.findOne({
          where: {
            employeeId: colleague.employeeId,
            title: Like(`%${birthdayEmp.fullName}%Birthday%`),
            createdAt: MoreThanOrEqual(startOfToday),
          },
        });

        if (alreadyNotified) {
          continue;
        }

        // 4. Save in-app notification in database
        const rawDept = birthdayEmp.department || 'our';
        const deptText = rawDept.toLowerCase().includes('department') ? rawDept : `${rawDept} department`;
        const birthdayMsg = `Today is your colleague ${birthdayEmp.fullName}'s birthday from the ${deptText}! Please take a moment to wish them a very happy birthday and share your warm wishes to make their day special.`;

        const notif = this.notificationRepo.create({
          employeeId: colleague.employeeId,
          title: `🎉 Today is ${birthdayEmp.fullName}'s Birthday!`,
          message: birthdayMsg,
          type: 'COLLEAGUE_BIRTHDAY',
          isRead: false,
        });
        await this.notificationRepo.save(notif);

        // 5. Generate email using base layout and dynamic DB data
        const html = getColleagueBirthdayTemplate({
          recipientName: colleague.fullName || 'Colleague',
          birthdayEmployeeName: birthdayEmp.fullName,
          department: birthdayEmp.department,
          designation: birthdayEmp.designation,
        });

        const subject = `🎂 Today is ${birthdayEmp.fullName}'s Birthday! - Worksphere`;
        const plain = `Dear ${colleague.fullName},\n\n${birthdayMsg}\n\nWarmest Regards,\nWorksphere Team\nInvenTech Info Solutions`;

        // 6. Queue email asynchronously
        await this.mailService.sendMailAsync(colleague.email, subject, plain, html);
        sentCount++;
      } catch (err) {
        this.logger.error(
          `[COLLEAGUE_BIRTHDAY] Failed sending colleague wish to ${colleague.email}: ${err?.message || err}`,
        );
      }
    }

    this.logger.log(
      `[COLLEAGUE_BIRTHDAY] Successfully queued ${sentCount} colleague announcements for ${birthdayEmp.fullName}`,
    );
    return sentCount;
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
