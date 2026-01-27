import { Controller, Get, Post, Body, Query, Delete, Param, Patch } from '@nestjs/common';
import { LeaveRequestsService } from '../services/leave-requests.service';
import { LeaveRequestDto } from '../dto/leave-request.dto';

@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  @Post(':employeeId/leave-requests')
  create(@Param('employeeId') employeeId: string, @Body() body: LeaveRequestDto) {
    body.employeeId = employeeId;
    return this.leaveRequestsService.create(body);
  }

  @Post()
  createRoot(@Body() body: LeaveRequestDto) {
    return this.leaveRequestsService.create(body);
  }

  @Get()
  findAll(@Query('employeeId') employeeId?: string) {
    if (employeeId) {
      return this.leaveRequestsService.findByEmployeeId(employeeId);
    }
    return this.leaveRequestsService.findAll();
  }

  @Get('employee/:employeeId')
  findByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.findByEmployeeId(employeeId);
  }

  @Get('notifications/unread')
  findUnread() {
    return this.leaveRequestsService.findUnread();
  }

  @Get('employee/:employeeId/updates')
  findEmployeeUpdates(@Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.findEmployeeUpdates(employeeId);
  }

  @Patch('notifications/:id/read')
  markAsRead(@Param('id') id: string) {
    return this.leaveRequestsService.markAsRead(+id);
  }

  @Patch('employee/notifications/:id/read')
  markEmployeeRead(@Param('id') id: string) {
    return this.leaveRequestsService.markEmployeeUpdateRead(+id);
  }

  @Post('notifications/mark-all-read')
  markAllAsRead() {
    return this.leaveRequestsService.markAllAsRead();
  }

  @Delete(':id/RequestDeleted')
  remove(@Param('id') id: string) {
    return this.leaveRequestsService.remove(+id);
  }
  
  @Post(':id/update-status')
  updateStatus(@Param('id') id: string, @Body('status') status: 'Approved' | 'Rejected' | 'Cancelled') {
    return this.leaveRequestsService.updateStatus(+id, status);
  }

  @Get('stats/:employeeId')
  getStats(@Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.getStats(employeeId);
  }
}
