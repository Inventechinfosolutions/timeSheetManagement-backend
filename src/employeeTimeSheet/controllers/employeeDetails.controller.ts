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
  Req,
} from '@nestjs/common';
import { EmployeeDetailsDto } from '../dto/employeeDetails.dto';
import { ResetPasswordDto } from '../dto/resetPassword.dto';
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
} from '@nestjs/swagger';

@ApiTags('Employee Details')
@Controller('employee-details')
export class EmployeeDetailsController {
  logger = new Logger('EmployeeDetails');
  constructor(
    private readonly employeeDetailsService: EmployeeDetailsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  @ApiBody({ type: EmployeeDetailsDto })
  @ApiCreatedResponse({ type: EmployeeDetailsDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async createEmployee(@Body() employeeData: EmployeeDetailsDto) {
    this.logger.log(`Creating new employee with data: ${JSON.stringify(employeeData)}`);
    return this.employeeDetailsService.createEmployee(employeeData);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Employee ID' })
  @ApiOkResponse({ type: EmployeeDetailsDto })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getEmployeeById(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Fetching employee with ID: ${id}`);
    return this.employeeDetailsService.getEmployeeById(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees with optional search and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'search by employee ID, name or reference number',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of employees',
  })
  async getAllEmployees(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search: string,
  ) {
    return this.employeeDetailsService.getAllEmployees(page, limit, search);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update employee by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Employee ID' })
  @ApiBody({ type: EmployeeDetailsDto })
  @ApiOkResponse({ type: EmployeeDetailsDto })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: Partial<EmployeeDetailsDto>,
  ) {
    this.logger.log(`Updating employee ${id} with data: ${JSON.stringify(updateData)}`);
    return this.employeeDetailsService.updateEmployee(id, updateData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete employee by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Employee ID' })
  @ApiOkResponse({ description: 'Employee deleted successfully' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async deleteEmployee(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Deleting employee with ID: ${id}`);
    return await this.employeeDetailsService.deleteEmployee(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update an employee by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Employee ID' })
  @ApiBody({ type: EmployeeDetailsDto })
  @ApiOkResponse({ type: EmployeeDetailsDto })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async partialUpdateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: Partial<EmployeeDetailsDto>,
    @Req() req: any,
  ) {
    const loginId = req.user?.userId ?? 'system';
    this.logger.log(`Partially updating employee ${id} with data: ${JSON.stringify(updateData)}`);
    return this.employeeDetailsService.partialUpdateEmployee(id, updateData, loginId);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password for employee' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Password reset successful' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto, @Req() req: any): Promise<{ message: string }> {
    try {
      // Logic to fallback to authenticated user's ID if loginId not provided in body
      if (!resetPasswordDto.loginId && req.user?.employeeId) {
         resetPasswordDto.loginId = req.user.employeeId;
      }
      // If logic requires loginId to be present
        if (!resetPasswordDto.loginId) {
            // If no auth and no body param, this might be an error or allowed if public (usually not public without token)
            // Assuming for now it's either provided in body or via auth context
        }

      this.logger.log(`Resetting password for employee: ${resetPasswordDto.loginId || 'unknown'}`);
      return await this.employeeDetailsService.resetPassword(resetPasswordDto);
    } catch (error) {
       this.logger.error(`Error resetting password: ${error.message}`, error.stack);
       throw error;
    }
  }
}
