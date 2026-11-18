import * as path from 'path';
import * as fs from 'fs';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import dayjs from 'dayjs';

import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/enums/user-status.enum';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from '../entities/notification.entity';
import { MasterHolidays } from '../../master/models/master-holidays.entity';
import { MailService } from '../../common/mail/mail.service';
import {
  FESTIVAL_TEMPLATES_MAP,
  DYNAMIC_FESTIVALS,
  getFestivalTemplateFiles,
  renderFestivalEmail,
  getFestivalMailAttachments,
} from '../../common/mail/templates/festival/festival.template';

export interface OrganizationMember {
  userId?: string;
  loginId?: string;
  employeeId: string;
  fullName: string;
  email: string;
  department?: string;
  designation?: string;
}

export interface CombinedFestivalItem {
  name: string;
  dateStr: string;
  isFromDb: boolean;
  templates: string[];
}

@Injectable()
export class FestivalNotificationService {
  private readonly logger = new Logger(FestivalNotificationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,

    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,

    @InjectRepository(MasterHolidays)
    private readonly holidayRepo: Repository<MasterHolidays>,

    private readonly mailService: MailService,
  ) {}

  /**
   * Fetches holidays from master_holidays database table and merges with
   * dynamic festivals using the spread operator.
   */
  async getAllFestivals(): Promise<CombinedFestivalItem[]> {
    let dbHolidays: MasterHolidays[] = [];
    try {
      dbHolidays = await this.holidayRepo.find({ order: { date: 'ASC' } });
    } catch (err) {
      this.logger.error(`Failed to fetch master_holidays: ${err.message}`);
    }

    const dbItems: CombinedFestivalItem[] = dbHolidays.map((h) => ({
      name: h.name,
      dateStr: dayjs(h.date).format('YYYY-MM-DD'),
      isFromDb: true,
      templates: getFestivalTemplateFiles(h.name),
    }));

    const dbNormalizedNames = dbHolidays.map((h) => (h.name || '').trim().toLowerCase());

    const missingDynamicItems: CombinedFestivalItem[] = DYNAMIC_FESTIVALS
      .filter((dyn) => {
        const dynNorm = dyn.name.trim().toLowerCase();
        return !dbNormalizedNames.some(
          (dbName) => dbName.includes(dynNorm) || dynNorm.includes(dbName),
        );
      })
      .map((f) => ({
        name: f.name,
        dateStr: f.date,
        isFromDb: false,
        templates: f.templates,
      }));

    // Merge database holidays with dynamic fallback festivals using spread operator
    return [...dbItems, ...missingDynamicItems];
  }

  /**
   * Returns all festivals that match a given date.
   * Supports multiple festivals occurring on the same day (e.g. database holiday + dynamic festival).
   */
  async findAllFestivalsForDate(targetDate: Date | string = new Date()): Promise<CombinedFestivalItem[]> {
    const d = dayjs(targetDate);
    const fullDate = d.format('YYYY-MM-DD');
    const monthDay = d.format('MM-DD'); // MM-DD
    const dayMonth = d.format('DD-MM'); // DD-MM

    const allFestivals = await this.getAllFestivals();
    const matched: CombinedFestivalItem[] = [];

    for (const item of allFestivals) {
      const match =
        item.dateStr === fullDate ||
        item.dateStr === monthDay ||
        item.dateStr === dayMonth ||
        (item.dateStr && (item.dateStr.endsWith(monthDay) || item.dateStr.endsWith(dayMonth)));

      if (match) {
        if (item.templates && item.templates.length > 0) {
          // Avoid duplicate names if same festival appears from both sources
          if (!matched.some((m) => m.name.trim().toLowerCase() === item.name.trim().toLowerCase())) {
            matched.push(item);
          }
        }
      }
    }

    return matched;
  }

