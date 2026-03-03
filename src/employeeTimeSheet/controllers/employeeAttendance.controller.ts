import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Logger,
  ParseIntPipe,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserType } from '../../users/enums/user-type.enum';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { EmployeeAttendanceDto } from '../dto/employeeAttendance.dto';
import { DownloadAttendanceDto } from '../dto/download-attendance.dto';
import { EmployeeAttendanceService } from '../services/employeeAttendance.service';

@ApiTags('Employee Attendance')
@Controller('employee-attendance')
export class EmployeeAttendanceController {
  private readonly logger = new Logger(EmployeeAttendanceController.name);

  constructor(
    private readonly employeeAttendanceService: EmployeeAttendanceService,
  ) { }

  @UseGuards(JwtAuthGuard)
  @Get('download-report')
  @ApiOperation({ summary: 'Download monthly attendance Excel report' })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  async downloadReport(
    @Query() query: DownloadAttendanceDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Downloading monthly report for month: ${query.month}, year: ${query.year}`);
      const user = req.user;
      let managerName: string | undefined;
      let managerId: string | undefined;

      const roleUpper = (user?.role || '').toUpperCase();
      if (user && user.userType !== UserType.ADMIN && (user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId;
      }

      const buffer = await this.employeeAttendanceService.generateMonthlyReport(
        query.month,
        query.year,
        managerName,
        managerId
      );

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=Attendance_${query.month}_${query.year}.xlsx`,
        'Content-Length': buffer.length,
      });

      res.send(buffer);
    } catch (error) {
      this.logger.error(`Error downloading monthly report: ${error.message}`, error.stack);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('download-pdf')
  @ApiOperation({ summary: 'Download monthly attendance PDF report' })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  @ApiQuery({ name: 'employeeId', type: String, required: false })
  async downloadPdf(
    @Query() query: DownloadAttendanceDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Downloading individual PDF report for employee: ${query.employeeId || 'self'}`);
      const user = req.user;

      // Determine which employee's report to download
      // If employeeId is provided in query, use it (typically for Admin/Manager viewing someone else)
      // Otherwise, use the current user's employeeId
      const targetEmployeeId = query.employeeId || user.loginId || user.employeeId;

      if (!targetEmployeeId) {
        throw new BadRequestException('Employee ID is required for PDF report');
      }

      const startDate = query.startDate ? new Date(query.startDate) : new Date(query.year, query.month - 1, 1);
      const endDate = query.endDate ? new Date(query.endDate) : new Date(query.year, query.month, 0);

      const buffer = await this.employeeAttendanceService.generateIndividualPdfReport(
        targetEmployeeId,
        startDate,
        endDate
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=Attendance_${targetEmployeeId}_${query.month}_${query.year}.pdf`,
        'Content-Length': buffer.length,
      });

      res.send(buffer);
    } catch (error) {
      this.logger.error(`Error downloading PDF report: ${error.message}`, error.stack);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new employee attendance record' })
  @ApiBody({ type: EmployeeAttendanceDto })
  @ApiResponse({
    status: 201,
    description: 'The record has been successfully created.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request. The request body is invalid.',
  })
  async create(@Body() createEmployeeAttendanceDto: EmployeeAttendanceDto, @Req() req: any) {
    try {
      this.logger.log(`Creating attendance record for employee: ${createEmployeeAttendanceDto.employeeId}`);
      const user = req.user;
      const roleUpper = (user?.role || '').toUpperCase();
      const isPrivileged = user && (user.userType === UserType.ADMIN || user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER));
      return await this.employeeAttendanceService.create(createEmployeeAttendanceDto, isPrivileged);
    } catch (error) {
      this.logger.error(`Error creating attendance record: ${error.message}`, error.stack);
      throw error;
    }
  }


  @Get('/all')
  @ApiOperation({ summary: 'Get all employee attendance records' })
  @ApiResponse({
    status: 200,
    description: 'The list of all attendance records.',
  })
  async findAll() {
    try {
      this.logger.log('Fetching all attendance records');
      return await this.employeeAttendanceService.findAll();
    } catch (error) {
      this.logger.error(`Error fetching all attendance records: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('all-dashboard-stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get dashboard statistics for all employees' })
  @ApiQuery({ name: 'month', type: String, required: false })
  @ApiQuery({ name: 'year', type: String, required: false })
  async getAllDashboardStats(
    @Req() req: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    try {
      this.logger.log(`Fetching dashboard stats for all employees - Month: ${month}, Year: ${year}`);
      const user = req.user;
      let managerName: string | undefined;
      let managerId: string | undefined;

      // Filter for Managers (consistent with other dashboard endpoints)
      const roleUpper = (user?.role || '').toUpperCase();
      if (user && (user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId;
      }

      return await this.employeeAttendanceService.getAllDashboardStats(month, year, managerName, managerId);
    } catch (error) {
      this.logger.error(`Error fetching all dashboard stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single employee attendance record by ID' })
  @ApiResponse({
    status: 200,
    description: 'The attendance record with the specified ID.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found. The attendance record does not exist.',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Fetching attendance record with ID: ${id}`);
      return await this.employeeAttendanceService.findOne(id);
    } catch (error) {
      this.logger.error(`Error fetching attendance record ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('check-entry-block')
  @ApiOperation({ summary: 'Check if an attendance entry is blocked' })
  @ApiQuery({ name: 'employeeId', type: String })
  @ApiQuery({ name: 'date', type: String })
  @ApiResponse({
    status: 200,
    description: 'Returns blocking status and reason.',
  })
  async checkEntryBlock(
    @Query('employeeId') employeeId: string,
    @Query('date') date: string,
  ) {
    try {
      this.logger.log(`Checking entry block for employee: ${employeeId}, date: ${date}`);
      return await this.employeeAttendanceService.checkEntryBlock(employeeId, date);
    } catch (error) {
      this.logger.error(`Error checking entry block: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('work-trends/:employeeId')
  @ApiOperation({ summary: 'Get work trends for last 5 months' })
  @ApiParam({ name: 'employeeId', type: String })
  @ApiQuery({ name: 'endDate', type: String, required: false })
  @ApiQuery({ name: 'startDate', type: String, required: false })
  async getTrends(
    @Param('employeeId') employeeId: string,
    @Query() query: any,
  ) {
    try {
      this.logger.log(`Fetching work trends for employee: ${employeeId}`);
      let { endDate, startDate } = query;

      // Support custom format ?From<Start>To<End>
      if (!endDate) {
        const rangeKey = Object.keys(query).find(k => k.startsWith('From') && k.includes('To'));
        if (rangeKey) {
          startDate = rangeKey.substring(4, rangeKey.indexOf('To'));
          endDate = rangeKey.substring(rangeKey.indexOf('To') + 2);
        }
      }

      return await this.employeeAttendanceService.getTrends(employeeId, endDate, startDate);
    } catch (error) {
      this.logger.error(`Error fetching work trends for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('work-trends-detailed/:employeeId')
  @ApiOperation({ summary: 'Get detailed work trends based on half-day activities' })
  @ApiParam({ name: 'employeeId', type: String })
  @ApiQuery({ name: 'endDate', type: String, required: false })
  @ApiQuery({ name: 'startDate', type: String, required: false })
  async getTrendsDetailed(
    @Param('employeeId') employeeId: string,
    @Query() query: any,
  ) {
    try {
      this.logger.log(`Fetching detailed work trends for employee: ${employeeId}`);
      let { endDate, startDate } = query;

      // Support custom format ?From<Start>To<End>
      if (!endDate) {
        const rangeKey = Object.keys(query).find(k => k.startsWith('From') && k.includes('To'));
        if (rangeKey) {
          startDate = rangeKey.substring(4, rangeKey.indexOf('To'));
          endDate = rangeKey.substring(rangeKey.indexOf('To') + 2);
        }
      }

      return await this.employeeAttendanceService.getTrendsDetailed(employeeId, endDate, startDate);
    } catch (error) {
      this.logger.error(`Error fetching detailed trends for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('monthly-details/:employeeId/:month/:year')
  @ApiOperation({ summary: 'Get monthly attendance for employee' })
  @ApiParam({ name: 'employeeId', type: String })
  @ApiParam({ name: 'month', type: String })
  @ApiParam({ name: 'year', type: String })
  async findByMonth(
    @Param('employeeId') employeeId: string,
    @Param('month') month: string,
    @Param('year') year: string,
  ) {
    try {
      this.logger.log(
        `Fetching attendance for ${employeeId} - Month: ${month}, Year: ${year}`,
      );
      return await this.employeeAttendanceService.findByMonth(
        month,
        year,
        employeeId,
      );
    } catch (error) {
      this.logger.error(`Error fetching attendance for ${employeeId} (${month}/${year}): ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('working-date/:workingDate/:employeeId')
  @ApiOperation({ summary: 'Get attendance records by working date' })
  async findByWorkingDate(
    @Param('workingDate') workingDate: string,
    @Param('employeeId') employeeId: string,
  ) {
    try {
      this.logger.log(`Fetching attendance for employee: ${employeeId}, date: ${workingDate}`);
      return await this.employeeAttendanceService.findByDate(workingDate, employeeId);
    } catch (error) {
      this.logger.error(`Error fetching attendance by date: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('date-range/:employeeId/:startDate/:endDate')
  @ApiOperation({ summary: 'Get attendance records by employee ID and date range' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Employee ID' })
  @ApiParam({ name: 'startDate', type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiParam({ name: 'endDate', type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiResponse({
    status: 200,
    description: 'List of attendance records for the specified employee and date range.',
  })
  async findByDateRange(
    @Param('employeeId') employeeId: string,
    @Param('startDate') startDate: string,
    @Param('endDate') endDate: string,
  ) {
    try {
      this.logger.log(`Fetching attendance range for ${employeeId} from ${startDate} to ${endDate}`);
      return await this.employeeAttendanceService.findByDateRange(employeeId, startDate, endDate);
    } catch (error) {
      this.logger.error(`Error fetching attendance range: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('worked-days/:employeeId/:startDate/:endDate')
  @ApiOperation({ summary: 'Get worked days for a specific employee' })
  @ApiParam({ name: 'employeeId', type: String })
  @ApiParam({ name: 'startDate', type: String })
  @ApiParam({ name: 'endDate', type: String })
  async findWorkedDays(
    @Param('employeeId') employeeId: string,
    @Param('startDate') startDate: string,
    @Param('endDate') endDate: string,
  ) {
    try {
      this.logger.log(`Fetching worked days for ${employeeId} from ${startDate} to ${endDate}`);
      return await this.employeeAttendanceService.findWorkedDays(
        employeeId,
        startDate,
        endDate,
      );
    } catch (error) {
      this.logger.error(`Error fetching worked days: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('dashboard-stats/:employeeId')
  @ApiOperation({ summary: 'Get dashboard statistics (hours, pending updates)' })
  @ApiParam({ name: 'employeeId', type: String })
  @ApiQuery({ name: 'month', type: String, required: false })
  @ApiQuery({ name: 'year', type: String, required: false })
  async getDashboardStats(
    @Param('employeeId') employeeId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    try {
      this.logger.log(`Fetching dashboard stats for employee: ${employeeId}, Month: ${month}, Year: ${year}`);
      return await this.employeeAttendanceService.getDashboardStats(employeeId, month, year);
    } catch (error) {
      this.logger.error(`Error fetching dashboard stats for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }


  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Update an existing employee attendance record' })
  @ApiBody({ type: EmployeeAttendanceDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeAttendanceDto: Partial<EmployeeAttendanceDto>,
    @Req() req: any
  ) {
    try {
      this.logger.log(`Updating attendance record ID: ${id}`);
      const user = req.user;
      const roleUpper = (user?.role || '').toUpperCase();
      const isPrivileged = user && (user.userType === UserType.ADMIN || user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER));
      return await this.employeeAttendanceService.update(
        id,
        updateEmployeeAttendanceDto,
        isPrivileged
      );
    } catch (error) {
      this.logger.error(`Error updating attendance record ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee attendance record by ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Deleting attendance record ID: ${id}`);
      return await this.employeeAttendanceService.remove(id);
    } catch (error) {
      this.logger.error(`Error deleting attendance record ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }



  @UseGuards(JwtAuthGuard)
  @Post('attendance-data/:employeeId')
  @ApiOperation({ summary: 'Bulk create/update attendance records' })
  @ApiBody({ type: [EmployeeAttendanceDto] })
  async createBulk(@Body() createDtos: EmployeeAttendanceDto[], @Req() req: any) {
    try {
      this.logger.log(`Bulk creating/updating ${createDtos.length} attendance records`);
      const user = req.user;
      const roleUpper = (user?.role || '').toUpperCase();
      const isPrivileged = user && (user.userType === UserType.ADMIN || user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER));
      return await this.employeeAttendanceService.createBulk(createDtos, isPrivileged);
    } catch (error) {
      this.logger.error(`Error in bulk create/update: ${error.message}`, error.stack);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('auto-update')
  @ApiOperation({ summary: 'Auto update timesheet for current month' })
  @ApiBody({ schema: { type: 'object', properties: { employeeId: { type: 'string' }, month: { type: 'string' }, year: { type: 'string' }, dryRun: { type: 'boolean' } } } })
  async autoUpdate(
    @Body() body: { employeeId: string; month: string; year: string; dryRun?: boolean },
    @Req() req: any
  ) {
    try {
      this.logger.log(`Auto-updating timesheet for ${body.employeeId} - ${body.month}/${body.year}`);
      return await this.employeeAttendanceService.autoUpdateTimesheet(body.employeeId, body.month, body.year, body.dryRun);
    } catch (error) {
      this.logger.error(`Error in auto-update for ${body.employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('monthly-details-all/:month/:year')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all employees monthly attendance' })
  @ApiParam({ name: 'month', type: String })
  @ApiParam({ name: 'year', type: String })
  async findAllMonthlyDetails(
    @Req() req: any,
    @Param('month') month: string,
    @Param('year') year: string,
  ) {
    try {
      const user = req.user;
      let managerName: string | undefined;
      let managerId: string | undefined;

      const roleUpper = (user?.role || '').toUpperCase();
      if (user && (user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId;
      }

      this.logger.log(`Fetching all employees attendance - Month: ${month}, Year: ${year}, Manager: ${managerName || 'None'}`);
      return await this.employeeAttendanceService.findAllMonthlyDetails(month, year, managerName, managerId);
    } catch (error) {
      this.logger.error(`Error fetching all employees monthly attendance: ${error.message}`, error.stack);
      throw error;
    }
  }

}



