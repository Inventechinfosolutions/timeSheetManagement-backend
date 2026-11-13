import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BufferedFile } from '../../common/s3-client/file.model';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
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
  PerformanceProjectDto,
  UpdatePerformanceProjectDto,
} from '../dto/employee_performance.dto';
import {
  OverviewStepRequestDto,
  AchievementsStepRequestDto,
  TeamworkStepRequestDto,
  LearningStepRequestDto,
  EnvironmentStepRequestDto,
  FinalReviewStepRequestDto,
} from '../dto/request';
import {
  OverviewStepResponseDto,
  AchievementsStepResponseDto,
  TeamworkStepResponseDto,
  LearningStepResponseDto,
  EnvironmentStepResponseDto,
  FinalReviewStepResponseDto,
  PerformanceFullResponseDto,
} from '../dto/response';
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
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manager Responds to Edit Request by ID (PUT /:id/respond-edit)',
    description: 'Manager approves or rejects edit permission on an existing performance record by ID.',
  })
  async respondEditPut(
    @Param('id', ParseIntPipe) id: number,
    @Body() respondDto: RespondEditPermissionDto,
    @Req() req: { user: User },
  ) {
    return await this.performanceService.respondEditPermission({
      ...respondDto,
      performanceId: id,
    }, req.user);
  }

  @Put('respond-edit')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager Responds to Edit Permission (PUT)' })
  async respondEditPutLegacy(@Body() respondDto: RespondEditPermissionDto, @Req() req: { user: User }) {
    return await this.performanceService.respondEditPermission(respondDto, req.user);
  }

  @Post('respond-edit')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager Responds to Edit Permission (POST legacy)' })
  @ApiBody({ type: RespondEditPermissionDto })
  async respondEdit(@Body() respondDto: RespondEditPermissionDto, @Req() req: { user: User }) {
    return await this.performanceService.respondEditPermission(respondDto, req.user);
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
   * GET: Download an attachment from MinIO
   * GET /api/employee-performance/attachments/download?objectKey=
   */
  @Get('attachments/download')
  @ApiOperation({ summary: 'Download a performance attachment' })
  async downloadAttachment(
    @Query('objectKey') objectKey: string,
    @Res() res: any,
  ) {
    return await this.performanceService.streamAttachment(objectKey, res, false);
  }

  /**
   * GET: Preview/view an attachment inline from MinIO
   * GET /api/employee-performance/attachments/view?objectKey=
   */
  @Get('attachments/view')
  @ApiOperation({ summary: 'View/preview a performance attachment inline' })
  async viewAttachment(
    @Query('objectKey') objectKey: string,
    @Res() res: any,
  ) {
    return await this.performanceService.streamAttachment(objectKey, res, true);
  }

  /** Step 1 — Overview (declared before :id so paths resolve correctly) */
  @Get(':id/overview')
  @ApiOperation({ summary: 'Get Step 1 overview only' })
  @ApiOkResponse({ type: OverviewStepResponseDto })
  async getOverview(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.getStep(id, 'overview');
  }

  @Patch(':id/overview')
  @ApiOperation({ summary: 'PATCH Step 1 overview — send only changed fields' })
  @ApiBody({ type: OverviewStepRequestDto })
  @ApiOkResponse({ type: OverviewStepResponseDto })
  async patchOverview(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: OverviewStepRequestDto,
  ) {
    return await this.performanceService.patchStep(id, 'overview', body as Record<string, unknown>);
  }

  /** Step 2 — Achievements */
  @Get(':id/achievements')
  @ApiOperation({ summary: 'Get Step 2 achievements / projects only' })
  @ApiOkResponse({ type: AchievementsStepResponseDto })
  async getAchievements(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.getStep(id, 'achievements');
  }

  @Patch(':id/achievements')
  @ApiOperation({ summary: 'PATCH Step 2 achievements — send only changed fields' })
  @ApiBody({ type: AchievementsStepRequestDto })
  @ApiOkResponse({ type: AchievementsStepResponseDto })
  async patchAchievements(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AchievementsStepRequestDto,
  ) {
    return await this.performanceService.patchStep(id, 'achievements', body as Record<string, unknown>);
  }

  /** Step 3 — Teamwork */
  @Get(':id/teamwork')
  @ApiOperation({ summary: 'Get Step 3 teamwork only' })
  @ApiOkResponse({ type: TeamworkStepResponseDto })
  async getTeamwork(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.getStep(id, 'teamwork');
  }

  @Patch(':id/teamwork')
  @ApiOperation({ summary: 'PATCH Step 3 teamwork — send only changed fields' })
  @ApiBody({ type: TeamworkStepRequestDto })
  @ApiOkResponse({ type: TeamworkStepResponseDto })
  async patchTeamwork(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TeamworkStepRequestDto,
  ) {
    return await this.performanceService.patchStep(id, 'teamwork', body as Record<string, unknown>);
  }

  /** Step 4 — Learning */
  @Get(':id/learning')
  @ApiOperation({ summary: 'Get Step 4 learning only' })
  @ApiOkResponse({ type: LearningStepResponseDto })
  async getLearning(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.getStep(id, 'learning');
  }

  @Patch(':id/learning')
  @ApiOperation({ summary: 'PATCH Step 4 learning — send only changed fields' })
  @ApiBody({ type: LearningStepRequestDto })
  @ApiOkResponse({ type: LearningStepResponseDto })
  async patchLearning(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: LearningStepRequestDto,
  ) {
    return await this.performanceService.patchStep(id, 'learning', body as Record<string, unknown>);
  }

  /** Step 5 — Environment */
  @Get(':id/environment')
  @ApiOperation({ summary: 'Get Step 5 environment only' })
  @ApiOkResponse({ type: EnvironmentStepResponseDto })
  async getEnvironment(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.getStep(id, 'environment');
  }

  @Patch(':id/environment')
  @ApiOperation({ summary: 'PATCH Step 5 environment — send only changed fields' })
  @ApiBody({ type: EnvironmentStepRequestDto })
  @ApiOkResponse({ type: EnvironmentStepResponseDto })
  async patchEnvironment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EnvironmentStepRequestDto,
  ) {
    return await this.performanceService.patchStep(id, 'environment', body as Record<string, unknown>);
  }

  /** Step 6 — Final review */
  @Get(':id/final-review')
  @ApiOperation({ summary: 'Get Step 6 final review only' })
  @ApiOkResponse({ type: FinalReviewStepResponseDto })
  async getFinalReview(@Param('id', ParseIntPipe) id: number) {
    return await this.performanceService.getStep(id, 'final-review');
  }

  @Patch(':id/final-review')
  @ApiOperation({ summary: 'PATCH Step 6 final review — send only changed fields' })
  @ApiBody({ type: FinalReviewStepRequestDto })
  @ApiOkResponse({ type: FinalReviewStepResponseDto })
  async patchFinalReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FinalReviewStepRequestDto,
  ) {
    return await this.performanceService.patchStep(id, 'final-review', body as Record<string, unknown>);
  }

  /**
   * GET BY ID: Full appraisal (all 6 steps + assignment meta) — +1 overall API
   * GET /api/employee-performance/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get full employee performance record by ID (all steps)' })
  @ApiOkResponse({ type: PerformanceFullResponseDto })
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
   * DELETE: Remove one project from performance record
   * DELETE /api/employee-performance/:id/projects/:index
   */
  @Delete(':id/projects/:index')
  @ApiOperation({ summary: 'Delete a project — returns achievements step only' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'index', type: Number })
  @ApiOkResponse({ type: AchievementsStepResponseDto })
  async removeProject(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return await this.performanceService.removeProject(id, index);
  }

  @Delete(':id/projects')
  @ApiOperation({ summary: 'Delete a project by query index — returns achievements step only' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'index', type: Number })
  @ApiOkResponse({ type: AchievementsStepResponseDto })
  async removeProjectByQuery(
    @Param('id', ParseIntPipe) id: number,
    @Query('index', ParseIntPipe) index: number,
  ) {
    return await this.performanceService.removeProject(id, index);
  }

  @Post(':id/projects')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add one project — returns achievements step only (not full performance)',
  })
  @ApiOkResponse({ type: AchievementsStepResponseDto })
  async addProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() project: PerformanceProjectDto,
  ) {
    return await this.performanceService.addProject(id, project);
  }

  @Patch(':id/projects/:index')
  @ApiOperation({
    summary: 'Update one project (changed fields only) — returns achievements step only',
  })
  @ApiOkResponse({ type: AchievementsStepResponseDto })
  async patchProject(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
    @Body() project: UpdatePerformanceProjectDto,
  ) {
    return await this.performanceService.patchProject(id, index, project);
  }

  /**
   * PATCH: Update only the fields sent in the body
   * PATCH /api/employee-performance/:id
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update an employee performance record with only the changed fields' })
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateEmployeePerformanceDto,
  ) {
    return await this.performanceService.update(id, updateDto);
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
