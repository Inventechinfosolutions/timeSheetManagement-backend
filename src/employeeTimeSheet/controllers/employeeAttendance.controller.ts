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
} from '@nestjs/common';
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
import { EmployeeAttendanceService } from '../services/employeeAttendance.service';

@ApiTags('Employee Attendance')
@Controller('employee-attendance')
export class EmployeeAttendanceController {
  private readonly logger = new Logger(EmployeeAttendanceController.name);

  constructor(
    private readonly employeeAttendanceService: EmployeeAttendanceService,
  ) {}

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



