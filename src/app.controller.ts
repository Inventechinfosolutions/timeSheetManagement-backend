import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { AttendanceCronService } from './cron/attendance.cron.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly attendanceCronService: AttendanceCronService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('test-weekend-reminder')
  async testReminder() {
    return await this.attendanceCronService.weekendReminder();
  }
}
