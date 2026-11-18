import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BirthdayNotificationService } from '../Services/birthday-notification.service';
import { FestivalNotificationService } from '../Services/festival-notification.service';
import { WorkAnniversaryService } from '../Services/work-anniversary.service';

/**
 * Dedicated Celebration Cron Service
 * Handles scheduled daily automated checks for:
 * 1. Birthday wishes & colleague announcements (10:00 AM IST)
 * 2. Work anniversary wishes (10:00 AM IST)
 * 3. Festival celebration wishes (10:00 AM IST)
 *
 * Keeps celebration cron logic completely separated from attendance cron jobs.
 */
@Injectable()
export class CelebrationCronService {
  private readonly logger = new Logger(CelebrationCronService.name);

  constructor(
    private readonly birthdayNotificationService: BirthdayNotificationService,
    private readonly workAnniversaryService: WorkAnniversaryService,
    private readonly festivalNotificationService: FestivalNotificationService,
  ) {}

  /**
   * Daily 10:00 AM IST — Birthday Wishes & Colleague Announcement
   */
  @Cron('0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async dailyBirthdayCheck() {
    this.logger.log('[BIRTHDAY] Running daily birthday check (10:00 AM IST)...');
    try {
      const result =
        await this.birthdayNotificationService.sendDailyBirthdayWishes();
      this.logger.log(
        `[BIRTHDAY] Done: ${result.sent} sent, ${result.skipped} skipped out of ${result.processed} eligible.`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[BIRTHDAY] Error in dailyBirthdayCheck: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Daily 10:00 AM IST — Work Anniversary Wishes
   */
  @Cron('0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async dailyWorkAnniversaryCheck() {
    this.logger.log(
      '[ANNIVERSARY] Running daily work-anniversary check (10:00 AM IST)...',
    );
    try {
      const result =
        await this.workAnniversaryService.sendDailyWorkAnniversaryWishes();
      this.logger.log(
        `[ANNIVERSARY] Done: ${result.sent} sent, ${result.skipped} skipped out of ${result.processed} eligible.`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[ANNIVERSARY] Error in dailyWorkAnniversaryCheck: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Daily 10:00 AM IST — Festival Celebration Wishes
   */
  @Cron('0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async dailyFestivalCheck() {
    this.logger.log(
      '[FESTIVAL] Running daily festival check (10:00 AM IST)...',
    );
    try {
      const result =
        await this.festivalNotificationService.checkAndSendDailyFestivalWishes();
      this.logger.log(`[FESTIVAL] Daily check completed: ${result.message}`);
      return result;
    } catch (error) {
      this.logger.error(
        `[FESTIVAL] Error in dailyFestivalCheck: ${error.message}`,
        error.stack,
      );
    }
  }
}
