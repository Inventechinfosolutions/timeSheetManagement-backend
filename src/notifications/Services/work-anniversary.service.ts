import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Like } from 'typeorm';
import dayjs from 'dayjs';

import {
  EntityType,
  ReferenceType,
} from '../../common/document-uploader/models/documentmetainfo.model';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MailService } from '../../common/mail/mail.service';
import {
  getWorkAnniversarySubject,
  getOrdinalSuffix,
} from '../../common/mail/templates';
import { getWorkAnniversaryTemplateMjml } from '../../common/mail/templates/work-anniversary-mjml.template';
import { UserStatus } from '../../users/enums/user-status.enum';

export interface WorkAnniversaryResult {
  success: boolean;
  employeeId: string;
  employeeName: string;
  email?: string;
  years: number;
  emailSent: boolean;
  notificationCreated: boolean;
  message?: string;
}

export interface DailyWorkAnniversarySummary {
  processed: number;
  sent: number;
  skipped: number;
  recipients: Array<{ employeeId: string; name: string; years: number }>;
}

@Injectable()
export class WorkAnniversaryService {
  private readonly logger = new Logger(WorkAnniversaryService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Fetches active employees whose work anniversary is today (and who have completed >= 1 year).
   */
  async getTodayAnniversaries(): Promise<
    Array<{
      employee: EmployeeDetails;
      years: number;
      alreadySentToday: boolean;
      ordinal: string;
      subject: string;
    }>
  > {
    const today = dayjs().startOf('day');
    const currentMonth = today.month();
    const currentDate = today.date();

    const employees = await this.employeeRepo.find({
      where: { userStatus: UserStatus.ACTIVE },
    });

    const anniversaryEmployees: Array<{
      employee: EmployeeDetails;
      years: number;
      alreadySentToday: boolean;
      ordinal: string;
      subject: string;
    }> = [];

    const startOfToday = today.toDate();

    for (const emp of employees) {
      if (!emp.joiningDate) continue;
      const joinedDate = dayjs(emp.joiningDate).startOf('day');
      if (!joinedDate.isValid()) continue;

      let isAnniversaryDay =
        joinedDate.month() === currentMonth && joinedDate.date() === currentDate;

      // Handle leap year joining dates (Feb 29) on non-leap years (celebrate Feb 28)
      if (
        !isAnniversaryDay &&
        joinedDate.month() === 1 &&
        joinedDate.date() === 29 &&
        currentMonth === 1 &&
        currentDate === 28 &&
        dayjs(new Date(today.year(), 1, 29)).month() !== 1
      ) {
        isAnniversaryDay = true;
      }

      if (isAnniversaryDay) {
        const years = today.diff(joinedDate, 'year');
        if (years >= 1) {
          const alreadySent = await this.notificationRepo.findOne({
            where: {
              employeeId: emp.employeeId,
              title: Like(`%Anniversary%`),
              createdAt: MoreThanOrEqual(startOfToday),
            },
          });

          const ordinal = `${years}${getOrdinalSuffix(years)}`;
          const subject = getWorkAnniversarySubject(emp.fullName, years);

          anniversaryEmployees.push({
            employee: emp,
            years,
            alreadySentToday: !!alreadySent,
            ordinal,
            subject,
          });
        }
      }
    }

    return anniversaryEmployees;
  }

  /**
   * Inspect work anniversary details & message preview for any employee.
   */
  async getEmployeeAnniversaryDetails(employeeIdOrEmp: string | EmployeeDetails): Promise<{
    employeeId: string;
    fullName: string;
    email?: string;
    designation?: string;
    department?: string;
    joiningDate: Date | null;
    years: number;
    isAnniversaryToday: boolean;
    alreadySentToday: boolean;
    preview: {
      subject: string;
      notificationTitle: string;
      notificationMessage: string;
    };
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

    const today = dayjs().startOf('day');
    const joiningDate = emp.joiningDate ? dayjs(emp.joiningDate).startOf('day') : null;
    const calculatedYears = joiningDate && joiningDate.isValid() ? today.diff(joiningDate, 'year') : 0;
    const years = Math.max(0, calculatedYears);

    let isAnniversaryToday = false;
    if (joiningDate && joiningDate.isValid()) {
      isAnniversaryToday =
        joiningDate.month() === today.month() &&
        joiningDate.date() === today.date() &&
        years >= 1;
    }

    // Check if notification was already sent today
    const startOfToday = today.toDate();
    const alreadySent = await this.notificationRepo.findOne({
      where: {
        employeeId: emp.employeeId,
        title: Like(`%Anniversary%`),
        createdAt: MoreThanOrEqual(startOfToday),
      },
    });

    const displayYears = years > 0 ? years : 1;
    const ordinal = `${displayYears}${getOrdinalSuffix(displayYears)}`;
    const milestoneTitle = displayYears === 1 ? '1st Work Anniversary' : `${displayYears} Year Work Anniversary`;
    const notificationTitle = `🎉 Happy ${milestoneTitle}!`;
    const notificationMessage = `Congratulations ${emp.fullName}! Today marks your ${ordinal} work anniversary with InvenTech. Thank you for your continued dedication, leadership, and excellence!`;
    const subject = getWorkAnniversarySubject(emp.fullName, displayYears);

    return {
      employeeId: emp.employeeId,
      fullName: emp.fullName,
      email: emp.email,
      designation: emp.designation,
      department: emp.department,
      joiningDate: emp.joiningDate,
      years,
      isAnniversaryToday,
      alreadySentToday: !!alreadySent,
      preview: {
        subject,
        notificationTitle,
        notificationMessage,
      },
    };
  }

  /**
   * Extracts profile photo from database via DocumentUploaderService (matching feature/email implementation).
   * Attempts upload to CDN (uguu.se) for clean URL rendering in Gmail without hover badges,
   * with fallback to inline Base64 CID attachment.
   */
  async extractProfilePhoto(emp: EmployeeDetails): Promise<{
    hasPhoto: boolean;
    photoUrl?: string;
    attachment?: any;
  }> {
    if (!this.documentUploaderService || !emp.id) {
      return { hasPhoto: false };
    }

    try {
      let docs = await this.documentUploaderService.getAllDocs(
        EntityType.EMPLOYEE,
        emp.id,
        ReferenceType.EMPLOYEE_PROFILE_PHOTO,
        emp.id,
      );

      if ((!docs || docs.length === 0) && !isNaN(Number(emp.employeeId))) {
        docs = await this.documentUploaderService.getAllDocs(
          EntityType.EMPLOYEE,
          Number(emp.employeeId),
          ReferenceType.EMPLOYEE_PROFILE_PHOTO,
          Number(emp.employeeId),
        );
      }

      if (!docs || docs.length === 0) {
        return { hasPhoto: false };
      }

      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const stream = await this.documentUploaderService.downloadFile(docs[0].key);
      if (!stream?.Body) {
        return { hasPhoto: false };
      }

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

      // Upload to CDN to serve as clean HTTPS image without Gmail attachment badges or hover buttons
      try {
        const form = new FormData();
        form.append('files[]', buffer, { filename: 'avatar.jpg', contentType: mime });
        const uploadRes = await axios.post('https://uguu.se/upload', form, {
          headers: form.getHeaders(),
          timeout: 6000,
        });

        if (uploadRes.data?.success && uploadRes.data?.files?.[0]?.url) {
          const profilePhotoUrl = uploadRes.data.files[0].url;
          this.logger.log(`[ANNIVERSARY] Profile photo hosted on CDN: ${profilePhotoUrl}`);
          return {
            hasPhoto: true,
            photoUrl: profilePhotoUrl,
            attachment: undefined,
          };
        }
      } catch (upErr) {
        this.logger.warn(`[ANNIVERSARY] CDN upload failed (${upErr?.message}), falling back to inline CID`);
      }

      // Inline Base64 CID attachment fallback (for offline or CDN failure)
      return {
        hasPhoto: true,
        photoUrl: 'cid:anniversary-profile-photo',
        attachment: {
          filename: false,
          content: buffer.toString('base64'),
          encoding: 'base64',
          contentType: mime,
          cid: 'anniversary-profile-photo',
          contentDisposition: 'inline',
        },
      };
    } catch (imgError) {
      this.logger.debug(`Could not load profile photo for ${emp.fullName}: ${imgError?.message}`);
      return { hasPhoto: false };
    }
  }

  /**
   * Send anniversary wish to a specific employee.
   */
  async sendWorkAnniversaryWish(
    employeeIdOrEmp: string | EmployeeDetails,
    force = false,
    forceYears?: number,
  ): Promise<WorkAnniversaryResult> {
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

    if (!emp.joiningDate) {
      throw new BadRequestException(
        `Employee ${emp.fullName} (${emp.employeeId}) does not have a joining date configured.`,
      );
    }

    const today = dayjs().startOf('day');
    const joinedDay = dayjs(emp.joiningDate).startOf('day');
    const calculatedYears = today.diff(joinedDay, 'year');
    const years = forceYears && forceYears > 0 ? forceYears : Math.max(1, calculatedYears);

    // Duplicate check for today
    const startOfToday = today.toDate();
    if (!force) {
      const alreadySent = await this.notificationRepo.findOne({
        where: {
          employeeId: emp.employeeId,
          title: Like(`%Anniversary%`),
          createdAt: MoreThanOrEqual(startOfToday),
        },
      });

      if (alreadySent) {
        this.logger.log(
          `[ANNIVERSARY] Wish already sent to ${emp.fullName} (${emp.employeeId}) today. Skipping duplicate.`,
        );
        return {
          success: true,
          employeeId: emp.employeeId,
          employeeName: emp.fullName,
          email: emp.email,
          years,
          emailSent: false,
          notificationCreated: false,
          message: `Anniversary wish already sent to ${emp.fullName} today`,
        };
      }
    }

    const ordinal = `${years}${getOrdinalSuffix(years)}`;
    const milestoneTitle = years === 1 ? '1st Work Anniversary' : `${years} Year Work Anniversary`;
    const notificationTitle = `🎉 Happy ${milestoneTitle}!`;
    const notificationMessage = `Congratulations ${emp.fullName}! Today marks your ${ordinal} work anniversary with InvenTech. Thank you for your continued dedication, leadership, and excellence!`;

    // 1. In-App Notification
    const notif = await this.notificationRepo.save({
      employeeId: emp.employeeId,
      title: notificationTitle,
      message: notificationMessage,
      type: 'anniversary',
      isRead: false,
    });

    // 2. Celebration Email
    let emailSent = false;
    if (emp.email) {
      // Extract profile photo from DB matching feature/email logic
      const photoResult = await this.extractProfilePhoto(emp);

      const subject = getWorkAnniversarySubject(emp.fullName, years);
      const html = await getWorkAnniversaryTemplateMjml({
        employeeName: emp.fullName,
        employeeId: emp.employeeId,
        designation: emp.designation,
        department: emp.department,
        joiningDate: emp.joiningDate,
        anniversaryDate: new Date(),
        years,
        hasPhoto: photoResult.hasPhoto,
        profilePicUrl: photoResult.photoUrl,
      });

      try {
        await this.mailService.sendMailAsync(
          emp.email,
          subject,
          notificationMessage,
          html,
          undefined,
          undefined,
          photoResult.attachment ? [photoResult.attachment] : undefined,
        );
        emailSent = true;
        this.logger.log(`[ANNIVERSARY] Email queued for ${emp.fullName} <${emp.email}> (${years} year(s))`);
      } catch (mailError) {
        this.logger.error(`[ANNIVERSARY] Failed to queue email for ${emp.email}: ${mailError?.message || mailError}`);
      }
    } else {
      this.logger.warn(`[ANNIVERSARY] No email configured for ${emp.fullName} (${emp.employeeId})`);
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
   * and who has completed >= 1 year, sends the notification & email.
   */
  async sendDailyWorkAnniversaryWishes(force = false): Promise<DailyWorkAnniversarySummary> {
    this.logger.log(`Starting daily work anniversary check (force=${force})...`);
    const todayAnniversaries = await this.getTodayAnniversaries();

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const recipients: Array<{ employeeId: string; name: string; years: number }> = [];

    for (const item of todayAnniversaries) {
      processed++;
      const { employee, years } = item;

      try {
        const result = await this.sendWorkAnniversaryWish(employee, force, years);
        if (result.emailSent || result.notificationCreated) {
          sent++;
          recipients.push({ employeeId: employee.employeeId, name: employee.fullName, years });
          this.logger.log(
            `[ANNIVERSARY] Successfully sent ${years}-year anniversary wish to ${employee.fullName} (${employee.employeeId})`,
          );
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.error(
          `[ANNIVERSARY] Error sending anniversary wish to ${employee.fullName}: ${err.message}`,
          err.stack,
        );
      }
    }

    this.logger.log(
      `Daily work anniversary check completed: ${processed} eligible, ${sent} sent, ${skipped} skipped.`,
    );
    return { processed, sent, skipped, recipients };
  }
}

