import { Controller, Get, Post, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { WorkAnniversaryService } from '../Services/work-anniversary.service';

@ApiTags('Work Anniversary')
@Controller('work-anniversary')
export class WorkAnniversaryController {
  private readonly logger = new Logger(WorkAnniversaryController.name);

  constructor(private readonly workAnniversaryService: WorkAnniversaryService) {}

  @Get('today')
  @ApiOperation({ summary: 'Get all active employees celebrating their work anniversary today' })
  async getTodayAnniversaries() {
    this.logger.log('Fetching active employees celebrating work anniversary today');
    const list = await this.workAnniversaryService.getTodayAnniversaries();
    return {
      message: 'Today work anniversaries retrieved successfully',
      date: new Date().toISOString().split('T')[0],
      total: list.length,
      employees: list.map((item) => ({
        employeeId: item.employee.employeeId,
        fullName: item.employee.fullName,
        email: item.employee.email,
        designation: item.employee.designation,
        department: item.employee.department,
        joiningDate: item.employee.joiningDate,
        years: item.years,
        milestone: `${item.ordinal} Work Anniversary`,
        alreadySentToday: item.alreadySentToday,
        emailSubject: item.subject,
      })),
    };
  }

  @Get('details/:employeeId')
  @ApiOperation({ summary: 'Inspect anniversary details & message preview for any employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee ID or numeric ID' })
  async getEmployeeDetails(@Param('employeeId') employeeId: string) {
    this.logger.log(`Fetching anniversary details for employee: ${employeeId}`);
    return await this.workAnniversaryService.getEmployeeAnniversaryDetails(employeeId);
  }

  @Post('trigger')
  @ApiOperation({
    summary: 'Manually trigger anniversary email & notification dispatch for today celebrating employees',
  })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'If true, bypasses duplicate check for today',
  })
  async triggerDailyAnniversaries(@Query('force') forceParam?: string) {
    const force = forceParam === 'true';
    this.logger.log(`Triggering daily work anniversary check (force=${force})`);
    const result = await this.workAnniversaryService.sendDailyWorkAnniversaryWishes(force);
    return {
      message: 'Work anniversary check completed',
      ...result,
    };
  }

  @Post('send/:employeeId')
  @ApiOperation({
    summary: 'Send work anniversary celebration email and in-app notification to a specific employee',
  })
  @ApiParam({ name: 'employeeId', description: 'Employee ID or numeric ID' })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'If true, bypasses duplicate check for today',
  })
  async sendAnniversaryToEmployee(
    @Param('employeeId') employeeId: string,
    @Query('force') forceParam?: string,
  ) {
    const force = forceParam === 'true';
    this.logger.log(`Sending work anniversary wish to employee ${employeeId} (force=${force})`);
    return await this.workAnniversaryService.sendWorkAnniversaryWish(employeeId, force);
  }
}
