import { Controller, Post, Get, Patch, Param, Logger, Body, Query, BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../Services/notifications.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller('notifications/attendance')
export class AttendanceNotificationController {
  private readonly logger = new Logger(AttendanceNotificationController.name);
  constructor(private readonly notificationService: NotificationsService) {}

  @Post('weekly')
  @ApiOperation({ summary: 'Trigger Weekly Attendance Reminder' })
  async weeklyReminder() {
    try {
      this.logger.log('Triggering weekly attendance reminder');
      const count = await this.notificationService.sendWeeklyReminder();
      return { message: 'Weekly attendance reminder sent successfully', totalEmployees: count };
    } catch (error) {
      this.logger.error(`Error sending weekly reminder: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ─── Manual triggers for last-working-day cron jobs ─────────────────────────

  @Post('month-end-10am')
  @ApiOperation({ summary: 'Manually trigger 10AM month-end general reminder (all employees)' })
  async monthEnd10AM() {
    try {
      this.logger.log('Manually triggering 10AM month-end general reminder');
      const count = await this.notificationService.sendMonthEndGeneralReminder();
      return { message: 'Month-end 10AM general reminder sent', totalEmployees: count };
    } catch (error) {
      this.logger.error(`Error in monthEnd10AM: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('month-end-12pm')
  @ApiOperation({ summary: 'Manually trigger 12PM last-call to pending employees' })
  async monthEnd12PM() {
    try {
      this.logger.log('Manually triggering 12PM last-call reminder');
      const count = await this.notificationService.sendMonthEndLastCallByPending();
      return { message: 'Month-end 12PM last-call reminder sent', totalEmployees: count };
    } catch (error) {
      this.logger.error(`Error in monthEnd12PM: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('month-end-1pm')
  @ApiOperation({ summary: 'Manually trigger 1PM manager report of pending employees' })
  async monthEnd1PM() {
    try {
      this.logger.log('Manually triggering 1PM manager reports for pending employees');
      await this.notificationService.sendManagerPendingReportAll();
      return { message: 'Month-end 1PM manager reports dispatched' };
    } catch (error) {
      this.logger.error(`Error in monthEnd1PM: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ─── Birthday Endpoints ─────────────────────────────────────────────────────

  @Get('birthday/today')
  @Post('birthday/today')
  @ApiOperation({ summary: 'List all active employees having their birthday today and automatically send birthday wishes' })
  async getTodayBirthdays() {
    try {
      this.logger.log('Fetching today birthdays and sending birthday wishes...');
      const list = await this.notificationService.getTodayBirthdays();
      
      const sentResults: any[] = [];
      for (const emp of list) {
        try {
          const res = await this.notificationService.sendBirthdayWish(emp);
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

  @Get('birthday/trigger')
  @Post('birthday/trigger')
  @ApiOperation({ summary: 'Check today for birthdays and send in-app notification & email' })
  async triggerDailyBirthdayWishes(@Query('force') forceParam?: string) {
    const force = forceParam === 'true' || forceParam === '1';
    try {
      this.logger.log('Triggering daily birthday check');
      const result = await this.notificationService.sendDailyBirthdayWishes(force);
      return { message: 'Birthday check completed', ...result };
    } catch (error) {
      this.logger.error(`Error in triggerDailyBirthdayWishes: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(['birthday/send', 'birthday/send/:employeeId'])
  @Post(['birthday/send', 'birthday/send/:employeeId'])
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
      return await this.notificationService.sendBirthdayWish(targetId.trim());
    } catch (error) {
      this.logger.error(`Error sending birthday wish to ${targetId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':employeeId/inbox')
  @ApiOperation({ summary: 'Get unread notifications for an employee' })
  async getNotifications(@Param('employeeId') employeeId: string) {
    try {
      this.logger.log(`Fetching unread notifications for employee: ${employeeId}`);
      return await this.notificationService.getUnreadNotifications(employeeId);
    } catch (error) {
      this.logger.error(`Error fetching notifications for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('inbox_id_:id')
  @ApiOperation({ summary: 'Get a single notification details' })
  async getNotificationDetails(@Param('id') id: string) {
    try {
      this.logger.log(`Fetching notification details for ID: ${id}`);
      return await this.notificationService.findOne(+id);
    } catch (error) {
      this.logger.error(`Error fetching notification details for ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch('inbox_read_all_:employeeId')
  @ApiOperation({ summary: 'Mark all notifications as read for an employee' })
  async markAllAsRead(@Param('employeeId') employeeId: string) {
    try {
      this.logger.log(`Marking all notifications as read for employee: ${employeeId}`);
      return await this.notificationService.markAllAsRead(employeeId);
    } catch (error) {
      this.logger.error(`Error marking all as read for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch('inbox_read_:id')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Param('id') id: string) {
    try {
      this.logger.log(`Marking notification as read for ID: ${id}`);
      return await this.notificationService.markAsRead(+id);
    } catch (error) {
      this.logger.error(`Error marking notification ${id} as read: ${error.message}`, error.stack);
      throw error;
    }
  }
}
