import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnnualAppraisalService } from '../services/annual_appraisal.service';
import { QueryAnnualAppraisalDto } from '../dto/annual_appraisal.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';

@ApiTags('Annual Appraisal Summary')
@Controller(['annual-appraisal', 'annual-appraisal-summary'])
export class AnnualAppraisalController {
  constructor(private readonly annualService: AnnualAppraisalService) {}

  /**
   * Get all annual appraisal summaries with filters
   * GET /api/annual-appraisal?financialYear=...&department=...
   */
  @Get()
  @ApiOperation({ summary: 'Get all annual appraisal summaries' })
  async getAll(@Query() query: QueryAnnualAppraisalDto) {
    return await this.annualService.findAll(query);
  }

  /**
   * Read one stored annual summary after the login password check.
   * GET /api/annual-appraisal/summary?financialYear=2026-2027
   */
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Read the annual summary row after the login password check' })
  async reveal(
    @Query('financialYear') financialYear: string,
    @Headers('x-appraisal-password') password: string,
    @Req() req: { user: User },
  ) {
    return await this.annualService.revealSummary(financialYear, password, req.user);
  }

  /**
   * Get all financial year ratings for a specific employee
   * GET /api/annual-appraisal/employee/:employeeId
   */
  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'Get all financial year appraisal records for an employee' })
  async getByEmployee(@Param('employeeId') employeeId: string) {
    return await this.annualService.findByEmployee(employeeId);
  }

  /**
   * Get specific annual rating summary for employee + FY
   * GET /api/annual-appraisal/:employeeId/:financialYear
   */
  @Get(':employeeId/:financialYear')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get employee annual summary for a financial year (Q1-Q4 & average)' })
  async getOne(
    @Param('employeeId') _employeeId: string,
    @Param('financialYear') financialYear: string,
    @Headers('x-appraisal-password') headerPassword: string | string[],
    @Req() req: { user: User },
  ) {
    const password = Array.isArray(headerPassword) ? headerPassword[0] : headerPassword;
    return await this.annualService.revealSummary(financialYear, password, req.user);
  }

  /**
   * Sync/Recalculate all employee ratings for a financial year
   * POST /api/annual-appraisal/sync/:financialYear
   */
  @Post('sync/:financialYear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync and compute annual average ratings for all employees in a financial year' })
  async syncAll(@Param('financialYear') financialYear: string) {
    return await this.annualService.syncAllForFinancialYear(financialYear);
  }

  /**
   * Sync/Recalculate an individual employee's annual rating
   * POST /api/annual-appraisal/sync/:employeeId/:financialYear
   */
  @Post('sync/:employeeId/:financialYear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync and compute annual average rating for an individual employee' })
  async syncOne(
    @Param('employeeId') employeeId: string,
    @Param('financialYear') financialYear: string,
  ) {
    return await this.annualService.syncEmployeeAnnualRating(employeeId, financialYear);
  }
}
