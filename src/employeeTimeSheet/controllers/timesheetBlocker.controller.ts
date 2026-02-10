import { Controller, Post, Body, Get, Param, Delete, UseGuards, Req, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TimesheetBlockerService } from '../services/timesheetBlocker.service';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UserType } from 'src/users/enums/user-type.enum';

@Controller('timesheet-blockers')
@UseGuards(JwtAuthGuard)
export class TimesheetBlockerController {
  constructor(private readonly blockerService: TimesheetBlockerService) {}

  @Post()
  async create(@Body() data: Partial<TimesheetBlocker>, @Req() req: any): Promise<TimesheetBlocker> {
    const user = req.user;
    const isAdmin = user?.userType === UserType.ADMIN;

    // Set the blocker's identity as strictly the role (Admin or Manager)
    data.blockedBy = isAdmin ? 'Admin' : 'Manager';
    
    return await this.blockerService.create(data, isAdmin);
  }

  @Get('employee/:employeeId')
  async findAll(@Param('employeeId') employeeId: string): Promise<TimesheetBlocker[]> {
    return await this.blockerService.findAllByEmployee(employeeId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any): Promise<void> {
    const user = req.user;
    const isAdmin = user?.userType === UserType.ADMIN;
    
    // Check for Manager Role
    const roleUpper = (user?.role || '').toUpperCase();
    const isManager = user && (user.userType === 'MANAGER' || roleUpper.includes('MNG') || roleUpper.includes('MANAGER'));
    
    await this.blockerService.remove(+id, isAdmin, isManager, user?.loginId, user?.aliasLoginName);
  }
}
