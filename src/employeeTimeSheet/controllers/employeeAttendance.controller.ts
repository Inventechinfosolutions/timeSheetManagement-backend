import {
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
  ) {}

  @Get('download-report')
  @ApiOperation({ summary: 'Download monthly attendance Excel report' })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  async downloadReport(
    @Query() query: DownloadAttendanceDto,
    @Res() res: Response,
  ) {
    const buffer = await this.employeeAttendanceService.generateMonthlyReport(
      query.month,
      query.year,
    );
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=Attendance_${query.month}_${query.year}.xlsx`,
      'Content-Length': buffer.length,
    });
    
    res.send(buffer);
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
    const isAdmin = req.user?.userType === UserType.ADMIN;
    return this.employeeAttendanceService.create(createEmployeeAttendanceDto, isAdmin);
  }

 
  @Get('/all')
  @ApiOperation({ summary: 'Get all employee attendance records' })
  @ApiResponse({
    status: 200,
    description: 'The list of all attendance records.',
  })
  async findAll() {
    return this.employeeAttendanceService.findAll();
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
    return this.employeeAttendanceService.findOne(id);
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
    let { endDate, startDate } = query;

    // Support custom format ?From<Start>To<End>
    if (!endDate) {
        const rangeKey = Object.keys(query).find(k => k.startsWith('From') && k.includes('To'));
        if (rangeKey) {
            startDate = rangeKey.substring(4, rangeKey.indexOf('To'));
            endDate = rangeKey.substring(rangeKey.indexOf('To') + 2);
        }
    }

    return this.employeeAttendanceService.getTrends(employeeId, endDate, startDate);
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
    this.logger.log(
      `Fetching attendance for ${employeeId} - Month: ${month}, Year: ${year}`,
    );
    return this.employeeAttendanceService.findByMonth(
      month,
      year,
      employeeId,
    );
  }

  @Get('working-date/:workingDate/:employeeId')
  @ApiOperation({ summary: 'Get attendance records by working date' })
  async findByWorkingDate(
    @Param('workingDate') workingDate: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.employeeAttendanceService.findByDate(workingDate, employeeId);
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
    return this.employeeAttendanceService.findWorkedDays(
      employeeId,
      startDate,
      endDate,
    );
  }

  @Get('dashboard-stats/:employeeId')
  @ApiOperation({ summary: 'Get dashboard statistics (hours, pending updates)' })
  @ApiParam({ name: 'employeeId', type: String })
  async getDashboardStats(
    @Param('employeeId') employeeId: string,
  ) {
    return this.employeeAttendanceService.getDashboardStats(employeeId);
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
    const isAdmin = req.user?.userType === UserType.ADMIN;
    return this.employeeAttendanceService.update(
      id,
      updateEmployeeAttendanceDto,
      isAdmin
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee attendance record by ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeeAttendanceService.remove(id);
  }


  
  @UseGuards(JwtAuthGuard)
  @Post('attendence-data/:employeeId')
  @ApiOperation({ summary: 'Bulk create/update attendance records' })
  @ApiBody({ type: [EmployeeAttendanceDto] })
  async createBulk(@Body() createDtos: EmployeeAttendanceDto[], @Req() req: any) {
    const isAdmin = req.user?.userType === UserType.ADMIN;
    return this.employeeAttendanceService.createBulk(createDtos, isAdmin);
  }

  @Get('monthly-details-all/:month/:year')
  @ApiOperation({ summary: 'Get all employees monthly attendance' })
  @ApiParam({ name: 'month', type: String })
  @ApiParam({ name: 'year', type: String })
  async findAllMonthlyDetails(
    @Param('month') month: string,
    @Param('year') year: string,
  ) {
    this.logger.log(`Fetching all employees attendance - Month: ${month}, Year: ${year}`);
    return this.employeeAttendanceService.findAllMonthlyDetails(month, year);
  }

}



