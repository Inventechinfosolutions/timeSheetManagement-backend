import {
  Controller,
  Get,
  HttpStatus,
  UseGuards,
  Logger,
  HttpException,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MasterFinancialYearService } from '../service/master-financial-year.service';

@ApiTags('Master Financial Year')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('master/financial-years')
export class MasterFinancialYearController {
  private readonly logger = new Logger(MasterFinancialYearController.name);

  constructor(
    private readonly masterFinancialYearService: MasterFinancialYearService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get master list of financial years' })
  getFinancialYears(
    @Query('yearsBefore') yearsBefore?: string,
    @Query('yearsAfter') yearsAfter?: string,
  ) {
    try {
      const before = yearsBefore ? parseInt(yearsBefore, 10) : 5;
      const after = yearsAfter ? parseInt(yearsAfter, 10) : 2;
      const data = this.masterFinancialYearService.getFinancialYears(
        isNaN(before) ? 5 : before,
        isNaN(after) ? 2 : after,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        data,
      };
    } catch (error: any) {
      this.logger.error(`[getFinancialYears] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch financial years master data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current academic / financial year' })
  getCurrentFinancialYear() {
    try {
      const data = this.masterFinancialYearService.getCurrentFinancialYear();
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data,
      };
    } catch (error: any) {
      this.logger.error(`[getCurrentFinancialYear] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch current financial year',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