  /**
   * Checks whether a date (defaults to today) matches any festival in the combined list.
   * Returns the first match for backward compatibility.
   */
  async findFestivalForDate(targetDate: Date | string = new Date()): Promise<CombinedFestivalItem | null> {
    const matches = await this.findAllFestivalsForDate(targetDate);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Retrieves all active members in the organization using the users table,
   * joined with employee details for email.
   */
  async getAllOrganizationMembers(): Promise<OrganizationMember[]> {
    const activeUsers = await this.userRepo.find({
      where: { status: UserStatus.ACTIVE },
    });

    const employees = await this.employeeRepo.find();
    const empByEmployeeId = new Map(
      employees.map((e) => [String(e.employeeId || '').trim().toUpperCase(), e]),
    );
    const empByEmail = new Map(
      employees
        .filter((e) => e.email)
        .map((e) => [String(e.email || '').trim().toLowerCase(), e]),
    );

    const members: OrganizationMember[] = [];
    const seenEmails = new Set<string>();

    for (const user of activeUsers) {
      const loginIdUpper = String(user.loginId || '').trim().toUpperCase();
      const loginIdLower = String(user.loginId || '').trim().toLowerCase();

      const matchedEmp =
        empByEmployeeId.get(loginIdUpper) ||
        (user.loginId && user.loginId.includes('@') ? empByEmail.get(loginIdLower) : undefined);

      let email = matchedEmp?.email;
      if (!email && user.loginId && user.loginId.includes('@')) {
        email = user.loginId;
      }

      if (!email) continue;

      const emailKey = email.toLowerCase().trim();
      if (seenEmails.has(emailKey)) continue;
      seenEmails.add(emailKey);

      members.push({
        userId: user.id,
        loginId: user.loginId,
        employeeId: matchedEmp?.employeeId || user.loginId || user.id,
        fullName: matchedEmp?.fullName || user.aliasLoginName || user.loginId || 'Team Member',
        email,
        department: matchedEmp?.department,
        designation: matchedEmp?.designation,
      });
    }

    for (const emp of employees) {
      if (!emp.email || emp.userStatus !== UserStatus.ACTIVE) continue;
      const emailKey = emp.email.toLowerCase().trim();
      if (!seenEmails.has(emailKey)) {
        seenEmails.add(emailKey);
        members.push({
          employeeId: emp.employeeId,
          fullName: emp.fullName || 'Team Member',
          email: emp.email,
          department: emp.department,
          designation: emp.designation,
        });
      }
    }

    return members;
  }

  /**
   * Fetches the celebration year from the master_holidays database table.
   * If a New Year holiday is recorded in DB, uses its year; otherwise uses the active year from DB holidays.
   */
  async getFestivalYear(): Promise<number> {
    try {
      const newYearHoliday = await this.holidayRepo
        .createQueryBuilder('h')
        .where('LOWER(h.name) LIKE :q', { q: '%new year%' })
        .orderBy('h.date', 'DESC')
        .getOne();

      if (newYearHoliday && newYearHoliday.date) {
        return dayjs(newYearHoliday.date).year();
      }

      const anyHoliday = await this.holidayRepo
        .createQueryBuilder('h')
        .orderBy('h.date', 'DESC')
        .getOne();

      if (anyHoliday && anyHoliday.date) {
        return dayjs(anyHoliday.date).year();
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch holiday year from DB: ${err.message}`);
    }

    return new Date().getFullYear();
  }

  /**
   * Sends the festival template to all members using MJML.
   * Alternates between templates across members (e.g. Person 0 gets template 1, Person 1 gets template 2, and vice versa).
   */
  async sendFestivalWishesToAll(
    festivalName: string,
    options?: {
      testEmail?: string;
    },
  ): Promise<{
    success: boolean;
    festivalName: string;
    recipientsCount: number;
    sentCount: number;
    failedCount: number;
    templateDistribution: Record<string, number>;
  }> {
    const templates = getFestivalTemplateFiles(festivalName);
    if (!templates || templates.length === 0) {
      throw new NotFoundException(
        `No template found for festival "${festivalName}". Available templates for: ${Object.keys(
          FESTIVAL_TEMPLATES_MAP,
        ).join(', ')}`,
      );
    }

    let members: OrganizationMember[];
    if (options?.testEmail) {
      members = [
        {
          employeeId: 'TEST-EMP',
          fullName: 'Team Member',
          email: options.testEmail,
        },
      ];
    } else {
      members = await this.getAllOrganizationMembers();
    }

    const isNewYear = festivalName.toLowerCase().includes('new year');
    const dbYear = isNewYear ? await this.getFestivalYear() : undefined;
    const festivalTitle = isNewYear && dbYear ? `Happy New Year ${dbYear}!` : `Happy ${festivalName}!`;
    const subject = `${festivalTitle} 🎉 | Worksphere`;

    this.logger.log(
      `[FESTIVAL] Sending "${festivalName}" (${festivalTitle}) templates (${templates.join(' & ')}) alternating across ${members.length} members...`,
    );

    let sentCount = 0;
    let failedCount = 0;
    const templateDistribution: Record<string, number> = {};

    for (let i = 0; i < members.length; i++) {
      const member = members[i];

      // Alternating templates: Person 0 gets template 1, Person 1 gets template 2, and vice versa
      const templateFilename = templates[i % templates.length];
      templateDistribution[templateFilename] = (templateDistribution[templateFilename] || 0) + 1;

      try {
        // Pure template delivery via MJML with dynamic year from DB & hosted CDN URLs
        const html = await renderFestivalEmail({
          festivalName,
          year: dbYear,
          templateFilename,
        });

        // Zero MIME attachments: Guarantees Gmail never displays attachment chips ('noname' or '.gif') or hover download buttons
        await this.mailService.sendMailAsync(
          member.email,
          subject,
          festivalTitle,
          html,
          undefined,
          undefined,
          undefined,
        );

        if (!options?.testEmail) {
          await this.notificationRepo.save({
            employeeId: member.employeeId,
            title: festivalTitle,
            message: `${festivalTitle} 🎉`,
            type: `FESTIVAL`,
            isRead: false,
          });
        }

        sentCount++;
      } catch (err) {
        failedCount++;
        this.logger.error(`Failed to send festival template to ${member.email}: ${err.message}`);
      }
    }

    this.logger.log(
      `[FESTIVAL] Finished sending "${festivalName}": ${sentCount} sent out of ${members.length}. Distribution: ${JSON.stringify(
        templateDistribution,
      )}`,
    );

    return {
      success: true,
      festivalName,
      recipientsCount: members.length,
      sentCount,
      failedCount,
      templateDistribution,
    };
  }

  /**
   * Daily check invoked by cron or manual trigger:
   * Checks if today is a festival holiday and broadcasts templates to all members.
   * Dispatches wishes for ALL festivals scheduled for today (e.g. if 2 festivals coincide on the same day).
   */
  async checkAndSendDailyFestivalWishes(options?: {
    testEmail?: string;
  }): Promise<{
    sent: boolean;
    count?: number;
    festivalNames?: string[];
    festivalName?: string;
    message: string;
    results?: any[];
    result?: any;
  }> {
    const todayFestivals = await this.findAllFestivalsForDate(new Date());
    if (!todayFestivals || todayFestivals.length === 0) {
      return {
        sent: false,
        message: 'No festival template scheduled for today.',
      };
    }

    this.logger.log(
      `[FESTIVAL] Found ${todayFestivals.length} festival(s) today: ${todayFestivals.map((f) => f.name).join(', ')}. Sending festival templates to all members...`,
    );

    const results: any[] = [];
    for (const fest of todayFestivals) {
      this.logger.log(`[FESTIVAL] Dispatching wishes for "${fest.name}"...`);
      const res = await this.sendFestivalWishesToAll(fest.name, options);
      results.push(res);
    }

    const festivalNames = todayFestivals.map((f) => f.name);
    return {
      sent: true,
      count: todayFestivals.length,
      festivalNames,
      festivalName: festivalNames.join(', '),
      message: `Successfully sent ${todayFestivals.length} festival template(s) (${festivalNames.join(' & ')}) to all organization members.`,
      results,
      result: results.length === 1 ? results[0] : results,
    };
  }
}
