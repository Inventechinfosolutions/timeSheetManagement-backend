import { Controller, Post, Body, Get, Param, Delete, UseGuards } from '@nestjs/common';
import { TimesheetBlockerService } from '../services/timesheetBlocker.service';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';

@Controller('timesheet-blockers')
export class TimesheetBlockerController {
  constructor(private readonly blockerService: TimesheetBlockerService) {}

  @Post()
  async create(@Body() data: Partial<TimesheetBlocker>): Promise<TimesheetBlocker> {
    return await this.blockerService.create(data);
  }

  @Get('employee/:employeeId')
  async findAll(@Param('employeeId') employeeId: string): Promise<TimesheetBlocker[]> {
    return await this.blockerService.findAllByEmployee(employeeId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.blockerService.remove(+id);
  }
}
