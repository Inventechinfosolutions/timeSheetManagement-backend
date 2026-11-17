import * as fs from 'fs';
import * as path from 'path';
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
  AnniversaryTheme,
  getAnniversaryTheme,
  getThemeBgImagePath,
  getWorkAnniversaryTemplateMjml,
  getRandomAnniversaryTheme,
  getShuffledRandomThemesForBatch,
} from '../../common/mail/templates';
import { INVENTECH_BRAND } from '../../common/mail/email-templates';
import { generateAnniversaryBannerGif } from '../../common/mail/services/anniversary-gif-generator.service';
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
  themeId?: number;
  themeName?: string;
}

export interface DailyWorkAnniversarySummary {
  processed: number;
  sent: number;
  skipped: number;
  recipients: Array<{
    employeeId: string;
    name: string;
    email?: string;
    years: number;
    emailSent?: boolean;
    notificationCreated?: boolean;
    themeId?: number;
  }>;
}

const ANNIVERSARY_BANNER_CID = 'anniversary-banner';
const ANNIVERSARY_BANNER_FILENAME = 'anniversary-banner.gif';
const ANNIVERSARY_NOTIFICATION_TYPE = 'anniversary';
const COMPANY_DISPLAY_NAME = INVENTECH_BRAND.name;

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

  private async hasSentAnniversaryToday(employeeId: string, startOfToday: Date): Promise<boolean> {
    const existing = await this.notificationRepo.findOne({
      where: [
        {
          employeeId,
          type: ANNIVERSARY_NOTIFICATION_TYPE,
          createdAt: MoreThanOrEqual(startOfToday),
        },
        {
          employeeId,
          title: Like(`%Anniversary%`),
          createdAt: MoreThanOrEqual(startOfToday),
        },
      ],
    });
    return !!existing;
  }

  /**
   * Checks whether `joinedDate` celebrates its work anniversary on `targetDate`,
   * including Feb 29 joining dates on non-leap years (celebrated on Feb 28).
   */
  private isAnniversaryOnDate(joinedDate: dayjs.Dayjs, targetDate: dayjs.Dayjs): boolean {
    if (!joinedDate.isValid() || !targetDate.isValid()) return false;
    if (joinedDate.month() === targetDate.month() && joinedDate.date() === targetDate.date()) {
      return true;
    }
    return (
      joinedDate.month() === 1 &&
      joinedDate.date() === 29 &&
      targetDate.month() === 1 &&
      targetDate.date() === 28 &&
      dayjs(new Date(targetDate.year(), 1, 29)).month() !== 1
    );
  }

  private resolveTheme(employeeId: string, years: number, themeId?: number | string): AnniversaryTheme {
    return themeId
      ? getAnniversaryTheme(themeId)
      : getRandomAnniversaryTheme(employeeId);
  }

  private buildAnniversaryMessage(fullName: string, years: number) {
    const ordinal = `${years}${getOrdinalSuffix(years)}`;
    const milestoneTitle = years === 1 ? '1st Work Anniversary' : `${years} Year Work Anniversary`;
    const notificationTitle = `🎉 Happy ${milestoneTitle}!`;
    const notificationMessage = `Congratulations ${fullName}! Today marks your ${ordinal} work anniversary with ${COMPANY_DISPLAY_NAME}. Thank you for your continued dedication, leadership, and excellence!`;
    return { ordinal, notificationTitle, notificationMessage };
  }

  private buildBannerAttachment(bannerResult: any, bgImgPath: string): any | null {
    const baseAttachment = {
      filename: ANNIVERSARY_BANNER_FILENAME,
      cid: ANNIVERSARY_BANNER_CID,
      contentType: 'image/gif',
      contentDisposition: 'inline',
    };

    if (bannerResult?.filePath && fs.existsSync(bannerResult.filePath)) {
      return { ...baseAttachment, path: bannerResult.filePath };
    }
    if (bannerResult?.buffer) {
      return {
        ...baseAttachment,
        content: bannerResult.buffer.toString('base64'),
        encoding: 'base64',
      };
    }
    if (fs.existsSync(bgImgPath)) {
      return { ...baseAttachment, path: bgImgPath };
    }
    return null;
  }

  /**
   * Fetches active employees whose work anniversary is today (and who have completed >= 1 year).
   */
  async getTodayAnniversaries(themeId?: number | string): Promise<
    Array<{
      employee: EmployeeDetails;
      years: number;
      alreadySentToday: boolean;
      ordinal: string;
      subject: string;
      theme: AnniversaryTheme;
    }>
  > {
    const today = dayjs().startOf('day');

    const allEmployees = await this.employeeRepo.find();
    const employees = allEmployees.filter(
      (emp) => emp.userStatus !== UserStatus.INACTIVE,
    );

    const anniversaryEmployees: Array<{
      employee: EmployeeDetails;
      years: number;
      alreadySentToday: boolean;
      ordinal: string;
      subject: string;
      theme: AnniversaryTheme;
    }> = [];

    const startOfToday = today.toDate();

    for (const emp of employees) {
      if (!emp.joiningDate) continue;
      const joinedDate = dayjs(emp.joiningDate).startOf('day');
      if (!joinedDate.isValid()) continue;

      if (this.isAnniversaryOnDate(joinedDate, today)) {
        const years = today.diff(joinedDate, 'year');
        if (years >= 1) {
          const alreadySentToday = await this.hasSentAnniversaryToday(emp.employeeId, startOfToday);
          const ordinal = `${years}${getOrdinalSuffix(years)}`;
          const subject = getWorkAnniversarySubject(emp.fullName, years);
          const theme = this.resolveTheme(emp.employeeId, years, themeId);

          anniversaryEmployees.push({
            employee: emp,
            years,
            alreadySentToday,
            ordinal,
            subject,
            theme,
          });
        }
      }
    }

    // Sort deterministically by employeeId so same-day recipients rotate consistently across templates
    anniversaryEmployees.sort((a, b) =>
      String(a.employee.employeeId || '').localeCompare(String(b.employee.employeeId || '')),
    );

    // When no explicit themeId is forced, distribute same-day recipients with
    // distinct randomly shuffled templates from the 15 available themes
    if (!themeId && anniversaryEmployees.length > 0) {
      const randomThemes = getShuffledRandomThemesForBatch(anniversaryEmployees.length);
      for (let i = 0; i < anniversaryEmployees.length; i++) {
        anniversaryEmployees[i].theme = randomThemes[i];
      }
    }

    return anniversaryEmployees;
  }

  /**
   * Flexible resolver: finds employee by employeeId, fullName, numeric id, or email.
   * Handles URL-encoded values and case-insensitive matching.
   */
  async findEmployeeByIdentifier(employeeIdOrEmp: string | EmployeeDetails): Promise<EmployeeDetails> {
    if (typeof employeeIdOrEmp !== 'string') {
      return employeeIdOrEmp;
    }

    let decoded = employeeIdOrEmp.trim();
    try {
      decoded = decodeURIComponent(employeeIdOrEmp).trim();
    } catch {
      // In case string is already raw or has invalid % sequences
    }

    const isNum = !isNaN(Number(decoded)) && decoded !== '';

    let emp = await this.employeeRepo.findOne({
      where: isNum
        ? [
            { id: Number(decoded) },
            { employeeId: decoded },
            { fullName: decoded },
            { email: decoded },
          ]
        : [
            { employeeId: decoded },
            { fullName: decoded },
            { email: decoded },
          ],
    });

    if (!emp) {
      // Case-insensitive / trimmed fallback match
      emp = await this.employeeRepo
        .createQueryBuilder('emp')
        .where('LOWER(TRIM(emp.employeeId)) = LOWER(:query)', { query: decoded })
        .orWhere('LOWER(TRIM(emp.fullName)) = LOWER(:query)', { query: decoded })
        .orWhere('LOWER(TRIM(emp.email)) = LOWER(:query)', { query: decoded })
        .getOne();
    }

    if (!emp) {
      throw new NotFoundException(`Employee with ID, name, or email "${employeeIdOrEmp}" not found`);
    }

    return emp;
  }

  /**
   * Inspect work anniversary details & message preview for any employee.
   * Allows previewing any of the 15 distinct luxury background design themes!
   */
  async getEmployeeAnniversaryDetails(
    employeeIdOrEmp: string | EmployeeDetails,
    themeId?: number | string,
  ): Promise<{
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
      theme: AnniversaryTheme;
    };
  }> {
    const emp = await this.findEmployeeByIdentifier(employeeIdOrEmp);

    const today = dayjs().startOf('day');
    const joiningDate = emp.joiningDate ? dayjs(emp.joiningDate).startOf('day') : null;
    const calculatedYears = joiningDate && joiningDate.isValid() ? today.diff(joiningDate, 'year') : 0;
    const years = Math.max(0, calculatedYears);

    const isAnniversaryToday =
      !!joiningDate &&
      joiningDate.isValid() &&
      years >= 1 &&
      this.isAnniversaryOnDate(joiningDate, today);

    // Check if notification was already sent today
    const startOfToday = today.toDate();
    const alreadySentToday = await this.hasSentAnniversaryToday(emp.employeeId, startOfToday);

    const displayYears = years > 0 ? years : 1;
    const { notificationTitle, notificationMessage } = this.buildAnniversaryMessage(
      emp.fullName,
      displayYears,
    );
    const subject = getWorkAnniversarySubject(emp.fullName, displayYears);
    const selectedTheme = this.resolveTheme(emp.employeeId, displayYears, themeId);

    return {
      employeeId: emp.employeeId,
      fullName: emp.fullName,
      email: emp.email,
      designation: emp.designation,
      department: emp.department,
      joiningDate: emp.joiningDate,
      years,
      isAnniversaryToday,
      alreadySentToday,
      preview: {
        subject,
        notificationTitle,
        notificationMessage,
        theme: selectedTheme,
      },
    };
  }

  /**
   * Extracts profile photo buffer from storage via DocumentUploaderService
   * for baking directly into the combined anniversary GIF banner.
   */
  async extractProfilePhoto(emp: EmployeeDetails): Promise<{
    hasPhoto: boolean;
    photoBuffer?: Buffer;
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

      const numericEmpId = Number(emp.employeeId);
      if (
        (!docs || docs.length === 0) &&
        !isNaN(numericEmpId) &&
        numericEmpId !== emp.id
      ) {
        docs = await this.documentUploaderService.getAllDocs(
          EntityType.EMPLOYEE,
          numericEmpId,
          ReferenceType.EMPLOYEE_PROFILE_PHOTO,
          numericEmpId,
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

      return {
        hasPhoto: true,
        photoBuffer: buffer,
      };
    } catch (imgError) {
      this.logger.debug(`Could not load profile photo for ${emp.fullName}: ${imgError?.message}`);
      return { hasPhoto: false };
    }
  }

  /**
   * Send anniversary wish to a specific employee.
   * Supports selecting from the 15 luxury background design themes!
   */
  async sendWorkAnniversaryWish(
    employeeIdOrEmp: string | EmployeeDetails,
    force = false,
    forceYears?: number,
    themeId?: number | string,
  ): Promise<WorkAnniversaryResult> {
    const emp = await this.findEmployeeByIdentifier(employeeIdOrEmp);

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
    if (!force && (await this.hasSentAnniversaryToday(emp.employeeId, startOfToday))) {
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

    const { notificationTitle, notificationMessage } = this.buildAnniversaryMessage(
      emp.fullName,
      years,
    );

    // 1. In-App Notification
    const notif = await this.notificationRepo.save({
      employeeId: emp.employeeId,
      title: notificationTitle,
      message: notificationMessage,
      type: ANNIVERSARY_NOTIFICATION_TYPE,
      isRead: false,
    });

    const resolvedTheme = this.resolveTheme(emp.employeeId, years, themeId);

    // 2. Celebration Email
    let emailSent = false;
    const recipientEmail = (emp.email || '').trim();
    if (recipientEmail) {
      const subject = getWorkAnniversarySubject(emp.fullName, years);

      // Extract profile photo from DB
      const photoResult = await this.extractProfilePhoto(emp);

      const bgImgPath = getThemeBgImagePath(resolvedTheme.id);
      let bannerResult: any = null;
      try {
        bannerResult = await generateAnniversaryBannerGif({
          name: emp.fullName,
          years,
          designation: emp.designation,
          employeeId: emp.employeeId,
          gifSourcePath: bgImgPath,
          photoBuffer: photoResult.hasPhoto ? photoResult.photoBuffer : undefined,
          force,
        });
      } catch (genErr) {
        this.logger.error(
          `[ANNIVERSARY] Error generating banner GIF: ${genErr?.message}`,
          genErr?.stack,
        );
      }

      const html = await getWorkAnniversaryTemplateMjml({
        employeeName: emp.fullName,
        employeeId: emp.employeeId,
        designation: emp.designation,
        department: emp.department,
        joiningDate: emp.joiningDate,
        anniversaryDate: new Date(),
        years,
        themeId: resolvedTheme.id,
        bgUrl: `cid:${ANNIVERSARY_BANNER_CID}`,
      });

      try {
        const bannerAttachment = this.buildBannerAttachment(bannerResult, bgImgPath);
        const mailAttachments = bannerAttachment ? [bannerAttachment] : undefined;

        await this.mailService.sendMailAsync(
          recipientEmail,
          subject,
          notificationMessage,
          html,
          undefined,
          undefined,
          mailAttachments,
        );
        emailSent = true;
        this.logger.log(
          `[ANNIVERSARY] Email queued for ${emp.fullName} <${recipientEmail}> (${years} year(s)) with combined GIF banner`,
        );
      } catch (mailError) {
        this.logger.error(
          `[ANNIVERSARY] Failed to queue email for ${recipientEmail}: ${mailError?.message || mailError}`,
        );
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
      themeId: resolvedTheme.id,
      themeName: resolvedTheme.name,
    };
  }

  /**
   * Daily check: Checks all active employees. For any employee whose work anniversary is TODAY
   * and who has completed >= 1 year, sends the notification & email.
   * Can accept an optional themeId override.
   */
  async sendDailyWorkAnniversaryWishes(
    force = false,
    themeId?: number | string,
  ): Promise<DailyWorkAnniversarySummary> {
    this.logger.log(`Starting daily work anniversary check (force=${force}, themeId=${themeId || 'auto'})...`);
    const todayAnniversaries = await this.getTodayAnniversaries(themeId);

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const recipients: Array<{
      employeeId: string;
      name: string;
      email?: string;
      years: number;
      emailSent: boolean;
      notificationCreated: boolean;
      themeId?: number;
    }> = [];

    for (const item of todayAnniversaries) {
      processed++;
      const { employee, years, theme } = item;

      try {
        const result = await this.sendWorkAnniversaryWish(employee, force, years, themeId || theme.id);
        if (result.emailSent || result.notificationCreated) {
          sent++;
          recipients.push({
            employeeId: employee.employeeId,
            name: employee.fullName,
            email: employee.email,
            years,
            emailSent: result.emailSent,
            notificationCreated: result.notificationCreated,
            themeId: result.themeId,
          });
          this.logger.log(
            `[ANNIVERSARY] Successfully sent ${years}-year anniversary wish to ${employee.fullName} (${employee.employeeId}) [Theme: ${result.themeName}]`,
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
