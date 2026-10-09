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
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BufferedFile } from '../../common/s3-client/file.model';
import {
  ApiTags,
  ApiOperation,
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
  SubmitReviewDto,
  RequestEditPermissionDto,
  RespondEditPermissionDto,
} from '../dto/employee_performance.dto';
import { EmployeePerformance } from '../entities/employee_performance.entity';

@ApiTags('Employee Performance')
@Controller(['employee-performance', 'master-employee-performance'])
export class EmployeePerformanceController {
  constructor(
    private readonly performanceService: EmployeePerformanceService,
  ) {}

  /**
   * FR-03: Save Draft
   * POST /api/employee-performance/draft
   */
  @Post('draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save Draft (FR-03)',
    description: 'Saves incomplete quarterly submission so the employee can resume editing later.',
  })
  @ApiBody({ type: CreateEmployeePerformanceDto })
  async saveDraft(@Body() draftDto: CreateEmployeePerformanceDto) {
    return await this.performanceService.saveDraft(draftDto);
  }

  /**
   * FR-04: Submit Review
   * PUT /api/employee-performance/:id/submit
   * The row already exists, so submit is an update.
   */
  @Put(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit Review (FR-04)',
    description: 'Validates mandatory fields, changes status to Submitted, and locks employee editing.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: SubmitReviewDto })
  async submitReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() submitDto: SubmitReviewDto,
  ) {
    return await this.performanceService.submitReview(id, submitDto);
  }

  /**
   * Request Edit Permission by ID (PUT by ID)
   * PUT /api/employee-performance/:id/request-edit or PUT /api/employee-performance/request-edit
   */
  @Put(':id/request-edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request Edit Permission by ID (PUT /:id/request-edit)',
    description: 'Allows an employee to request edit permission for an existing performance record by ID.',
  })
  async requestEditPut(
    @Param('id', ParseIntPipe) id: number,
    @Body() requestDto: RequestEditPermissionDto,
  ) {
    return await this.performanceService.requestEditPermission({
      ...requestDto,
      performanceId: id,
    });
  }

  @Put('request-edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request Edit Permission (PUT)' })
  async requestEditPutLegacy(@Body() requestDto: RequestEditPermissionDto) {
    return await this.performanceService.requestEditPermission(requestDto);
  }

  @Post('request-edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request Edit Permission (POST legacy)' })
  @ApiBody({ type: RequestEditPermissionDto })
  async requestEdit(@Body() requestDto: RequestEditPermissionDto) {
    return await this.performanceService.requestEditPermission(requestDto);
  }

  /**
   * Manager responds to Edit Permission by ID (PUT by ID)
   * PUT /api/employee-performance/:id/respond-edit or PUT /api/employee-performance/respond-edit
   */
  @Put(':id/respond-edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manager Responds to Edit Request by ID (PUT /:id/respond-edit)',
    description: 'Manager approves or rejects edit permission on an existing performance record by ID.',
  })
  async respondEditPut(
    @Param('id', ParseIntPipe) id: number,
    @Body() respondDto: RespondEditPermissionDto,
  ) {
    return await this.performanceService.respondEditPermission({
      ...respondDto,
      performanceId: id,
    });
  }

  @Put('respond-edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager Responds to Edit Permission (PUT)' })
  async respondEditPutLegacy(@Body() respondDto: RespondEditPermissionDto) {
    return await this.performanceService.respondEditPermission(respondDto);
  }

  @Post('respond-edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager Responds to Edit Permission (POST legacy)' })
  @ApiBody({ type: RespondEditPermissionDto })
  async respondEdit(@Body() respondDto: RespondEditPermissionDto) {
    return await this.performanceService.respondEditPermission(respondDto);
  }

  /**
   * List Edit Requests
   * GET /api/employee-performance/edit-requests?managerId=...&employeeId=...
   */
  @Get('edit-requests')
  @ApiOperation({ summary: 'List Edit Requests' })
  @ApiQuery({ name: 'managerId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'q', required: false })
  async getEditRequests(
    @Query('managerId') managerId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('q') q?: string,
  ) {
    return await this.performanceService.getEditRequests(managerId, employeeId, q);
  }

  /**
   * GET ALL: Fetch all performance records
   * GET /api/employee-performance
   */
  @Get()
  @ApiOperation({ summary: 'Get all employee performance records' })
  async getAll(@Query() query: QueryEmployeePerformanceDto) {
    return await this.performanceService.findAll(query);
  }

  /**
   * GET BY SEARCH: Search performance records
   * GET /api/employee-performance/search
   */
  @Get('search')
  @ApiOperation({ summary: 'Search employee performance records' })
  async getBySearch(@Query() searchDto: SearchEmployeePerformanceDto) {
    return await this.performanceService.getBySearch(searchDto);
  }

  /**
   * GET BY PARAMS: Filter performance records
   * GET /api/employee-performance/params
   */
  @Get('params')
  @ApiOperation({ summary: 'Filter performance records by parameters' })
  async getByParams(@Query() params: QueryEmployeePerformanceDto) {
    return await this.performanceService.getByParams(params);
  }

  /**
   * GET BY ID: Fetch single record
   * GET /api/employee-performance/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get an employee performance record by ID' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.findOne(id);
  }

  /**
   * POST: Create or save performance
   * POST /api/employee-performance
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new employee performance record' })
  @ApiBody({ type: CreateEmployeePerformanceDto })
  async create(@Body() createDto: CreateEmployeePerformanceDto) {
    return await this.performanceService.create(createDto);
  }

  /**
   * POST: Upload one attachment to MinIO and store the object key
   * POST /api/employee-performance/:id/attachments
   */
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a performance attachment to object storage' })
  async addAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: BufferedFile,
  ) {
    return await this.performanceService.addAttachment(id, file);
  }

  /**
   * DELETE: Remove one stored attachment
   * DELETE /api/employee-performance/:id/attachments?objectKey=
   */
  @Delete(':id/attachments')
  @ApiOperation({ summary: 'Remove a performance attachment from object storage' })
  async removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Query('objectKey') objectKey: string,
  ) {
    return await this.performanceService.removeAttachment(id, objectKey);
  }

  /**
   * PUT: Update performance record (Guarded by Submission Lock & Edit Window)
   * PUT /api/employee-performance/:id
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update an employee performance record (Guarded by Lock & Expiry)' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateEmployeePerformanceDto,
  ) {
    return await this.performanceService.update(id, updateDto);
  }

  /**
   * DELETE: Remove performance record
   * DELETE /api/employee-performance/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee performance record' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.remove(id);
  }
}

// Backward compatibility aliases
export const MasterEmployeePerformanceController = EmployeePerformanceController;
export type MasterEmployeePerformanceController = EmployeePerformanceController;
