import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Patch,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { Readable } from 'stream';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeeDetailsDto } from '../dto/employeeDetails.dto';
import { ResetPasswordDto } from '../dto/resetPassword.dto';
import { BulkUploadResultDto } from '../dto/bulk-upload-result.dto';
import { EmployeeDetailsService } from '../services/employeeDetails.service';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  ApiQuery,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('Employees')
@Controller('employee-details')
export class EmployeeDetailsController {
  logger = new Logger('EmployeeDetails');
  constructor(
    private readonly employeeDetailsService: EmployeeDetailsService,
  ) {}

  @Get('departments')
  @ApiOperation({ summary: 'Get all departments from enum' })
  @ApiOkResponse({ type: [String] })
  async getDepartments() {
    return this.employeeDetailsService.getDepartments();
  }

  @Get('roles')
  @ApiOperation({ summary: 'Get all roles from enum' })
  @ApiOkResponse({ type: [String] })
  async getRoles() {
    return this.employeeDetailsService.getRoles();
  }

  @Get('list-select')
  @ApiOperation({ summary: 'Get lightweight employee list for selection' })
  @ApiQuery({ name: 'department', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String, description: 'Filter by role (comma separated)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or employee ID' })
  async getListSelect(
    @Query('department') department: string,
    @Query('role') role: string,
    @Query('search') search: string,
  ) {
    return this.employeeDetailsService.getListSelect(department, role, search);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  @ApiBody({ type: EmployeeDetailsDto })
  @ApiCreatedResponse({ type: EmployeeDetailsDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async createEmployee(@Body() employeeData: EmployeeDetailsDto) {
    this.logger.log(`Creating new employee with data: ${JSON.stringify(employeeData)}`);
    return this.employeeDetailsService.createEmployee(employeeData);
  }

  @Post('bulk-upload')
  @ApiOperation({ 
    summary: 'Bulk upload employees from Excel file',
    description: 'Upload an Excel file (.xlsx or .xls) with employee data. Required columns: fullName, employeeId, department, designation, email. Optional: password'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel file containing employee data'
        }
      }
    }
  })
  @ApiOkResponse({ 
    type: BulkUploadResultDto,
    description: 'Returns upload results with success/failure counts and details'
  })
  @ApiBadRequestResponse({ description: 'Invalid file format or validation errors' })
  @UseInterceptors(FileInterceptor('file'))
  async bulkUploadEmployees(@UploadedFile() file: Express.Multer.File) {
    this.logger.log(`Bulk upload request received with file: ${file?.originalname}`);
    return this.employeeDetailsService.bulkCreateEmployees(file);
  }

