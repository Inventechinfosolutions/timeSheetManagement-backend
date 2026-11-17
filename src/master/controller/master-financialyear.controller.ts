import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { MasterFinancialYearService } from '../service/master-financialyear.service';
import { QueryFinancialYearDto } from '../dto/financial-year.dto';
import { MasterFinancialYear } from '../models/master-financialyear.entity';
import { FinancialYearQuarter } from '../enums/financial-year.enums';

@ApiTags('Master Financial Year')
@Controller('master-financialyear')
export class MasterFinancialYearController {
  private readonly logger = new Logger(MasterFinancialYearController.name);

  constructor(private readonly financialYearService: MasterFinancialYearService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all financial years or fetch selected financial year dynamically',
    description:
      'When an employee selects a financial year or quarter, only that particular data is returned. If no filter is passed, all financial years are returned with dynamic quarters (Q1, Q2, Q3, Q4).',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns financial year data (all financial years or filtered).',
  })
  findAll(@Query() query: QueryFinancialYearDto) {
    try {
      this.logger.log(`GET /master-financialyear query: ${JSON.stringify(query)}`);
      return this.financialYearService.findAll(query);
    } catch (error) {
      this.logger.error(`Error in findAll: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('financial-year/:financialYear')
  @ApiOperation({ summary: 'Get details for a specific financial year (e.g., 2025-2026)' })
  @ApiParam({
    name: 'financialYear',
    description: 'Financial Year (e.g., 2025-2026)',
    example: '2025-2026',
  })
  @ApiQuery({
    name: 'quarter',
    enum: FinancialYearQuarter,
    required: false,
    description: 'Quarter label within the financial year (Q1, Q2, Q3, Q4)',
    example: FinancialYearQuarter.Q1,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the selected financial year details.',
  })
  findByFinancialYear(
    @Param('financialYear') financialYear: string,
    @Query('quarter') quarter?: FinancialYearQuarter,
  ) {
    try {
      this.logger.log(`GET /master-financialyear/financial-year/${financialYear} with quarter: ${quarter}`);
      return this.financialYearService.findByFinancialYear(financialYear, quarter);
    } catch (error) {
      this.logger.error(`Error in findByFinancialYear: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a financial year by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Financial Year ID' })
  @ApiQuery({
    name: 'quarter',
    enum: FinancialYearQuarter,
    required: false,
    description: 'Quarter label within the financial year (Q1, Q2, Q3, Q4)',
  })
  @ApiResponse({ status: 200, description: 'Return financial year by ID.', type: MasterFinancialYear })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('quarter') quarter?: FinancialYearQuarter,
  ) {
    try {
      this.logger.log(`Fetching financial year ID: ${id}`);
      return this.financialYearService.findOne(id, quarter);
    } catch (error) {
      this.logger.error(`Error fetching financial year ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
