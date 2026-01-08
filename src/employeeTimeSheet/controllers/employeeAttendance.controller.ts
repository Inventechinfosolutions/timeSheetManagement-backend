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
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { EmployeeAttendanceDto } from '../dto/employeeAttendance.dto';
import { EmployeeAttendanceService } from '../services/employeeAttendance.service';

@ApiTags('Employee Attendance')
@Controller('employee-attendance')
export class EmployeeAttendanceController {
  private readonly logger = new Logger(EmployeeAttendanceController.name);

  constructor(
    private readonly employeeAttendanceService: EmployeeAttendanceService,
  ) {}

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
  async create(@Body() createEmployeeAttendanceDto: EmployeeAttendanceDto) {
    return this.employeeAttendanceService.create(createEmployeeAttendanceDto);
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

  @Get('monthly-details/:employeeId')
  @ApiOperation({ summary: 'Get monthly attendance for employee' })
  @ApiQuery({ name: 'month', type: String, required: true })
  @ApiQuery({ name: 'year', type: String, required: true })
  async findByMonth(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string,
    @Query('year') year: string,
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

  @Get('worked-days/:employeeId')
  @ApiOperation({ summary: 'Get worked days for a specific employee' })
  @ApiQuery({ name: 'startDate', type: String })
  @ApiQuery({ name: 'endDate', type: String })
  async findWorkedDays(
    @Param('employeeId') employeeId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.employeeAttendanceService.findWorkedDays(
      employeeId,
      startDate,
      endDate,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing employee attendance record' })
  @ApiBody({ type: EmployeeAttendanceDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeAttendanceDto: Partial<EmployeeAttendanceDto>,
  ) {
    return this.employeeAttendanceService.update(
      id,
      updateEmployeeAttendanceDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee attendance record by ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeeAttendanceService.remove(id);
  }

  @Post('login-time/:employeeId')
  @ApiOperation({ summary: 'Post login time for an employee' })
  async postLoginTime(
    @Param('employeeId') employeeId: string,
    @Body() body: { workingDate: string; loginTime: string },
  ) {
    return this.employeeAttendanceService.postLoginTime(employeeId, body);
  }

  @Put('logout-time/:employeeId')
  @ApiOperation({ summary: 'Post logout time for an employee' })
  async postLogoutTime(
    @Param('employeeId') employeeId: string,
    @Body() body: { workingDate: string; logoutTime: string },
  ) {
    return this.employeeAttendanceService.postLogoutTime(employeeId, body);
  }
}