  @Post(':employeeId/resend-activation')
  @ApiOperation({ summary: 'Resend activation link to employee' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Employee String ID' })
  @ApiOkResponse({ description: 'Activation link sent successfully' })
  async resendActivationLink(@Param('employeeId') employeeId: string) {
    this.logger.log(`Resending activation link for employee: ${employeeId}`);
    return this.employeeDetailsService.resendActivationLink(employeeId);
  }


  @Get('timesheet-list')
  @ApiOperation({ summary: 'Get employees for timesheet list with status' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'] })
  @Get('timesheet-list')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get employees for timesheet list' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'department', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['Submitted', 'Pending'] })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTimesheetList(
    @Query('search') search: string,
    @Query('sort') sort: string,
    @Query('order') order: 'ASC' | 'DESC',
    @Query('department') department: string,
    @Query('status') status: string,
    @Query('month') month: number,
    @Query('year') year: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('includeSelf') includeSelf: string,
    @Req() req: any,
  ) {
    const user = req.user;
    let managerName: string | undefined;
    let managerId: string | undefined;

    // Filter for Managers (consistent with getAllEmployees)
    const roleUpper = (user?.role || '').toUpperCase();
    if (user && (user.userType === 'MANAGER' || roleUpper.includes('MNG') || roleUpper.includes('MANAGER'))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId;
    }

    return this.employeeDetailsService.getTimesheetList(
      search,
      sort,
      order,
      department,
      page,
      limit,
      status,
      month,
      year,
      managerName,
      managerId,
      includeSelf === 'true'
    );
  }

  @Get(':employeeId')
  @ApiOperation({ summary: 'Get employee by Employee ID' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Employee String ID (e.g. emp001)' })
  @ApiOkResponse({ type: EmployeeDetailsDto })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getEmployeeByEmployeeId(@Param('employeeId') employeeId: string) {
    this.logger.log(`Fetching employee with Employee ID: ${employeeId}`);
    return this.employeeDetailsService.findByEmployeeId(employeeId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all employees with optional search' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'search by employee ID, name or reference number',
  })
  @ApiQuery({ name: 'sort', required: false, type: String, description: 'Sort field (e.g., fullName)' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  @ApiQuery({ name: 'department', required: false, type: String, description: 'Filter by department' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of employees',
  })
  async getAllEmployees(
    @Query('search') search: string,
    @Query('sort') sort: string,
    @Query('order') order: 'ASC' | 'DESC',
    @Query('department') department: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('includeSelf') includeSelf: string,
    @Query('userStatus') userStatus: string,
    @Req() req: any,
  ) {
    const user = req.user;
    this.logger.log(`User in getAllEmployees: ${JSON.stringify(user)}`);
    
    let managerName: string | undefined;
    let managerId: string | undefined;

    // Filter for Managers (check both userType and role for robustness)
    const roleUpper = (user?.role || '').toUpperCase();
    if (user && (user.userType === 'MANAGER' || roleUpper.includes('MNG') || roleUpper.includes('MANAGER'))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId; // Fallback or alternative match
        this.logger.log(`Manager filter applied: Name=${managerName}, ID=${managerId}`);
    } else {
        this.logger.log('Manager filter NOT applied');
    }

    return this.employeeDetailsService.getAllEmployees(
      search,
      sort,
      order,
      department,
      page,
      limit,
      managerName,
      managerId,
      includeSelf === 'true',
      userStatus
    );
  }


  @Put(':employeeId')
  @ApiOperation({ summary: 'Update employee by Employee ID' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Employee String ID' })
  @ApiBody({ type: EmployeeDetailsDto })
  @ApiOkResponse({ type: EmployeeDetailsDto })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async updateEmployee(
    @Param('employeeId') employeeId: string,
    @Body() updateData: Partial<EmployeeDetailsDto>,
  ) {
    this.logger.log(`Updating employee ${employeeId} with data: ${JSON.stringify(updateData)}`);
    const employee = await this.employeeDetailsService.findByEmployeeId(employeeId);
    return this.employeeDetailsService.updateEmployee(employee.id, updateData);
  }

  @Delete(':employeeId')
  @ApiOperation({ summary: 'Delete employee by Employee ID' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Employee String ID' })
  @ApiOkResponse({ description: 'Employee deleted successfully' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async deleteEmployee(@Param('employeeId') employeeId: string) {
    this.logger.log(`Deleting employee with ID: ${employeeId}`);
    const employee = await this.employeeDetailsService.findByEmployeeId(employeeId);
    return await this.employeeDetailsService.deleteEmployee(employee.id);
  }

  @Patch(':employeeId')
  @ApiOperation({ summary: 'Partially update an employee by Employee ID' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Employee String ID' })
  @ApiBody({ type: EmployeeDetailsDto })
  @ApiOkResponse({ type: EmployeeDetailsDto })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async partialUpdateEmployee(
    @Param('employeeId') employeeId: string,
    @Body() updateData: Partial<EmployeeDetailsDto>,
    @Req() req: any,
  ) {
    const loginId = req.user?.userId ?? 'system';
    this.logger.log(`Partially updating employee ${employeeId} with data: ${JSON.stringify(updateData)}`);
    const employee = await this.employeeDetailsService.findByEmployeeId(employeeId);
    return this.employeeDetailsService.partialUpdateEmployee(employee.id, updateData, loginId);
  }

  @Patch(':employeeId/status')
  @ApiOperation({ summary: 'Update employee status' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Employee String ID' })
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string', example: 'INACTIVE' } } } })
  @ApiOkResponse({ description: 'Status updated successfully' })
  async updateStatus(
    @Param('employeeId') employeeId: string,
    @Body('status') status: string,
  ) {
      if (!status) {
          throw new Error('Status is required');
      }
      return this.employeeDetailsService.updateStatus(employeeId, status);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password for employee' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto, @Req() req: any) {
    if (!resetPasswordDto.loginId && req.user?.employeeId) {
      resetPasswordDto.loginId = req.user.employeeId;
    }
    return await this.employeeDetailsService.resetPassword(resetPasswordDto);
  }

  @Post('upload-profile-image/:employeeId')
  @ApiOperation({ summary: 'Upload profile image' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfileImage(
    @Param('employeeId') employeeId: string,
    @UploadedFile() file: any, 
  ) {
    const employee = await this.employeeDetailsService.findByEmployeeId(employeeId);
    return this.employeeDetailsService.uploadProfileImage(file, employee.id);
  }

  @Get('profile-image/:employeeId/view')
  @ApiOperation({ summary: 'View profile image' })
  async viewProfileImage(@Param('employeeId') employeeIdStr: string, @Res() res: Response) {
    let employee;
    try {
        try {
            employee = await this.employeeDetailsService.findByEmployeeId(employeeIdStr);
        } catch (e) {
            // If not found by string ID, try finding by numeric ID if it's a number
            if (!isNaN(Number(employeeIdStr))) {
                employee = await this.employeeDetailsService.getEmployeeById(Number(employeeIdStr));
            } else {
                throw e;
            }
        }
        const { stream, meta } = await this.employeeDetailsService.getProfileImageStream(employee.id);
        
        res.set({
          'Content-Type': meta.mimetype || 'image/jpeg',
          'Content-Disposition': `inline; filename="${meta.filename || 'profile.jpg'}"`,
        });

        if (stream.Body instanceof Readable) {
          stream.Body.pipe(res);
        } else if (stream.Body) {
          const buffer = await stream.Body.transformToByteArray();
          res.send(Buffer.from(buffer));
        } else {
            throw new Error('Image stream not found');
        }
    } catch (error) {
        // Return 204 No Content so frontend doesn't show 404 error
        // This is expected for users without a profile picture
        return res.sendStatus(204);
    }
  }
}
