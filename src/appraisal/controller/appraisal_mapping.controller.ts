import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AppraisalMappingService } from '../services/appraisal_mapping.service';
import {
  BulkCreateAppraisalMappingDto,
  CreateAppraisalMappingDto,
} from '../dto/appraisal_mapping.dto';

@ApiTags('Appraisal Mapping')
@Controller('appraisal-mapping')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AppraisalMappingController {
  constructor(private readonly mappingService: AppraisalMappingService) {}

  @Get()
  @ApiOperation({ summary: 'List appraisal mappings' })
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('assignerId') assignerId?: string,
    @Query('status') status?: string,
    @Query('paginate') paginate?: string,
  ) {
    return this.mappingService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
      department,
      assignerId,
      status,
      paginate: paginate !== 'false',
    });
  }

  @Get('mapped-employee-ids')
  @ApiOperation({ summary: 'Employee IDs that already have an active appraisal mapping' })
  async mappedEmployeeIds() {
    return this.mappingService.getMappedEmployeeIds();
  }

  @Get('by-assigner/:assignerId')
  @ApiOperation({ summary: 'Employees mapped under an assigner (optional department/status)' })
  async byAssigner(
    @Param('assignerId') assignerId: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
  ) {
    return this.mappingService.findByAssigner(assignerId, { department, status });
  }

  @Get('by-employee/:employeeId')
  @ApiOperation({ summary: 'Active appraisal mapping for one employee (null if old flow)' })
  async byEmployee(@Param('employeeId') employeeId: string) {
    const mapping = await this.mappingService.findActiveByEmployeeId(employeeId);
    return mapping
      ? {
          id: mapping.id,
          department: mapping.department,
          assignerId: mapping.assignerId,
          assignerName: mapping.assignerName,
          assignerType: mapping.assignerType,
          employeeId: mapping.employeeId,
          employeeName: mapping.employeeName,
          status: mapping.status,
        }
      : null;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create one appraisal mapping' })
  async create(@Body() dto: CreateAppraisalMappingDto) {
    return this.mappingService.create(dto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create many appraisal mappings' })
  async createBulk(@Body() body: BulkCreateAppraisalMappingDto) {
    return this.mappingService.createBulk(body.items || []);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate an appraisal mapping' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.mappingService.deactivate(id);
  }
}
