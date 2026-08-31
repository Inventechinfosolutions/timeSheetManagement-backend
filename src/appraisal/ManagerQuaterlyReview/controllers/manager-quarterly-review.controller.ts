import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpStatus,
  HttpCode,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ManagerQuarterlyReviewService } from '../services/manager-quarterly-review.service';
import { ManagerEvaluationDto } from '../dto/manager-evaluation.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Manager Quarterly Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('manager-quarterly-review')
export class ManagerQuarterlyReviewController {
  private readonly logger = new Logger(ManagerQuarterlyReviewController.name);

  constructor(private readonly managerQuarterlyReviewService: ManagerQuarterlyReviewService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get summary statistics for manager quarterly review dashboard' })
  async getStats(@Req() req: any) {
    this.logger.log(`Fetching stats for manager: ${req.user?.loginId}`);
    const stats = await this.managerQuarterlyReviewService.getStats(req.user);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: stats,
    };
  }

  // Registered before the bare list route is irrelevant here since 'filters'
  // is a static segment too — Nest matches static segments ('stats',
  // 'filters') before the dynamic ':employeeId' segment gets a chance to
  // swallow them, same reasoning as the note on the ':employeeId' route below.
  @Get('filters')
  @ApiOperation({ summary: 'Get distinct filter option values (quarters) for the manager\'s team' })
  async getFilterOptions(@Req() req: any) {
    const quarters = await this.managerQuarterlyReviewService.getQuarterOptions(req.user);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: { quarters },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get team quarterly review submissions for logged-in manager (paginated)' })
  async getTeamSubmissions(
    @Req() req: any,
    @Query('quarter') quarter?: string,
    @Query('status') status?: string,
    @Query('quarterCard') quarterCard?: string,
    @Query('year') year?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;

    this.logger.log(
      `Fetching team submissions for manager ${req.user?.loginId}, quarter: ${quarter || 'all'}, ` +
        `status: ${status || 'all'}, page: ${parsedPage}, pageSize: ${parsedPageSize}`,
    );

    const result = await this.managerQuarterlyReviewService.getTeamSubmissions(req.user, {
      quarter,
      status,
      quarterCard,
      year,
      search,
      page: parsedPage,
      pageSize: parsedPageSize,
    });

    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: result.data,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  // NOTE: registered after 'stats', 'filters', and the bare list route above,
  // so those still resolve correctly — Nest matches static path segments
  // before this dynamic ':employeeId' segment gets a chance to swallow them.
  @Get(':employeeId')
  @ApiOperation({ summary: 'Get single quarterly review submission by employee ID' })
  async getSubmissionByEmployeeId(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
    @Query('quarter') quarter?: string,
  ) {
    this.logger.log(`Fetching review for employeeId ${employeeId}, manager ${req.user?.loginId}`);
    const submission = await this.managerQuarterlyReviewService.getSubmissionByEmployeeId(
      req.user,
      employeeId,
      quarter,
    );
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: submission,
    };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit final manager evaluation for employee quarterly review' })
  async submitReview(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManagerEvaluationDto,
  ) {
    this.logger.log(`Manager ${req.user?.loginId} submitting final review for submission ID ${id}`);
    const updated = await this.managerQuarterlyReviewService.evaluateReview(
      req.user,
      id,
      dto,
      false,
    );
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Manager evaluation submitted successfully',
      data: updated,
    };
  }

  @Post(':id/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save draft of manager evaluation for employee quarterly review' })
  async saveDraft(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManagerEvaluationDto,
  ) {
    this.logger.log(`Manager ${req.user?.loginId} saving draft review for submission ID ${id}`);
    const updated = await this.managerQuarterlyReviewService.evaluateReview(
      req.user,
      id,
      dto,
      true,
    );
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Evaluation draft saved successfully',
      data: updated,
    };
  }
}
