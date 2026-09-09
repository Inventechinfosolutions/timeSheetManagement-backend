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
  HttpException,
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
  async getStats(
    @Req() req: any,
    @Query('quarter') quarter?: string,
    @Query('financialYear') financialYear?: string,
    @Query('year') year?: string,
  ) {
    try {
      this.logger.log(`Fetching stats for manager: ${req.user?.loginId}, quarter=${quarter}, financialYear=${financialYear || year}`);
      const stats = await this.managerQuarterlyReviewService.getStats(req.user, {
        quarter,
        financialYear: financialYear || year,
      });
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: stats,
      };
    } catch (error: any) {
      this.logger.error(`[getStats] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch manager quarterly review stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('filters')
  @ApiOperation({ summary: 'Get distinct filter option values (quarters) for the manager\'s team' })
  async getFilterOptions(@Req() req: any) {
    try {
      const quarters = await this.managerQuarterlyReviewService.getQuarterOptions(req.user);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: { quarters },
      };
    } catch (error: any) {
      this.logger.error(`[getFilterOptions] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch filter options',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('employees')
  @ApiOperation({ summary: 'Get list of team employees for filter dropdown' })
  async getEmployees(@Req() req: any) {
    try {
      const employees = await this.managerQuarterlyReviewService.getTeamEmployees(req.user);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: employees,
      };
    } catch (error: any) {
      this.logger.error(`[getEmployees] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch team employees',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('notification-candidates')
  @ApiOperation({ summary: 'Get mapped employees with incomplete quarterly reviews' })
  async getNotificationCandidates(@Req() req: any) {
    try {
      const candidates = await this.managerQuarterlyReviewService.getNotificationCandidates(req.user);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: candidates,
      };
    } catch (error: any) {
      this.logger.error(`[getNotificationCandidates] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch notification candidates',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('notifications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send quarterly review reminders to selected pending employees' })
  async sendReviewNotifications(
    @Req() req: any,
    @Body() body: { employeeIds: string[] },
  ) {
    try {
      const result = await this.managerQuarterlyReviewService.sendReviewNotifications(
        req.user,
        body?.employeeIds,
      );
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: `Quarterly review reminders sent to ${result.sent} employee(s).`,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[sendReviewNotifications] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to send review reminders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
    @Query('role') role?: string,
    @Query('employeeId') employeeId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      const parsedPage = page ? parseInt(page, 10) : 1;
      const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;
      const revealToken = (req.headers['x-reveal-token'] as string) || undefined;

      this.logger.log(
        `Fetching team submissions for manager ${req.user?.loginId}, quarter: ${quarter || 'all'}, ` +
          `status: ${status || 'all'}, employeeId: ${employeeId || 'all'}, page: ${parsedPage}, pageSize: ${parsedPageSize}`,
      );

      const result = await this.managerQuarterlyReviewService.getTeamSubmissions(req.user, {
        quarter,
        status,
        quarterCard,
        year,
        search,
        role,
        employeeId,
        page: parsedPage,
        pageSize: parsedPageSize,
      }, revealToken);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    } catch (error: any) {
      this.logger.error(`[getTeamSubmissions] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch team submissions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(['assignments', 'assigned-reviews'])
  @ApiOperation({ summary: 'Get list of review assignments made to employees by the manager' })
  async getAssignedReviews(
    @Req() req: any,
    @Query('quarter') quarter?: string,
  ) {
    try {
      this.logger.log(
        `Fetching assigned reviews for manager ${req.user?.loginId}, quarter: ${quarter || 'all'}`,
      );
      const assignments = await this.managerQuarterlyReviewService.getAssignedReviews(
        req.user,
        quarter,
      );
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: assignments,
      };
    } catch (error: any) {
      this.logger.error(`[getAssignedReviews] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch assigned reviews',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':employeeId')
  @ApiOperation({ summary: 'Get single quarterly review submission by employee ID' })
  async getSubmissionByEmployeeId(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
    @Query('quarter') quarter?: string,
  ) {
    try {
      this.logger.log(`Fetching review for employeeId ${employeeId}, manager ${req.user?.loginId}`);
      const revealToken = (req.headers['x-reveal-token'] as string) || undefined;
      const submission = await this.managerQuarterlyReviewService.getSubmissionByEmployeeId(
        req.user,
        employeeId,
        quarter,
        revealToken,
      );
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: submission,
      };
    } catch (error: any) {
      this.logger.error(`[getSubmissionByEmployeeId] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch employee submission',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit final manager evaluation for employee quarterly review' })
  async submitReview(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManagerEvaluationDto,
  ) {
    try {
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
    } catch (error: any) {
      this.logger.error(`[submitReview] Error for id=${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to submit manager evaluation',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save draft of manager evaluation for employee quarterly review' })
  async saveDraft(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManagerEvaluationDto,
  ) {
    try {
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
    } catch (error: any) {
      this.logger.error(`[saveDraft] Error for id=${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to save draft evaluation',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
