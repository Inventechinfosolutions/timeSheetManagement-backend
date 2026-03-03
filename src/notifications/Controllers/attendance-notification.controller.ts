import { Controller, Post, Get, Patch, Param, Logger } from '@nestjs/common';
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
