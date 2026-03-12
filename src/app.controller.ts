import { Controller, Get, Post, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { AttendanceCronService } from './cron/attendance.cron.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly attendanceCronService: AttendanceCronService,
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
}
