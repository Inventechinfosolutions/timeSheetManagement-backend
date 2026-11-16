import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReceptionistReadOnlyGuard } from '../../auth/guards/receptionist-readonly.guard';
import { AttendenceEditRequestService } from '../services/attendence-edit-request.service';
import {
  CreateAttendenceEditRequestDto,
  ReviewAttendenceEditRequestDto,
} from '../dto/attendence-edit-request.dto';

@Controller('attendence-edit-requests')
@UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
export class AttendenceEditRequestController {
  private readonly logger = new Logger(AttendenceEditRequestController.name);

  constructor(private readonly requestService: AttendenceEditRequestService) {}

  @Post()
  async create(@Body() dto: CreateAttendenceEditRequestDto, @Req() req: any) {
    const actorId = req.user?.loginId;
    const employeeId = dto.employeeId || actorId;
    this.logger.log(
      `Creating Edit Access request for ${employeeId} by ${actorId}: ${JSON.stringify(dto.requestDates)}`,
    );
    return this.requestService.createForEmployee(employeeId, dto, actorId, req.user);
  }

  @Get('my')
  async findMine(@Req() req: any) {
    const employeeId = req.user?.loginId;
    return this.requestService.findMine(employeeId);
  }

  @Get()
  async findForReviewer(
    @Req() req: any,
    @Query('managerId') managerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('lockType') lockType?: string,
    @Query('role') role?: string,
  ) {
    this.logger.log(
      `Fetching Edit Access requests for ${req.user?.loginId} managerId=${managerId || '-'} page=${page || 1} limit=${limit || 10} role=${role || '-'}`,
    );
    return this.requestService.findForReviewer(req.user, {
      managerId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      department,
      status,
      lockType,
      role,
    });
  }

  @Patch(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    this.logger.log(`Approving Edit Access request ${id} by ${req.user?.loginId}`);
    return this.requestService.approve(id, req.user);
  }

  @Patch(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAttendenceEditRequestDto,
    @Req() req: any,
  ) {
    this.logger.log(`Rejecting Edit Access request ${id} by ${req.user?.loginId}`);
    return this.requestService.reject(id, req.user, dto?.reason);
  }
}
