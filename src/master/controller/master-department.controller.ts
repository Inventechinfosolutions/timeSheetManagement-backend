import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MasterDepartmentService } from '../service/master-department.service';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { UpdateDepartmentDto } from '../dto/update-department.dto';
import { MasterDepartment } from '../models/master-department.entity';

@ApiTags('Master Department')
@Controller('master-department')
export class MasterDepartmentController {
  constructor(private readonly departmentService: MasterDepartmentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new department' })
  @ApiResponse({ status: 201, description: 'The department has been successfully created.', type: MasterDepartment })
  create(@Body() createDepartmentDto: CreateDepartmentDto) {
    return this.departmentService.create(createDepartmentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all departments' })
  @ApiResponse({ status: 200, description: 'Return all departments.', type: [MasterDepartment] })
  findAll() {
    return this.departmentService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a department by ID' })
  @ApiResponse({ status: 200, description: 'Return the department.', type: MasterDepartment })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a department by ID' })
  @ApiResponse({ status: 200, description: 'The department has been successfully updated.', type: MasterDepartment })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateDepartmentDto: UpdateDepartmentDto) {
    return this.departmentService.update(id, updateDepartmentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a department by ID' })
  @ApiResponse({ status: 200, description: 'The department has been successfully deleted.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.remove(id);
  }
}
