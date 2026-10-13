import { Controller, Get, Post, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { AttendanceCronService } from './cron/attendance.cron.service';
import { AppraisalDeadlineCronService } from './appraisal/services/appraisal_deadline.cron';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly attendanceCronService: AttendanceCronService,
    private readonly appraisalDeadlineCronService: AppraisalDeadlineCronService,
  ) {}

  @Get()
  getHello(): string {
    try {
      this.logger.log('Fetching hello message');
      return this.appService.getHello();
    } catch (error) {
      this.logger.error(`Error in getHello: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('test-weekend-reminder')
  async testReminder() {
    try {
      this.logger.log('Testing weekend reminder cron');
      return await this.attendanceCronService.weekendReminder();
    } catch (error) {
      this.logger.error(`Error testing weekend reminder: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('cron/weekly-lock')
  async runWeeklyLock() {
    this.logger.log('Manually running weekly lock cron');
    return this.attendanceCronService.handleWeeklyLock();
  }

  @Post('cron/monthly-lock')
  async runMonthlyLock() {
    this.logger.log('Manually running monthly lock cron');
    return this.attendanceCronService.handleMonthlyLeaveUpdate();
  }

  @Post('cron/appraisal-deadline')
  async runAppraisalDeadline() {
    this.logger.log('Manually running appraisal deadline cron');
    const result = await this.appraisalDeadlineCronService.remindOrCloseOpenReviews();
    return { message: 'Appraisal deadline cron completed', ...result };
  }
}
