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
  UseGuards,
  Req,
} from '@nestjs/common';
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
import { QuarterlyReviewService } from '../services/quarterly_review.service';
import {
  CreateQuarterlyReviewDto,
  QueryQuarterlyReviewDto,
  SearchQuarterlyReviewDto,
  UpdateQuarterlyReviewDto,
  ManagerEvaluationDto,
  ExportQuarterlyReviewDto,
} from '../dto/quarterly_review.dto';
import { RevealRatingDto } from '../dto/reveal_rating.dto';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';

@ApiTags('Quarterly Review')
@Controller(['quarterly-review', 'quaterly-review', 'master-quaterly-review'])
export class QuarterlyReviewController {
  private readonly logger = new Logger(QuarterlyReviewController.name);

  constructor(private readonly reviewService: QuarterlyReviewService) {}

  /**
   * FR-01: Employee Dashboard View
   * GET /api/quarterly-review/dashboard/employee/:employeeId
   */
  @Get('dashboard/employee/:employeeId')
  @ApiOperation({
    summary: 'Employee Dashboard View (FR-01)',
    description: 'Displays current quarter, submission status, due date, submitted date, and rating status.',
  })
  async getEmployeeDashboard(@Param('employeeId') employeeId: string) {
    return await this.reviewService.getEmployeeDashboard(employeeId);
  }

  /**
   * FR-01: Manager Dashboard View
   * GET /api/quarterly-review/dashboard/manager/:managerId
   */
  @Get('dashboard/manager/:managerId')
  @ApiOperation({
    summary: 'Manager Dashboard View (FR-01)',
    description: 'Displays team member list, pending reviews, completed reviews, and review statistics.',
  })
  async getManagerDashboard(@Param('managerId') managerId: string) {
    return await this.reviewService.getManagerDashboard(managerId);
  }

  /**
   * FR-08: Employee Rating Visibility (Restricted View)
   * GET /api/quarterly-review/:id/employee-view?employeeId=...
   */
  @Get(':id/employee-view')
  @ApiOperation({
    summary: 'Employee Rating Visibility (FR-08)',
    description: 'Returns review status and final rating. Strictly masks manager comments and evaluation notes.',
  })
  async getEmployeeView(
    @Param('id', ParseIntPipe) id: number,
    @Query('employeeId') employeeId: string,
  ) {
    return await this.reviewService.getEmployeeView(id, employeeId);
  }

  @Post(':id/reveal-rating')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reveal final rating after login password check',
    description: 'Checks the logged-in user password and returns the final rating for that review.',
  })
  async revealRating(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevealRatingDto,
    @Req() req: { user: User },
  ) {
    return await this.reviewService.revealRating(id, dto.password, req.user);
  }

  /**
   * Manager View with full submission, remarks and attachments
   * GET /api/quarterly-review/:id/manager-view?managerId=...
   */
  @Get(':id/manager-view')
  @ApiOperation({
    summary: 'Manager Review View (FR-05)',
    description: 'Returns full review including employee submission, ratings, remarks, and attachments.',
  })
  async getManagerView(
    @Param('id', ParseIntPipe) id: number,
    @Query('managerId') managerId: string,
  ) {
    return await this.reviewService.getManagerView(id, managerId);
  }

  /**
   * FR-05, FR-06, FR-07: Submit Manager Evaluation
   * POST /api/quarterly-review/:id/evaluate
   */
  @Post(':id/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit Manager Evaluation (FR-07)',
    description: 'Records 1-5 parameter ratings, remarks, calculates average score, and locks review.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Quarterly review ID' })
  @ApiBody({ type: ManagerEvaluationDto })
  async evaluateReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() evalDto: ManagerEvaluationDto,
  ) {
    return await this.reviewService.evaluateReview(id, evalDto);
  }

  /**
   * FR-09: Manager Download Reports (Export Data)
   * GET /api/quarterly-review/export
   */
  @Get('export')
  @ApiOperation({
    summary: 'Manager Download Reports (FR-09)',
    description: 'Exports evaluation data filtered by quarter, department, rating, and status.',
  })
  async exportReports(@Query() exportDto: ExportQuarterlyReviewDto) {
    return await this.reviewService.exportReports(exportDto);
  }

  /**
   * GET ALL: Fetch all reviews
   * GET /api/quarterly-review
   */
  @Get()
  @ApiOperation({ summary: 'Get all quarterly reviews (getAll)' })
  @ApiOkResponse({ description: 'Returns list of quarterly reviews.' })
  async getAll(@Query() query: QueryQuarterlyReviewDto) {
    return await this.reviewService.findAll(query);
  }

  /**
   * GET BY SEARCH: Search reviews
   * GET /api/quarterly-review/search
   */
  @Get('search')
  @ApiOperation({ summary: 'Search quarterly reviews' })
  async getBySearch(@Query() searchDto: SearchQuarterlyReviewDto) {
    return await this.reviewService.getBySearch(searchDto);
  }

  /**
   * GET BY PARAMS: Filter reviews
   * GET /api/quarterly-review/params
   */
  @Get('params')
  @ApiOperation({ summary: 'Filter quarterly reviews by parameters' })
  async getByParams(@Query() params: QueryQuarterlyReviewDto) {
    return await this.reviewService.getByParams(params);
  }

  /**
   * GET BY ID: Fetch single review
   * GET /api/quarterly-review/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a quarterly review by ID' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return await this.reviewService.findOne(id);
  }

  /**
   * POST: Create review cycle (with Duplicate Check)
   * POST /api/quarterly-review
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new quarterly review cycle' })
  @ApiBody({ type: CreateQuarterlyReviewDto })
  async create(@Body() createDto: CreateQuarterlyReviewDto) {
    return await this.reviewService.create(createDto);
  }

  /**
   * PUT: Update review
   * PUT /api/quarterly-review/:id
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update a quarterly review' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateQuarterlyReviewDto,
  ) {
    return await this.reviewService.update(id, updateDto);
  }

  /**
   * DELETE: Remove review
   * DELETE /api/quarterly-review/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quarterly review' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.reviewService.remove(id);
  }
}

// Aliases
export const QuaterlyReviewController = QuarterlyReviewController;
export type QuaterlyReviewController = QuarterlyReviewController;
export const MasterQuaterlyReviewController = QuarterlyReviewController;
export type MasterQuaterlyReviewController = QuarterlyReviewController;
