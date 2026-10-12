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
import { ReceptionistReadOnlyGuard } from '../../auth/guards/receptionist-readonly.guard';
import { UserType } from '../../users/enums/user-type.enum';
import { hasAdminAccess } from '../../users/utils/admin-access';
import { AdminDashboardService } from '../services/adminDashboard.service';

@ApiTags('Admin Dashboard')
@Controller('admin-dashboard')
@UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
export class AdminDashboardController {
  private readonly logger = new Logger(AdminDashboardController.name);

  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: "Organisation-wide snapshot: today's attendance, pending approvals and upcoming events" })
  @ApiQuery({ name: 'eventDays', required: false, type: Number, description: 'Upcoming events window in days (default 90, max 365)' })
  async getSummary(
    @Req() req: any,
    @Query('eventDays', new DefaultValuePipe(90), ParseIntPipe) eventDays: number,
  ) {
    this.assertAdmin(req);
    this.logger.log(`Fetching admin dashboard summary (eventDays=${eventDays})`);
    return this.adminDashboardService.getSummary(eventDays);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Attendance breakdown (office / WFH / client visit / leave / not updated) for a given date' })
  @ApiQuery({ name: 'date', required: true, type: String, description: 'Date in YYYY-MM-DD format' })
  async getAttendance(@Req() req: any, @Query('date') date: string) {
    this.assertAdmin(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(Date.parse(date))) {
      throw new BadRequestException('date must be a valid date in YYYY-MM-DD format');
    }
    this.logger.log(`Fetching admin dashboard attendance snapshot for ${date}`);
    return this.adminDashboardService.getAttendanceSnapshot(date);
  }

  private assertAdmin(req: any) {
    const isReceptionist = req.user?.userType === UserType.RECEPTIONIST;
    if (!hasAdminAccess(req.user) && !isReceptionist) {
      throw new ForbiddenException('Only administrators can view the admin dashboard.');
    }
  }
}
