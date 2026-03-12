import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MasterDepartmentService } from '../service/master-department.service';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { UpdateDepartmentDto } from '../dto/update-department.dto';
import { MasterDepartment } from '../models/master-department.entity';

@ApiTags('Master Department')
@Controller('master-department')
export class MasterDepartmentController {
  private readonly logger = new Logger(MasterDepartmentController.name);
  constructor(private readonly departmentService: MasterDepartmentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new department' })
  @ApiResponse({ status: 201, description: 'The department has been successfully created.', type: MasterDepartment })
  create(@Body() createDepartmentDto: CreateDepartmentDto) {
    try {
      this.logger.log(`Creating department: ${createDepartmentDto.departmentName}`);
      return this.departmentService.create(createDepartmentDto);
    } catch (error) {
      this.logger.error(`Error creating department: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all departments' })
  @ApiResponse({ status: 200, description: 'Return all departments.', type: [MasterDepartment] })
  findAll() {
    try {
      this.logger.log('Fetching all departments');
      return this.departmentService.findAll();
    } catch (error) {
      this.logger.error(`Error fetching departments: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a department by ID' })
  @ApiResponse({ status: 200, description: 'Return the department.', type: MasterDepartment })
  findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Fetching department ID: ${id}`);
      return this.departmentService.findOne(id);
    } catch (error) {
      this.logger.error(`Error fetching department ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a department by ID' })
  @ApiResponse({ status: 200, description: 'The department has been successfully updated.', type: MasterDepartment })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateDepartmentDto: UpdateDepartmentDto) {
    try {
      this.logger.log(`Updating department ID: ${id}`);
      return this.departmentService.update(id, updateDepartmentDto);
    } catch (error) {
      this.logger.error(`Error updating department ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a department by ID' })
  @ApiResponse({ status: 200, description: 'The department has been successfully deleted.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Deleting department ID: ${id}`);
      return this.departmentService.remove(id);
    } catch (error) {
      this.logger.error(`Error deleting department ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
