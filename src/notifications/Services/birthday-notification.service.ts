import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, MoreThanOrEqual } from 'typeorm';
import dayjs from 'dayjs';
import { Readable } from 'stream';

import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MailService } from '../../common/mail/mail.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UserType } from '../../users/enums/user-type.enum';
import { Department } from '../../employeeTimeSheet/enums/department.enum';
import {
  COLLEAGUE_TEMPLATES,
  ColleagueTemplateConfig,
  getColleagueTemplateConfig,
  renderColleagueBirthdayEmail,
  getColleagueBirthdayTemplate,
  getColleagueMailAttachments,
  getFormattedDepartment,
  formatPossessiveName,
} from '../../common/mail/templates/colleague-birthday.template';
import {
  BIRTHDAY_TEMPLATES,
  BirthdayTemplateConfig,
  getBirthdayTemplateConfig,
  getBirthdayTemplateUrl,
  renderBirthdayEmail,
  getBirthdayMailAttachments,
} from '../../common/mail/templates/birthday/birthday.template';
import { SequentialTemplatePicker, ShuffledTemplatePicker } from '../../common/mail/templates/template-picker.util';

/**
 * Standard fields required for birthday wishes and announcements.
 * Centralized to avoid repetitive TypeORM select arrays.
 */
export const EMPLOYEE_BIRTHDAY_SELECT_FIELDS: (keyof EmployeeDetails)[] = [
  'id',
  'employeeId',
  'fullName',
  'email',
  'userStatus',
  'dateOfBirth',
  'gender',
  'department',
  'designation',
  'role',
];

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

  // Strict Sequential 1-to-15 pickers (BRD1 -> BRD15 and C1 -> C15)
  private readonly birthdayPicker = new SequentialTemplatePicker<BirthdayTemplateConfig>(
    () => BIRTHDAY_TEMPLATES,
  );

  private readonly colleaguePicker = new SequentialTemplatePicker<ColleagueTemplateConfig>(
    () => COLLEAGUE_TEMPLATES,
  );

  private isCycleInitialized = false;

  /**
   * Initializes sequential cycle pointers from existing notification history in the DB.
   * Ensures uninterrupted round-robin across server reboots/restarts without resetting to BRD1.
   */
  private async initializeCycleState(): Promise<void> {
    if (this.isCycleInitialized) return;
    this.isCycleInitialized = true;
    try {
      // Find the most recent birthday notification
      const lastBirthdayNotif = await this.notificationRepo.findOne({
        where: { type: Like('BIRTHDAY_BRD%') },
        order: { id: 'DESC' },
      });
      if (lastBirthdayNotif) {
        const match = lastBirthdayNotif.type.match(/BIRTHDAY_(BRD\d+)/i);
        if (match && match[1]) {
          this.birthdayPicker.setLastUsedId(match[1]);
          this.logger.log(`[BIRTHDAY] Resumed sequential birthday template cycle after ${match[1]} (next: ${this.birthdayPicker.peekNext().id})`);
        }
      }

      // Find the most recent colleague notification
      const lastColleagueNotif = await this.notificationRepo.findOne({
        where: { type: Like('COLLEAGUE_BIRTHDAY_%') },
        order: { id: 'DESC' },
      });
      if (lastColleagueNotif && lastColleagueNotif.message) {
        const match = lastColleagueNotif.message.match(/<!-- template:(C\d+) -->/i);
        if (match && match[1]) {
          this.colleaguePicker.setLastUsedId(match[1]);
          this.logger.log(`[BIRTHDAY] Resumed sequential colleague template cycle after ${match[1]} (next: ${this.colleaguePicker.peekNext().id})`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`[BIRTHDAY] Notice: Could not read prior template state from DB: ${err.message}`);
    }
  }

  // Circuit breaker for MinIO / S3 storage to eliminate 42s connection timeouts when offline
  private lastStorageFailureTime = 0;
  private readonly STORAGE_RETRY_INTERVAL_MS = 60000;

  /**
   * Resolves the next template using strict sequential order (BRD1 -> BRD2 -> ... -> BRD15 -> BRD1).
   * Guarantees all 15 templates are delivered in order.
   */
  async getNextBirthdayTemplate(employeeId?: string): Promise<BirthdayTemplateConfig> {
    await this.initializeCycleState();
    return this.birthdayPicker.getNext(employeeId);
  }

  /**
   * Resolves the next colleague template using strict sequential order (C1 -> C2 -> ... -> C15 -> C1).
   */
  async getNextColleagueTemplate(employeeId?: string): Promise<ColleagueTemplateConfig> {
    await this.initializeCycleState();
    return this.colleaguePicker.getNext(employeeId);
  }

  /**
   * Ensures an employee entity has complete fields (department, gender, etc.) from the DB.
   */
  private async enrichEmployeeIfNeeded(emp: EmployeeDetails): Promise<EmployeeDetails> {
    if ((!emp.department || !emp.gender) && emp.employeeId) {
      const full = await this.employeeRepo.findOne({
        where: { employeeId: emp.employeeId },
        select: EMPLOYEE_BIRTHDAY_SELECT_FIELDS,
      });
      if (full) return full;
    }
    return emp;
  }

  /**
   * Extracts employee profile picture from the object_store table.
   * Includes circuit-breaker and fast 2s timeout so the API responds instantly
   * even if the remote MinIO / S3 storage is unreachable.
   */
  async getProfilePhotoBuffer(employeeDbId: number): Promise<{ buffer: Buffer; mime: string } | null> {
    if (!this.documentUploaderService || !employeeDbId) return null;
    if (Date.now() - this.lastStorageFailureTime < this.STORAGE_RETRY_INTERVAL_MS) {
      return null;
    }
    try {
      const docs = await this.documentUploaderService.getAllDocs(
        EntityType.EMPLOYEE,
        employeeDbId,
        ReferenceType.EMPLOYEE_PROFILE_PHOTO,
        employeeDbId,
      );

      if (!docs || docs.length === 0) return null;

      // Sort by creation date descending to pick the latest profile image
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest = docs[0];

      // Download with 2-second timeout to prevent 42s hanging on unavailable storage
      const downloadPromise = this.documentUploaderService.downloadFile(latest.key);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Storage download timed out')), 2000),
      );
      const stream: any = await Promise.race([downloadPromise, timeoutPromise]);
      if (!stream?.Body) return null;

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

      const meta = await this.documentUploaderService.getMetaData(latest.key);
      const mime = meta?.mimetype || 'image/jpeg';

      return { buffer, mime };
    } catch (err) {
      this.lastStorageFailureTime = Date.now();
      this.logger.debug(`Could not extract profile picture from object_store for employee ${employeeDbId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Sends birthday wish to an active employee whose birthday is today.
   * Extracts only name and email from employee_details, fetches profile picture from object_store,
   * cycles through the 12 templates, and renders the email with MJML.
   */
  async sendBirthdayWish(
    employeeIdOrEmp: string | EmployeeDetails,
    force = false,
    templateOverride?: string | number,
  ): Promise<{
    success: boolean;
    employeeId: string;
    fullName: string;
    email?: string;
    emailSent: boolean;
    templateUsed?: string;
    templateName?: string;
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
        select: EMPLOYEE_BIRTHDAY_SELECT_FIELDS,
      });
      if (!emp) {
        throw new NotFoundException(`Employee with ID "${employeeIdOrEmp}" not found`);
      }
    } else {
      emp = await this.enrichEmployeeIfNeeded(employeeIdOrEmp);
    }

    // Verify active status
    if (emp.userStatus !== UserStatus.ACTIVE && emp.userStatus !== ('ACTIVE' as any)) {
      return {
        success: false,
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        email: emp.email,
        emailSent: false,
        notificationCreated: false,
        message: `Employee ${emp.fullName} is inactive (${emp.userStatus}). Skipping birthday wish.`,
      };
    }

    // Deduplication check: do not send twice on the same day (same logic as before)
    const startOfToday = dayjs().startOf('day').toDate();
    if (!force) {
      const alreadySent = await this.notificationRepo.findOne({
        where: [
          {
            employeeId: emp.employeeId,
            title: Like(`%Birthday%`),
            createdAt: MoreThanOrEqual(startOfToday),
          },
          {
            employeeId: emp.employeeId,
            type: Like(`%BIRTHDAY%`),
            createdAt: MoreThanOrEqual(startOfToday),
          },
        ],
      });

      if (alreadySent) {
        this.logger.log(`[BIRTHDAY] Wish already sent to ${emp.fullName} (${emp.employeeId}) today. Skipping.`);
        return {
          success: true,
          employeeId: emp.employeeId,
          fullName: emp.fullName,
          email: emp.email,
          emailSent: false,
          notificationCreated: false,
          message: `Birthday wish already sent to ${emp.fullName} today. Skipped.`,
        };
      }
    }

    // Resolve next template in the 1-to-15 shuffled round-robin cycle
    let selectedTemplate: BirthdayTemplateConfig;
    if (templateOverride) {
      selectedTemplate = getBirthdayTemplateConfig(templateOverride);
    } else {
      selectedTemplate = await this.getNextBirthdayTemplate(emp.employeeId);
    }

    this.logger.log(
      `[BIRTHDAY] Sending birthday wish to ${emp.fullName} (${emp.email}) using template ${selectedTemplate.id} (${selectedTemplate.name})`,
    );

    // Save in-app notification
    const notificationTitle = `🎂 Happy Birthday, ${emp.fullName}!`;
    const notificationMessage = `Wishing you a wonderful birthday, ${emp.fullName}! ${selectedTemplate.message} 🎉 — Worksphere Team <!-- template:${selectedTemplate.id} -->`;

    const notif = await this.notificationRepo.save({
      employeeId: emp.employeeId,
      title: notificationTitle,
      message: notificationMessage,
      type: `BIRTHDAY_${selectedTemplate.id}`,
      isRead: false,
    });

    // Extract profile picture from object_store
    let photoAttachment: any = null;
    let hasPhoto = false;
    let photoUrl: string | undefined;

    if (emp.id) {
      const photoData = await this.getProfilePhotoBuffer(emp.id);
      if (photoData) {
        hasPhoto = true;
        photoAttachment = photoData.buffer;
        photoUrl = 'cid:profile-photo';
        this.logger.log(`[BIRTHDAY] Attached profile photo from object_store for ${emp.fullName}`);
      }
    }

    // Zero MIME attachments for template: Guarantees Gmail never renders attachment chips or hover download buttons
    let emailSent = false;
    if (emp.email && emp.email.trim() !== '') {
      const subject = `Happy Birthday, ${emp.fullName}! 🎉 | InvenTech`;

      const cdnUrl = getBirthdayTemplateUrl(selectedTemplate.file);
      const html = await renderBirthdayEmail({
        fullName: emp.fullName,
        email: emp.email,
        gender: emp.gender,
        photoUrl: hasPhoto ? 'cid:profile-photo' : undefined,
        hasPhoto,
        templateId: selectedTemplate.id,
        templateUrl: cdnUrl,
      });

      const plain = `Dear ${emp.fullName},\n\nWishing you a very Happy Birthday!\n\n${selectedTemplate.message}\n\nWarmest Regards,\nWorksphere Team\nInvenTech Info Solutions`;

      // Inline attachments: Provides local CID embedding (ultra-lightweight ~180KB JPEG)
      // Guarantees Outlook NEVER displays "Images and scripts have been blocked. [Show content]"
      // And renders simultaneously with zero lag across both Outlook and Gmail.
      const attachments = getBirthdayMailAttachments(
        selectedTemplate.id,
        hasPhoto && photoAttachment ? photoAttachment : undefined,
        'image/jpeg',
      );

      try {
        await this.mailService.sendMailAsync(
          emp.email,
          subject,
          plain,
          html,
          undefined,
          undefined,
          attachments,
        );
        emailSent = true;
        this.logger.log(`[BIRTHDAY] Email queued for ${emp.fullName} <${emp.email}>`);
      } catch (err) {
        this.logger.error(`[BIRTHDAY] Failed to queue email for ${emp.email}: ${err?.message}`);
      }
    } else {
      this.logger.warn(`[BIRTHDAY] No email found for active employee ${emp.fullName} (${emp.employeeId})`);
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
      fullName: emp.fullName,
      email: emp.email,
      emailSent,
      templateUsed: selectedTemplate.id,
      templateName: selectedTemplate.name,
      notificationCreated: !!notif,
      message: `Birthday wish sent successfully to ${emp.fullName} using template ${selectedTemplate.id} (${selectedTemplate.name})`,
    };
  }

  /**
   * Broadcasts birthday announcement email to all colleagues across the company.
   * - Uses dedicated colleague Canva templates (C1 through C15 in src/assets/colleague_templates).
   * - Dynamically pulls employee details, department, and role from the database.
   * - Excludes the birthday employee and anyone else celebrating a birthday today.
   * - Deduplicates via notifications table so colleagues are never spammed twice.
   */
  async notifyColleaguesOfBirthday(birthdayEmp: EmployeeDetails): Promise<number> {
    const today = dayjs();
    const currentMonth = today.month();
    const currentDate = today.date();
    const startOfToday = today.startOf('day').toDate();

    const celebrant = await this.enrichEmployeeIfNeeded(birthdayEmp);

    this.logger.log(
      `[COLLEAGUE_BIRTHDAY] Broadcasting birthday of ${celebrant.fullName} (${celebrant.department || 'General'}) to colleagues...`,
    );

    // 1. Fetch all active employees from the database
    const allEmployees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE } as any,
    });

    // 2. Filter colleagues: active employees & managers, excluding the celebrant, anyone with birthday today, and excluding CEO & General Manager
    const colleagues = allEmployees.filter((emp) => {
      if (!emp.email || emp.email.trim() === '') return false;
      if (emp.employeeId === celebrant.employeeId || emp.id === celebrant.id) return false;

      // Exclude anyone whose birthday is also today
      if (emp.dateOfBirth) {
        const empDob = dayjs(emp.dateOfBirth);
        if (empDob.isValid() && empDob.month() === currentMonth && empDob.date() === currentDate) {
          return false;
        }
      }

      // Explicitly exclude CEO and General Manager (by role, department, employeeId, or designation)
      const isCEO =
        emp.role === UserType.CEO ||
        emp.department === Department.CEO ||
        emp.employeeId?.toUpperCase() === 'CEO' ||
        emp.designation?.toLowerCase().includes('ceo') ||
        emp.designation?.toLowerCase().includes('chief executive officer');

      const isGeneralManager =
        emp.role === UserType.GENERAL_MANAGER ||
        emp.department === Department.GENERAL_MANAGER ||
        emp.employeeId?.toUpperCase() === 'GM' ||
        emp.designation?.toLowerCase().includes('general manager');

      if (isCEO || isGeneralManager) {
        return false;
      }

      return true;
    });

    let sentCount = 0;
    const colleagueTemplate = await this.getNextColleagueTemplate(celebrant.employeeId);
    const deptText = getFormattedDepartment(celebrant.department);
    const celebrantName = formatPossessiveName(celebrant.fullName);
    const birthdayMsg = `Today is ${celebrantName} birthday from ${deptText}, Take a moment to share your warm wishes and make their day even more special. 🎂✨`;

    for (const colleague of colleagues) {
      try {
        // 3. Deduplicate: check if this colleague was already notified about this birthday today
        const alreadyNotified = await this.notificationRepo.findOne({
          where: [
            {
              employeeId: colleague.employeeId,
              title: Like(`%Today is ${celebrant.fullName}'s Birthday%`),
              createdAt: MoreThanOrEqual(startOfToday),
            },
            {
              employeeId: colleague.employeeId,
              title: Like(`%${celebrant.fullName}'s Birthday%`),
              createdAt: MoreThanOrEqual(startOfToday),
            },
            {
              employeeId: colleague.employeeId,
              type: `COLLEAGUE_BIRTHDAY_${celebrant.employeeId}`,
              createdAt: MoreThanOrEqual(startOfToday),
            },
          ],
        });

        if (alreadyNotified) {
          continue;
        }

        // 4. Save in-app notification in database
        const notif = this.notificationRepo.create({
          employeeId: colleague.employeeId,
          title: `🎉 Today is ${celebrantName} Birthday!`,
          message: `${birthdayMsg} <!-- template:${colleagueTemplate.id} -->`,
          type: `COLLEAGUE_BIRTHDAY_${celebrant.employeeId}`,
          isRead: false,
        });
        await this.notificationRepo.save(notif);

        // 5. Generate email using colleague template (C1-C15)
        const html = await renderColleagueBirthdayEmail({
          recipientName: colleague.fullName || 'Colleague',
          birthdayEmployeeName: celebrant.fullName,
          department: celebrant.department,
          designation: celebrant.designation,
          templateId: colleagueTemplate.id,
        });

        const subject = `Today is ${celebrantName} Birthday! 🎂 | InvenTech`;
        const plain = `${birthdayMsg}\n\nThank you\nBest regards\nTeam InvenTech Info Solutions`;

        const colleagueAttachments = getColleagueMailAttachments(colleagueTemplate.id);

        // 6. Queue email asynchronously
        await this.mailService.sendMailAsync(
          colleague.email,
          subject,
          plain,
          html,
          undefined,
          undefined,
          colleagueAttachments && colleagueAttachments.length > 0 ? (colleagueAttachments as any) : undefined,
        );
        sentCount++;
      } catch (err) {
        this.logger.error(
          `[COLLEAGUE_BIRTHDAY] Failed sending colleague wish to ${colleague.email}: ${err?.message || err}`,
        );
      }
    }

    this.logger.log(
      `[COLLEAGUE_BIRTHDAY] Successfully queued ${sentCount} colleague announcements for ${celebrant.fullName}`,
    );
    return sentCount;
  }

  /**
   * Fetches active employees having their birthday today.
   */
  async getTodayBirthdays(): Promise<EmployeeDetails[]> {
    const today = dayjs();
    const currentMonth = today.month();
    const currentDate = today.date();

    const employees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE } as any,
      select: EMPLOYEE_BIRTHDAY_SELECT_FIELDS,
    });

    return employees.filter((emp) => {
      if (!emp.dateOfBirth) return false;
      const dob = dayjs(emp.dateOfBirth);
      if (!dob.isValid()) return false;
      return dob.month() === currentMonth && dob.date() === currentDate;
    });
  }

  /**
   * Daily Cron task execution: checks employee_details table for active employees
   * whose birthday matches today, extracts their name and email, and sends the birthday email.
   */
  async sendDailyBirthdayWishes(force = false): Promise<{
    processed: number;
    sent: number;
    skipped: number;
    recipients: Array<{ employeeId: string; name: string; email?: string }>;
  }> {
    this.logger.log(`[BIRTHDAY] Running daily birthday check (force=${force})...`);

    const eligibleEmployees = await this.getTodayBirthdays();

    let processed = eligibleEmployees.length;
    let sent = 0;
    let skipped = 0;
    const recipients: Array<{ employeeId: string; name: string; email?: string }> = [];

    for (const emp of eligibleEmployees) {
      try {
        const result = await this.sendBirthdayWish(emp, force);
        if (result.emailSent || result.notificationCreated) {
          sent++;
          recipients.push({ employeeId: emp.employeeId, name: emp.fullName, email: emp.email });
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.error(`[BIRTHDAY] Error processing wish for ${emp.fullName}: ${err.message}`, err.stack);
      }
    }

    this.logger.log(`[BIRTHDAY] Daily check complete: ${processed} eligible, ${sent} sent, ${skipped} skipped.`);
    return { processed, sent, skipped, recipients };
  }
}

