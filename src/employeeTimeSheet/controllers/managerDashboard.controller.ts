import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  Logger,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserType } from '../../users/enums/user-type.enum';
import { AdminDashboardService, ManagerScope } from '../services/adminDashboard.service';

@ApiTags('Manager Dashboard')
@Controller('manager-dashboard')
@UseGuards(JwtAuthGuard)
export class ManagerDashboardController {
  private readonly logger = new Logger(ManagerDashboardController.name);

  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: "Team snapshot for the logged-in manager: today's attendance, pending approvals, upcoming events and absences" })
  @ApiQuery({ name: 'eventDays', required: false, type: Number, description: 'Upcoming events window in days (default 90, max 365)' })
  async getSummary(
    @Req() req: any,
    @Query('eventDays', new DefaultValuePipe(90), ParseIntPipe) eventDays: number,
  ) {
    const scope = this.resolveManagerScope(req);
    this.logger.log(`Fetching manager dashboard summary for ${scope.managerId || scope.managerName} (eventDays=${eventDays})`);
    return this.adminDashboardService.getManagerSummary(scope, eventDays);
  }

  @Get('attendance')
  @ApiOperation({ summary: "Attendance breakdown of the manager's team for a given date" })
  @ApiQuery({ name: 'date', required: true, type: String, description: 'Date in YYYY-MM-DD format' })
  async getAttendance(@Req() req: any, @Query('date') date: string) {
    const scope = this.resolveManagerScope(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(Date.parse(date))) {
      throw new BadRequestException('date must be a valid date in YYYY-MM-DD format');
    }
    this.logger.log(`Fetching team attendance snapshot for ${scope.managerId || scope.managerName} on ${date}`);
    return this.adminDashboardService.getManagerAttendanceSnapshot(scope, date);
  }

  /** Same manager detection as the employee-details and leave-requests controllers. */
  private resolveManagerScope(req: any): ManagerScope {
    const user = req.user;
    const roleUpper = (user?.role || '').toUpperCase();
    const isManager =
      user?.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER);
    if (!isManager) {
      throw new ForbiddenException('Only managers can view the team dashboard.');
    }
    return { managerName: user.aliasLoginName || undefined, managerId: user.loginId || undefined };
  }
}
