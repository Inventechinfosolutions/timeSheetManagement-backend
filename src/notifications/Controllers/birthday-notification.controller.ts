import { Controller, Post, Get, Param, Logger, Body, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BirthdayNotificationService } from '../Services/birthday-notification.service';

@ApiTags('Birthday Notifications')
@Controller(['notifications/attendance/birthday', 'notifications/birthday'])
export class BirthdayNotificationController {
  private readonly logger = new Logger(BirthdayNotificationController.name);

  constructor(private readonly birthdayService: BirthdayNotificationService) {}

  @Get('today')
  @Post('today')
  @ApiOperation({ summary: 'List all active employees having their birthday today and automatically send birthday wishes' })
  async getTodayBirthdays() {
    try {
      this.logger.log('Fetching today birthdays and sending birthday wishes...');
      const list = await this.birthdayService.getTodayBirthdays();

      const sentResults: any[] = [];
      for (const emp of list) {
        try {
          const res = await this.birthdayService.sendBirthdayWish(emp);
          sentResults.push(res);
          if (res.emailSent) {
            this.logger.log(`[BIRTHDAY] Wish sent successfully to ${emp.fullName} <${emp.email}>`);
          } else {
            this.logger.log(`[BIRTHDAY] Wish already sent to ${emp.fullName} <${emp.email}> today. Skipping resend.`);
          }
        } catch (err) {
          this.logger.error(`[BIRTHDAY] Failed to send wish to ${emp.fullName}: ${err?.message}`);
        }
      }

      const sentCount = sentResults.filter((r) => r.emailSent).length;
      const skippedCount = sentResults.length - sentCount;

      if (sentCount === 0) {
        return {
          message: 'birthday check completed',
          processed: list.length,
          sent: 0,
          skipped: skippedCount,
          recipients: [],
        };
      }

      return {
        success: true,
        date: new Date().toISOString().split('T')[0],
        count: list.length,
        sentCount,
        message: `Birthday wish sent successfully to ${sentResults.filter((r) => r.emailSent).map((r) => r.employeeName).join(', ')}`,
        employees: list.map((e: any) => ({
          id: e.id,
          employeeId: e.employeeId,
          fullName: e.fullName,
          email: e.email,
          designation: e.designation,
          dateOfBirth: e.dateOfBirth,
        })),
      };
    } catch (error) {
      this.logger.error(`Error processing today birthdays: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('trigger')
  @Post('trigger')
  @ApiOperation({ summary: 'Check today for birthdays and send in-app notification & email' })
  async triggerDailyBirthdayWishes(@Query('force') forceParam?: string) {
    const force = forceParam === 'true' || forceParam === '1';
    try {
      this.logger.log('Triggering daily birthday check');
      const result = await this.birthdayService.sendDailyBirthdayWishes(force);
      return { message: 'Birthday check completed', ...result };
    } catch (error) {
      this.logger.error(`Error in triggerDailyBirthdayWishes: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(['send', 'send/:employeeId'])
  @Post(['send', 'send/:employeeId'])
  @ApiOperation({ summary: 'Send birthday wish (notification & email) to a specific employee' })
  async sendBirthdayWishToEmployee(
    @Param('employeeId') paramId?: string,
    @Body('employeeId') bodyId?: string,
    @Query('employeeId') queryId?: string,
  ) {
    const targetId = paramId || bodyId || queryId;
    if (!targetId || targetId.trim() === '' || targetId === ':employeeId') {
      throw new BadRequestException('Please provide a valid employee ID');
    }
    try {
      this.logger.log(`Sending birthday wish to employee: ${targetId}`);
      return await this.birthdayService.sendBirthdayWish(targetId.trim());
    } catch (error) {
      this.logger.error(`Error sending birthday wish to ${targetId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}

