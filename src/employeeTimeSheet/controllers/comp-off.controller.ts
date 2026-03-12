import { Controller, Get, Post, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { CompOffService } from '../services/comp-off.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmployeeDetailsService } from '../services/employeeDetails.service';
import { Department } from '../enums/department.enum';
import { EmploymentType } from '../enums/employment-type.enum';

@Controller('comp-off')
@UseGuards(JwtAuthGuard)
export class CompOffController {
  constructor(
    private readonly compOffService: CompOffService,
    private readonly employeeDetailsService: EmployeeDetailsService,
  ) {}

  private async checkEligibility(employeeId: string) {
    const employee = await this.employeeDetailsService.findByEmployeeId(employeeId);
    if (
      !employee ||
      employee.department !== Department.IT ||
      employee.employmentType !== EmploymentType.FULL_TIMER
    ) {
      throw new ForbiddenException(
        'Comp Off benefits are only available for employees in the Information Technology department with Full Time status.',
      );
    }
  }

  @Get('available/:employeeId')
  async getAvailableCompOffs(@Param('employeeId') employeeId: string) {
    await this.checkEligibility(employeeId);
    return await this.compOffService.getAvailableCompOffs(employeeId);
  }

  @Get('test')
  test() {
    return { status: 'CompOffController is active' };
  }

  @Get('history/:employeeId')
  async getCompOffHistory(
    @Param('employeeId') employeeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('status') status?: string,
  ) {
    await this.checkEligibility(employeeId);
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '10', 10);
    return await this.compOffService.getCompOffHistory(employeeId, pageNum, limitNum, month, year, status);
  }

  @Post('calculate-total-days')
  async calculateTotalDays(@Body() body: { employeeId: string; dates: string[] }) {
    await this.checkEligibility(body.employeeId);
    return await this.compOffService.calculateTotalDays(body.employeeId, body.dates);
  }
}
