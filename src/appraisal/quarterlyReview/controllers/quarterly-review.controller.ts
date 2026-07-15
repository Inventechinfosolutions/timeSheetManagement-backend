import { Controller, Get, Post, Body, Param, Req, UseGuards, HttpStatus, HttpCode, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { QuarterlyReviewService } from '../services/quarterly-review.service';
import { CreateQuarterlyReviewDto } from '../dto/create-quarterly-review.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

@ApiTags('Quarterly Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quarterly-review')
export class QuarterlyReviewController {
  private readonly logger = new Logger(QuarterlyReviewController.name);

  constructor(private readonly quarterlyReviewService: QuarterlyReviewService) {}

  @Get('current-quarter')
  @ApiOperation({ summary: 'Get current quarter name' })
  getCurrentQuarter() {
    return {
      success: true,
      data: {
        quarter: this.quarterlyReviewService.getCurrentQuarter(),
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all quarterly reviews for logged-in employee' })
  async findAll(@Req() req: any) {
    const employeeId = req.user.loginId;
    this.logger.log(`Fetching all reviews for employee ${employeeId}`);
    const reviews = await this.quarterlyReviewService.findAllForEmployee(employeeId);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: reviews,
    };
  }

  @Get('quarter/:quarter')
  @ApiOperation({ summary: 'Get quarterly review by quarter' })
  async findOne(@Req() req: any, @Param('quarter') quarter: string) {
    const employeeId = req.user.loginId;
    this.logger.log(`Fetching review for employee ${employeeId}, quarter ${quarter}`);
    const review = await this.quarterlyReviewService.findOneByQuarter(employeeId, quarter);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: review,
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update quarterly review (Save Draft or Submit)' })
  async saveOrSubmit(@Req() req: any, @Body() dto: CreateQuarterlyReviewDto) {
    const employeeId = req.user.loginId;
    const username = req.user.aliasLoginName || employeeId;
    this.logger.log(`Saving or submitting quarterly review for employee ${employeeId}`);
    const review = await this.quarterlyReviewService.saveOrSubmit(employeeId, dto, username);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: review,
    };
  }
}
