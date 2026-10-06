import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { MasterQuaterlyService } from '../service/master-quaterly.service';
import { QueryQuaterlyDto } from '../dto/query-quaterly.dto';
import { MasterQuaterly } from '../models/master-quaterly.entity';
import { QuaterlyEnum } from '../enums/quaterly.enums';

@ApiTags('Master Quaterly')
@Controller('master-quaterly')
export class MasterQuaterlyController {
  private readonly logger = new Logger(MasterQuaterlyController.name);

  constructor(private readonly quaterlyService: MasterQuaterlyService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all quarters or fetch selected quarter dynamically (Q1, Q2, Q3, Q4)',
    description:
      'When an employee selects a quarter (e.g. ?quarter=Q1), only that particular quarter data is returned. If no quarter is passed, all quarters are returned.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns quarterly data (all quarters or selected quarter).',
  })
  findAll(@Query() query: QueryQuaterlyDto) {
    try {
      this.logger.log(`GET /master-quaterly query: ${JSON.stringify(query)}`);
      return this.quaterlyService.findAll(query);
    } catch (error) {
      this.logger.error(`Error in findAll: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('quarter/:quaterLabel')
  @ApiOperation({ summary: 'Get details for a specific quarter (Q1, Q2, Q3, Q4)' })
  @ApiParam({
    name: 'quaterLabel',
    enum: QuaterlyEnum,
    description: 'Quarter label (e.g., Q1, Q2, Q3, Q4)',
    example: 'Q1',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Fiscal or calendar year for date calculation (defaults to current year)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the selected quarter details.',
  })
  findByQuarter(
    @Param('quaterLabel') quaterLabel: string,
    @Query('year') year?: number,
  ) {
    try {
      this.logger.log(`GET /master-quaterly/quarter/${quaterLabel} with year: ${year}`);
      return this.quaterlyService.findByQuarter(quaterLabel, year ? Number(year) : undefined);
    } catch (error) {
      this.logger.error(`Error in findByQuarter: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a quarter by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Quarter ID' })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Year for date calculation',
  })
  @ApiResponse({ status: 200, description: 'Return quarter by ID.', type: MasterQuaterly })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year?: number,
  ) {
    try {
      this.logger.log(`Fetching quarter ID: ${id}`);
      return this.quaterlyService.findOne(id, year ? Number(year) : undefined);
    } catch (error) {
      this.logger.error(`Error fetching quarter ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

}