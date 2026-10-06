import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  Logger,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { EmployeePerformanceService } from '../services/employee_performance.service';
import {
  CreateEmployeePerformanceDto,
  QueryEmployeePerformanceDto,
  SearchEmployeePerformanceDto,
  UpdateEmployeePerformanceDto,
} from '../dto/employee_performance.dto';
import { EmployeePerformance } from '../entities/employee_performance.entity';

@ApiTags('Employee Performance')
@Controller(['employee-performance', 'master-employee-performance'])
export class EmployeePerformanceController {
  private readonly logger = new Logger(EmployeePerformanceController.name);

  constructor(
    private readonly performanceService: EmployeePerformanceService,
  ) {}

  /**
   * 1. GET ALL / GET BY QUERY: Fetch all performance records with optional query filters
   * GET /api/employee-performance
   */
  @Get()
  @ApiOperation({
    summary: 'Get all employee performance records (getAll / getByQuery)',
    description: 'Fetch all performance records with optional filtering by employeeId, name, department, quarter, financialYear, and status.',
  })
  @ApiOkResponse({
    description: 'Returns list of employee performance records with dynamic average scores and employee details.',
  })
  @ApiInternalServerErrorResponse({ description: 'Failed to fetch performance records' })
  async getAll(@Query() query: QueryEmployeePerformanceDto) {
    try {
      this.logger.log(`Fetching all employee performance records with params: ${JSON.stringify(query)}`);
      return await this.performanceService.findAll(query);
    } catch (error) {
      this.logger.error(`Error in getAll performance records: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 2. GET BY SEARCH: Search performance records by keyword or filters
   * GET /api/employee-performance/search?employeeId=...&name=...&department=...&financialYear=...&quarter=...&status=...&q=...
   */
  @Get('search')
  @ApiOperation({
    summary: 'Search employee performance records (getBySearch)',
    description: 'Search across projectTitle, employeeId, name, department, financialYear, quarter, status, overview, description, and challenge.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search keyword', example: 'Microservices' })
  @ApiQuery({ name: 'employeeId', required: false, description: 'Filter by employee ID', example: 'EMP-10021' })
  @ApiQuery({ name: 'name', required: false, description: 'Filter by employee name', example: 'John Doe' })
  @ApiQuery({ name: 'department', required: false, description: 'Filter by department', example: 'IT' })
  @ApiQuery({ name: 'financialYear', required: false, description: 'Filter by financial year', example: '2025-2026' })
  @ApiQuery({ name: 'quarter', required: false, description: 'Filter by quarter (Q1, Q2, Q3, Q4)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiOkResponse({
    description: 'Returns matching performance records.',
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiInternalServerErrorResponse({ description: 'Failed to search performance records' })
  async getBySearch(@Query() searchDto: SearchEmployeePerformanceDto) {
    try {
      this.logger.log(`Searching employee performance records with params: ${JSON.stringify(searchDto)}`);
      return await this.performanceService.getBySearch(searchDto);
    } catch (error) {
      this.logger.error(`Error in getBySearch: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 3. GET BY PARAMS: Filter performance records by specific parameters
   * GET /api/employee-performance/params?employeeId=...&quarter=Q1
   */
  @Get('params')
  @ApiOperation({
    summary: 'Filter performance records by parameters (getByParams)',
    description: 'Filter performance records specifically by employeeId, name, department, quarter, financialYear, or status.',
  })
  @ApiOkResponse({
    description: 'Returns filtered performance records.',
  })
  @ApiBadRequestResponse({ description: 'Invalid filter parameters' })
  @ApiInternalServerErrorResponse({ description: 'Failed to filter performance records' })
  async getByParams(@Query() params: QueryEmployeePerformanceDto) {
    try {
      this.logger.log(`Filtering employee performance with params: ${JSON.stringify(params)}`);
      return await this.performanceService.getByParams(params);
    } catch (error) {
      this.logger.error(`Error in getByParams: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 4. GET BY ID: Fetch single performance record by ID
   * GET /api/employee-performance/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get an employee performance record by ID (getById)' })
  @ApiParam({ name: 'id', type: Number, description: 'Performance record ID' })
  @ApiOkResponse({
    description: 'Returns employee performance record details.',
    type: EmployeePerformance,
  })
  @ApiNotFoundResponse({ description: 'Performance record not found' })
  @ApiInternalServerErrorResponse({ description: 'Failed to fetch performance record' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Fetching employee performance record with ID: ${id}`);
      return await this.performanceService.findOne(id);
    } catch (error) {
      this.logger.error(`Error in getById: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 5. POST: Create a new performance record
   * POST /api/employee-performance
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new employee performance record' })
  @ApiBody({ type: CreateEmployeePerformanceDto })
  @ApiCreatedResponse({
    description: 'Employee performance record created successfully.',
    type: EmployeePerformance,
  })
  @ApiBadRequestResponse({ description: 'Invalid request body or validation failed' })
  @ApiInternalServerErrorResponse({ description: 'Failed to create performance record' })
  async create(@Body() createDto: CreateEmployeePerformanceDto) {
    try {
      this.logger.log(`Creating employee performance record for: ${createDto.employeeId}`);
      return await this.performanceService.create(createDto);
    } catch (error) {
      this.logger.error(`Error in create performance record: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 6. PUT: Update an existing performance record
   * PUT /api/employee-performance/:id
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update an employee performance record' })
  @ApiParam({ name: 'id', type: Number, description: 'Performance record ID' })
  @ApiBody({ type: UpdateEmployeePerformanceDto })
  @ApiOkResponse({
    description: 'Employee performance record updated successfully.',
    type: EmployeePerformance,
  })
  @ApiNotFoundResponse({ description: 'Performance record not found' })
  @ApiBadRequestResponse({ description: 'Invalid update body' })
  @ApiInternalServerErrorResponse({ description: 'Failed to update performance record' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateEmployeePerformanceDto,
  ) {
    try {
      this.logger.log(`Updating employee performance record ID ${id} with: ${JSON.stringify(updateDto)}`);
      return await this.performanceService.update(id, updateDto);
    } catch (error) {
      this.logger.error(`Error in update performance record: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 7. DELETE: Remove a performance record
   * DELETE /api/employee-performance/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee performance record' })
  @ApiParam({ name: 'id', type: Number, description: 'Performance record ID' })
  @ApiOkResponse({
    description: 'Employee performance record deleted successfully.',
  })
  @ApiNotFoundResponse({ description: 'Performance record not found' })
  @ApiInternalServerErrorResponse({ description: 'Failed to delete performance record' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Deleting employee performance record ID: ${id}`);
      return await this.performanceService.remove(id);
    } catch (error) {
      this.logger.error(`Error in delete performance record: ${error.message}`, error.stack);
      throw error;
    }
  }
}

// Backward compatibility aliases
export const MasterEmployeePerformanceController = EmployeePerformanceController;
export type MasterEmployeePerformanceController = EmployeePerformanceController;
