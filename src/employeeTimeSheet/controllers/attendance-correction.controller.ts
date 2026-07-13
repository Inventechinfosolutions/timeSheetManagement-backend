import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReceptionistReadOnlyGuard } from '../../auth/guards/receptionist-readonly.guard';
import { UserType } from '../../users/enums/user-type.enum';
import { AttendanceCorrectionService } from '../services/attendance-correction.service';
import {
  CreateAttendanceCorrectionDto,
  UpdateAttendanceCorrectionStatusDto,
} from '../dto/attendance-correction-request.dto';

@ApiTags('attendance-corrections')
@ApiBearerAuth()
@Controller('attendance-corrections')
@UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
export class AttendanceCorrectionController {
  private readonly logger = new Logger(AttendanceCorrectionController.name);

  constructor(
    private readonly attendanceCorrectionService: AttendanceCorrectionService,
  ) {}

  @Post(':employeeId')
  @ApiOperation({ summary: 'Submit attendance time correction request' })
  async create(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateAttendanceCorrectionDto,
  ) {
    if (employeeId !== dto.employeeId) {
      throw new BadRequestException('Employee ID mismatch');
    }
    return this.attendanceCorrectionService.create(dto);
  }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'List correction requests for employee' })
  async findByEmployee(
    @Param('employeeId') employeeId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceCorrectionService.findByEmployee(
      employeeId,
      month,
      year,
      from,
      to,
    );
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending correction requests (manager/admin)' })
  async findPending(@Req() req: any) {
    const user = req.user;
    const roleUpper = (user?.role || '').toUpperCase();
    const isPrivileged =
      user?.userType === UserType.ADMIN ||
      user?.userType === UserType.MANAGER ||
      roleUpper.includes('MNG');
    if (!isPrivileged) {
      throw new BadRequestException('Not authorized');
    }
    return this.attendanceCorrectionService.findPendingForManager();
  }

  @Get('history')
  @ApiOperation({
    summary: 'List correction request history for manager/admin (from/to on workingDate)',
  })
  async findHistory(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user;
    const roleUpper = (user?.role || '').toUpperCase();
    const isPrivileged =
      user?.userType === UserType.ADMIN ||
      user?.userType === UserType.MANAGER ||
      roleUpper.includes('MNG');
    if (!isPrivileged) {
      throw new BadRequestException('Not authorized');
    }
    return this.attendanceCorrectionService.findHistoryForManager(from, to);
  }

  @Post(':id/update-status')
  @ApiOperation({ summary: 'Approve or reject correction request' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceCorrectionStatusDto,
    @Req() req: any,
  ) {
    const user = req.user;
    const roleUpper = (user?.role || '').toUpperCase();
    const isPrivileged =
      user?.userType === UserType.ADMIN ||
      user?.userType === UserType.MANAGER ||
      roleUpper.includes('MNG');
    if (!isPrivileged) {
      throw new BadRequestException('Not authorized');
    }
    const reviewerName =
      user?.employeeName || user?.loginId || user?.email || 'Manager';
    return this.attendanceCorrectionService.updateStatus(
      +id,
      dto,
      reviewerName,
    );
  }
}
