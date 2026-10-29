import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import dayjs from 'dayjs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { hasAdminAccess, isCeoUser } from '../../users/utils/admin-access';
import { LeaveCalculationType } from '../../master/enums/leave-calculation-type.enum';
import { LeaveManagerEntryInput, LeaveManagerService } from '../services/leave-manager.service';

@ApiTags('Leave Manager')
@Controller('leave-manager')
@UseGuards(JwtAuthGuard)
export class LeaveManagerController {
  constructor(private readonly leaveManagerService: LeaveManagerService) {}

  @Get('departments')
  @ApiOperation({ summary: 'Departments with their leave calculation type (AUTO / MANUAL)' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async getDepartments(@Req() req: any, @Query('year') year?: string) {
    this.assertAdmin(req);
    return this.leaveManagerService.getDepartments(this.parseYear(year));
  }

  @Patch('departments/:id')
  @ApiOperation({ summary: 'Switch a department between AUTO and MANUAL leave calculation' })
  async updateDepartment(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { leaveCalculationType: LeaveCalculationType },
  ) {
    this.assertAdmin(req, true);
    return this.leaveManagerService.updateDepartmentType(id, body?.leaveCalculationType, this.actor(req));
  }

  @Get('employees')
  @ApiOperation({ summary: 'Active employees of a department with accrued leaves and manual entries' })
  @ApiQuery({ name: 'department', required: true, type: String })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async getEmployees(
    @Req() req: any,
    @Query('department') department: string,
    @Query('year') year?: string,
  ) {
    this.assertAdmin(req);
    return this.leaveManagerService.getEmployees(department, this.parseYear(year));
  }

  @Put('employees')
  @ApiOperation({ summary: 'Save total leaves taken this year for employees of a MANUAL department' })
  async saveEntries(
    @Req() req: any,
    @Body() body: { year: number; entries: LeaveManagerEntryInput[] },
  ) {
    this.assertAdmin(req, true);
    return this.leaveManagerService.saveEntries(Number(body?.year), body?.entries, this.actor(req));
  }

  private assertAdmin(req: any, write = false) {
    if (!hasAdminAccess(req.user)) {
      throw new ForbiddenException('Only administrators can manage leave calculation.');
    }
    if (write && isCeoUser(req.user)) {
      throw new ForbiddenException('CEO has view-only access to leave management.');
    }
  }

  private parseYear(year?: string): number {
    const parsed = parseInt(year || '', 10);
    return Number.isNaN(parsed) ? dayjs().year() : parsed;
  }

  private actor(req: any): string | undefined {
    return req.user?.aliasLoginName || req.user?.loginId || undefined;
  }
}
