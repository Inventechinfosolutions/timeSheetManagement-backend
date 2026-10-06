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
import { QuaterlyReviewService } from '../services/quarterly_review.service';
import {
  CreateQuarterlyReviewDto,
  QueryQuarterlyReviewDto,
  SearchQuarterlyReviewDto,
  UpdateQuarterlyReviewDto,
} from '../dto/quarterly_review.dto';
import { QuaterlyReview } from '../entities/quarterly_review.entities';

@ApiTags('Quarterly Review')
@Controller(['quarterly-review', 'quaterly-review', 'master-quaterly-review'])
export class QuarterlyReviewController {
  private readonly logger = new Logger(QuarterlyReviewController.name);

  constructor(
    private readonly reviewService: QuaterlyReviewService,
  ) { }

  /**
   * 1. GET ALL: Fetch all reviews
   * GET /api/quarterly-review
   */
  @Get()
  @ApiOperation({
    summary: 'Get all quarterly reviews (getAll)',
    description: 'Fetch all quarterly reviews with optional pagination and filters (employeeId, name, department, financialYear, quarter, status, q).',
  })
  @ApiOkResponse({
    description: 'Returns list of quarterly reviews with dynamic metrics, employee details, and performanceIndex.',
  })
  @ApiInternalServerErrorResponse({ description: 'Failed to fetch reviews' })
  async getAll(@Query() query: QueryQuarterlyReviewDto) {
    try {
      this.logger.log(`Fetching all quarterly reviews with query: ${JSON.stringify(query)}`);
      return await this.reviewService.findAll(query);
    } catch (error) {
      this.logger.error(`Error in getAll reviews: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 2. GET BY SEARCH: Search reviews by keyword or filters
   * GET /api/quarterly-review/search?employeeId=...&name=...&department=...&financialYear=...&quarter=...&status=...&q=...
   */
  @Get('search')
  @ApiOperation({
    summary: 'Search quarterly reviews (getBySearch)',
    description: 'Searches across employeeId, name, department, financialYear, quarter, status, description, or keyword q.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search keyword', example: 'EMP-10021' })
  @ApiQuery({ name: 'employeeId', required: false, description: 'Filter by employee ID', example: 'EMP-10021' })
  @ApiQuery({ name: 'name', required: false, description: 'Filter by employee name', example: 'John Doe' })
  @ApiQuery({ name: 'department', required: false, description: 'Filter by department', example: 'IT' })
  @ApiQuery({ name: 'financialYear', required: false, description: 'Filter by financial year', example: '2025-2026' })
  @ApiQuery({ name: 'quarter', required: false, description: 'Filter by quarter (Q1, Q2, Q3, Q4)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by review status' })
  @ApiOkResponse({
    description: 'Returns reviews matching search keyword or filters.',
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiInternalServerErrorResponse({ description: 'Failed to search reviews' })
  async getBySearch(@Query() searchDto: SearchQuarterlyReviewDto) {
    try {
      this.logger.log(`Searching quarterly reviews with params: ${JSON.stringify(searchDto)}`);
      return await this.reviewService.getBySearch(searchDto);
    } catch (error) {
      this.logger.error(`Error in getBySearch: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 3. GET BY PARAMS: Filter reviews by specific query parameters
   * GET /api/quarterly-review/params?employeeId=...&financialYear=...
   */
  @Get('params')
  @ApiOperation({
    summary: 'Filter quarterly reviews by parameters (getByParams)',
    description: 'Filter reviews specifically by employeeId, name, department, financialYear, quarter, status, assignerId, employeeType, or assignedBy.',
  })
  @ApiOkResponse({
    description: 'Returns filtered quarterly reviews.',
  })
  @ApiBadRequestResponse({ description: 'Invalid filter parameters' })
  @ApiInternalServerErrorResponse({ description: 'Failed to filter reviews' })
  async getByParams(@Query() params: QueryQuarterlyReviewDto) {
    try {
      this.logger.log(`Filtering quarterly reviews with params: ${JSON.stringify(params)}`);
      return await this.reviewService.getByParams(params);
    } catch (error) {
      this.logger.error(`Error in getByParams: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 4. GET BY ID: Fetch single review by ID
   * GET /api/quarterly-review/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a quarterly review by ID (getById)' })
  @ApiParam({ name: 'id', type: Number, description: 'Quarterly review ID' })
  @ApiOkResponse({
    description: 'Returns quarterly review details.',
    type: QuaterlyReview,
  })
  @ApiNotFoundResponse({ description: 'Quarterly review not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Fetching quarterly review with ID: ${id}`);
      return await this.reviewService.findOne(id);
    } catch (error) {
      this.logger.error(`Error in getById: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 5. POST: Create review
   * POST /api/quarterly-review
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new quarterly review' })
  @ApiBody({ type: CreateQuarterlyReviewDto })
  @ApiCreatedResponse({
    description: 'Quarterly review created successfully.',
    type: QuaterlyReview,
  })
  @ApiBadRequestResponse({ description: 'Invalid request body or validation failed' })
  @ApiInternalServerErrorResponse({ description: 'Failed to create review' })
  async create(@Body() createDto: CreateQuarterlyReviewDto) {
    try {
      this.logger.log(`Creating quarterly review for employee: ${createDto.employeeId}`);
      return await this.reviewService.create(createDto);
    } catch (error) {
      this.logger.error(`Error in create review: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 6. PUT: Update review
   * PUT /api/quarterly-review/:id
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update a quarterly review' })
  @ApiParam({ name: 'id', type: Number, description: 'Quarterly review ID' })
  @ApiBody({ type: UpdateQuarterlyReviewDto })
  @ApiOkResponse({
    description: 'Quarterly review updated successfully.',
    type: QuaterlyReview,
  })
  @ApiNotFoundResponse({ description: 'Quarterly review not found' })
  @ApiBadRequestResponse({ description: 'Invalid update body' })
  @ApiInternalServerErrorResponse({ description: 'Failed to update review' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateQuarterlyReviewDto,
  ) {
    try {
      this.logger.log(`Updating quarterly review ID ${id} with: ${JSON.stringify(updateDto)}`);
      return await this.reviewService.update(id, updateDto);
    } catch (error) {
      this.logger.error(`Error in update review: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 7. DELETE: Remove review
   * DELETE /api/quarterly-review/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quarterly review' })
  @ApiParam({ name: 'id', type: Number, description: 'Quarterly review ID' })
  @ApiOkResponse({
    description: 'Quarterly review deleted successfully.',
  })
  @ApiNotFoundResponse({ description: 'Quarterly review not found' })
  @ApiInternalServerErrorResponse({ description: 'Failed to delete review' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Deleting quarterly review ID: ${id}`);
      return await this.reviewService.remove(id);
    } catch (error) {
      this.logger.error(`Error in delete review: ${error.message}`, error.stack);
      throw error;
    }
  }
}

// Aliases
export const QuaterlyReviewController = QuarterlyReviewController;
export type QuaterlyReviewController = QuarterlyReviewController;
export const MasterQuaterlyReviewController = QuarterlyReviewController;
export type MasterQuaterlyReviewController = QuarterlyReviewController;
