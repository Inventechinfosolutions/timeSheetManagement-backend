import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CompOffService } from '../services/comp-off.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('comp-off')
@UseGuards(JwtAuthGuard)
export class CompOffController {
  constructor(private readonly compOffService: CompOffService) {}

  @Get('available/:employeeId')
  async getAvailableCompOffs(@Param('employeeId') employeeId: string) {
    return await this.compOffService.getAvailableCompOffs(employeeId);
  }

  @Get('test')
  test() {
    return { status: 'CompOffController is active' };
  }

  @Get('history/:employeeId')
  async getCompOffHistory(
    @Param('employeeId') employeeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '10', 10);
    return await this.compOffService.getCompOffHistory(
      employeeId,
      pageNum,
      limitNum,
      month,
      year,
      status,
    );
  }

  @Post('calculate-total-days')
  async calculateTotalDays(@Body() body: { employeeId: string; dates: string[] }) {
    return await this.compOffService.calculateTotalDays(body.employeeId, body.dates);
  }
}
