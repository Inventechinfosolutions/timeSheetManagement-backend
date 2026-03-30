import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReceptionistReadOnlyGuard } from '../../auth/guards/receptionist-readonly.guard';
import { ResignationService } from '../services/resignation.service';
import { LeaveRequestsService } from '../services/leave-requests.service';
import { CreateResignationDto, UpdateResignationStatusDto } from '../dto/resignation.dto';
import { UserType } from '../../users/enums/user-type.enum';

@Controller('resignations')
export class ResignationController {
  private readonly logger = new Logger(ResignationController.name);

  constructor(
    private readonly resignationService: ResignationService,
    private readonly leaveRequestsService: LeaveRequestsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateResignationDto) {
    return this.resignationService.create(body);
  }

  @Get()
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  findAll(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const user = req.user;
    let managerName: string | undefined;
    let managerId: string | undefined;
    const roleUpper = (user?.role || '').toUpperCase();
    if (user && (user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER))) {
      managerName = user.aliasLoginName;
      managerId = user.loginId;
    }
    return this.resignationService.findAll({
      employeeId,
      department,
      status,
      search,
      page: Number(page),
      limit: Number(limit),
      managerName,
      managerId,
    });
  }

  @Get('employee/:employeeId')
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  findByEmployeeId(
    @Param('employeeId') employeeId: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.resignationService.findByEmployeeId(employeeId, status, Number(page), Number(limit));
  }

  @Get('statuses')
  getStatuses() {
    return {
      PENDING_MANAGER: 'Pending Manager',
      MANAGER_APPROVED: 'Manager Approved',
      MANAGER_REJECTED: 'Manager Rejected',
      PENDING_HR_ADMIN: 'Pending HR/Admin',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      WITHDRAWN: 'Withdrawn',
    };
  }

  @Get('email-config')
  getResignationEmailConfig(@Query('employeeId') employeeId: string) {
    return this.leaveRequestsService.getLeaveRequestEmailConfig(employeeId);
  }

  @Get('form-context/:employeeId')
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  async getResignationFormContext(@Param('employeeId') employeeId: string) {
    const context = await this.resignationService.getResignationFormContext(employeeId);
    const emailConfig = await this.leaveRequestsService.getLeaveRequestEmailConfig(employeeId);
    return { ...context, emailConfig };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.resignationService.findOne(id);
  }

  @Post(':id/status')
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateResignationStatusDto,
    @Req() req: any,
  ) {
    const reviewerName = req.user?.aliasLoginName || req.user?.fullName || 'Reviewer';
    return this.resignationService.updateStatus(id, body, {
      name: reviewerName,
      role: req.user?.role,
      userType: req.user?.userType,
      employeeId: req.user?.loginId || req.user?.employeeId,
    });
  }

  @Post(':id/withdraw')
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  @HttpCode(HttpStatus.OK)
  withdraw(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const employeeId = req.user?.loginId || req.user?.employeeId;
    if (!employeeId) {
      throw new Error('User context missing employeeId');
    }
    return this.resignationService.withdraw(id, employeeId);
  }
}
