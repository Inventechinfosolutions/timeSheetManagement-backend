import { Controller, Post, Body, Get, Param, Delete, UseGuards, Req, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TimesheetBlockerService } from '../services/timesheetBlocker.service';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ReceptionistReadOnlyGuard } from 'src/auth/guards/receptionist-readonly.guard';
import { UserType } from 'src/users/enums/user-type.enum';

@Controller('timesheet-blockers')
@UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
export class TimesheetBlockerController {
  private readonly logger = new Logger(TimesheetBlockerController.name);
  constructor(private readonly blockerService: TimesheetBlockerService) { }

  @Post()
  async create(@Body() data: Partial<TimesheetBlocker>, @Req() req: any): Promise<TimesheetBlocker> {
    try {
      this.logger.log(`Creating timesheet blocker for employee: ${data.employeeId}`);
      const user = req.user;
      const isAdmin = user?.userType === UserType.ADMIN;

      // Set the blocker's identity as strictly the role (Admin or Manager)
      data.blockedBy = isAdmin ? UserType.ADMIN : UserType.MANAGER;

      return await this.blockerService.create(data, isAdmin);
    } catch (error) {
      this.logger.error(`Error creating timesheet blocker: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('employee/:employeeId')
  async findAll(@Param('employeeId') employeeId: string): Promise<TimesheetBlocker[]> {
    try {
      this.logger.log(`Fetching all timesheet blockers for employee: ${employeeId}`);
      return await this.blockerService.findAllByEmployee(employeeId);
    } catch (error) {
      this.logger.error(`Error fetching blockers for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any): Promise<void> {
    try {
      this.logger.log(`Removing timesheet blocker ID: ${id}`);
      const user = req.user;
      const isAdmin = user?.userType === UserType.ADMIN;

      // Check for Manager Role
      const roleUpper = (user?.role || '').toUpperCase();
      const isManager = user && (user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER));

      await this.blockerService.remove(+id, isAdmin, isManager, user?.loginId, user?.aliasLoginName);
    } catch (error) {
      this.logger.error(`Error removing timesheet blocker ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
