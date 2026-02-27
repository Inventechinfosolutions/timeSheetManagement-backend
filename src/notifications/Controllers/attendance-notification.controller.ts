import { Controller, Post, Get, Patch, Param } from '@nestjs/common';
import { NotificationsService } from '../Services/notifications.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller('notifications/attendance')
export class AttendanceNotificationController {
  constructor(private readonly notificationService: NotificationsService) {}

  @Post('weekly')
  @ApiOperation({ summary: 'Trigger Weekly Attendance Reminder' })
  async weeklyReminder() {
    const count = await this.notificationService.sendWeeklyReminder();
    return { message: 'Weekly attendance reminder sent successfully', totalEmployees: count };
  }

  // ─── Manual triggers for last-working-day cron jobs ─────────────────────────

  @Post('month-end-10am')
  @ApiOperation({ summary: 'Manually trigger 10AM month-end general reminder (all employees)' })
  async monthEnd10AM() {
    const count = await this.notificationService.sendMonthEndGeneralReminder();
    return { message: 'Month-end 10AM general reminder sent', totalEmployees: count };
  }

  @Post('month-end-12pm')
  @ApiOperation({ summary: 'Manually trigger 12PM last-call to pending employees' })
  async monthEnd12PM() {
    const count = await this.notificationService.sendMonthEndLastCallByPending();
    return { message: 'Month-end 12PM last-call reminder sent', totalEmployees: count };
  }

  @Post('month-end-1pm')
  @ApiOperation({ summary: 'Manually trigger 1PM manager report of pending employees' })
  async monthEnd1PM() {
    await this.notificationService.sendManagerPendingReportAll();
    return { message: 'Month-end 1PM manager reports dispatched' };
  }

  @Get(':employeeId/inbox')
  @ApiOperation({ summary: 'Get unread notifications for an employee' })
  async getNotifications(@Param('employeeId') employeeId: string) {
    return await this.notificationService.getUnreadNotifications(employeeId);
  }

  @Get('inbox_id_:id')
  @ApiOperation({ summary: 'Get a single notification details' })
  async getNotificationDetails(@Param('id') id: string) {
    return await this.notificationService.findOne(+id);
  }

  @Patch('inbox_read_all_:employeeId')
  @ApiOperation({ summary: 'Mark all notifications as read for an employee' })
  async markAllAsRead(@Param('employeeId') employeeId: string) {
    return await this.notificationService.markAllAsRead(employeeId);
  }

  @Patch('inbox_read_:id')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Param('id') id: string) {
    return await this.notificationService.markAsRead(+id);
  }
}
