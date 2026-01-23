import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
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
    return {
      message: 'Weekly attendance reminder sent successfully',
      totalEmployees: count,
    };
  }

  @Post('month-end')
  @ApiOperation({ summary: 'Trigger Month-End Attendance Reminder' })
  async monthEndReminder() {
    const count = await this.notificationService.sendMonthEndReminder();
    return {
      message: 'Month-end attendance reminder sent successfully',
      totalEmployees: count,
    };
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
