import { Controller, Post, Get, Param, Logger, Body, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BirthdayNotificationService } from '../Services/birthday-notification.service';

@ApiTags('Birthday Notifications')
@Controller([
  'notifications/attendance/birthday',
  'notifications/birthday',
  'employee-details/birthdays',
  'employee-details/birthday',
])
export class BirthdayNotificationController {
  private readonly logger = new Logger(BirthdayNotificationController.name);

  constructor(private readonly birthdayService: BirthdayNotificationService) {}

  @Get('today')
  @ApiOperation({ summary: 'List all active employees having their birthday today and send birthday wishes' })
  async getTodayBirthdaysGet(@Query('force') queryForce?: string) {
    return this.getTodayBirthdays(queryForce);
  }

  @Post('today')
  @ApiOperation({ summary: 'List all active employees having their birthday today and send birthday wishes' })
  async getTodayBirthdays(@Query('force') queryForce?: string) {
    const force = queryForce === 'true' || queryForce === '1';
    try {
      this.logger.log('Fetching today birthdays...');
      const list = await this.birthdayService.getTodayBirthdays();

      const sentResults: any[] = [];
      for (const emp of list) {
        try {
          const res = await this.birthdayService.sendBirthdayWish(emp, force);
          sentResults.push(res);
        } catch (err) {
          this.logger.error(`[BIRTHDAY] Failed to send wish to ${emp.fullName}: ${err?.message}`);
        }
      }

      const sentCount = sentResults.filter((r) => r.emailSent).length;
      const skippedCount = sentResults.length - sentCount;

      if (list.length === 0) {
        return {
          message: 'No birthdays found for today',
          processed: 0,
          sent: 0,
          skipped: 0,
          recipients: [],
        };
      }

      if (sentCount === 0) {
        const skippedNames = list.map((e) => e.fullName).join(', ');
        return {
          success: true,
          date: new Date().toISOString().split('T')[0],
          message: `Birthday wish already sent today to ${skippedNames}. Skipped.`,
          processed: list.length,
          count: list.length,
          sent: 0,
          sentCount: 0,
          skipped: skippedCount,
          skippedCount,
          recipients: [],
          employees: list.map((e) => ({
            id: e.id,
            employeeId: e.employeeId,
            fullName: e.fullName,
            email: e.email,
            dateOfBirth: e.dateOfBirth,
          })),
        };
      }

      const sentNames = sentResults.filter((r) => r.emailSent).map((r) => r.fullName).join(', ');
      const skippedNames = sentResults.filter((r) => !r.emailSent).map((r) => r.fullName).join(', ');
      const message =
        sentCount > 0 && skippedCount > 0
          ? `Birthday wish sent to ${sentNames}. Already sent today to ${skippedNames} (Skipped).`
          : `Birthday wish sent successfully to ${sentNames}`;

      return {
        success: true,
        date: new Date().toISOString().split('T')[0],
        count: list.length,
        processed: list.length,
        sent: sentCount,
        sentCount,
        skipped: skippedCount,
        skippedCount,
        message,
        employees: list.map((e) => ({
          id: e.id,
          employeeId: e.employeeId,
          fullName: e.fullName,
          email: e.email,
          dateOfBirth: e.dateOfBirth,
        })),
      };
    } catch (error) {
      this.logger.error(`Error processing today birthdays: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('trigger')
  @ApiOperation({ summary: 'Trigger daily birthday check for today' })
  async triggerDailyBirthdayWishesGet(@Query('force') forceParam?: string) {
    return this.triggerDailyBirthdayWishes(forceParam);
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger daily birthday check for today' })
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
  @ApiOperation({ summary: 'Send birthday wish to a specific employee' })
  async sendBirthdayWishToEmployeeGet(
    @Param('employeeId') paramId?: string,
    @Body('employeeId') bodyId?: string,
    @Query('employeeId') queryId?: string,
    @Query('template') queryTemplate?: string,
    @Body('template') bodyTemplate?: string,
    @Query('force') queryForce?: string,
  ) {
    return this.sendBirthdayWishToEmployee(paramId, bodyId, queryId, queryTemplate, bodyTemplate, queryForce);
  }

  @Post(['send', 'send/:employeeId'])
  @ApiOperation({ summary: 'Send birthday wish to a specific employee' })
  async sendBirthdayWishToEmployee(
    @Param('employeeId') paramId?: string,
    @Body('employeeId') bodyId?: string,
    @Query('employeeId') queryId?: string,
    @Query('template') queryTemplate?: string,
    @Body('template') bodyTemplate?: string,
    @Query('force') queryForce?: string,
  ) {
    const targetId = paramId || bodyId || queryId;
    if (!targetId || targetId.trim() === '' || targetId === ':employeeId') {
      throw new BadRequestException('Please provide a valid employee ID');
    }
    const templateOverride = queryTemplate || bodyTemplate;
    const force = queryForce === 'true' || queryForce === '1';
    try {
      this.logger.log(`Sending birthday wish to employee: ${targetId}`);
      return await this.birthdayService.sendBirthdayWish(targetId.trim(), force, templateOverride);
    } catch (error) {
      this.logger.error(`Error sending birthday wish to ${targetId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}

