import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Logger, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EmployeeNotesService } from './employee-notes.service';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto, AddProjectRowDto } from './dto/update-employee-note.dto';

@ApiTags('Employee Notes')
@Controller('employee-notes')
export class EmployeeNotesController {
  private readonly logger = new Logger(EmployeeNotesController.name);

  constructor(private readonly employeeNotesService: EmployeeNotesService) {}

  // ---------------------------------------------------------------------------
  // Notes CRUD
  // ---------------------------------------------------------------------------

  /** GET /employee-notes/:employeeId  — list all notes for an employee */
  @Get(':employeeId')
  @ApiOperation({ summary: 'Get all notes for an employee' })
  async findAll(@Param('employeeId') employeeId: string) {
    return this.employeeNotesService.findAllForEmployee(employeeId);
  }

  /** GET /employee-notes/:employeeId/:id  — get a single note by id */
  @Get(':employeeId/:id')
  @ApiOperation({ summary: 'Get a single note by id for an employee' })
  async findOne(
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.employeeNotesService.findOne(employeeId, id);
  }

  /** POST /employee-notes  — create a new note */
  @Post()
  @ApiOperation({ summary: 'Create a new employee note' })
  async create(@Body() dto: CreateEmployeeNoteDto) {
    return this.employeeNotesService.create(dto);
  }

  /** PUT /employee-notes/:employeeId/:id  — update an existing note */
  @Put(':employeeId/:id')
  @ApiOperation({ summary: 'Update an employee note' })
  async update(
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeNoteDto,
  ) {
    return this.employeeNotesService.update(employeeId, id, dto);
  }

  /** DELETE /employee-notes/:employeeId/:id  — delete a note */
  @Delete(':employeeId/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an employee note' })
  async remove(
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    await this.employeeNotesService.remove(employeeId, id);
    return { message: 'Note deleted successfully' };
  }

  // ---------------------------------------------------------------------------
  // Sub-table rows (project detail rows inside a Project Note)
  // ---------------------------------------------------------------------------

  /**
   * POST /employee-notes/:employeeId/:id/rows
   * Add a new project-detail row to the note's sub-table.
   * Body: { title, notes, createdBy }
   */
  @Post(':employeeId/:id/rows')
  @ApiOperation({ summary: 'Add a project detail row to a note' })
  async addRow(
    @Param('employeeId') employeeId: string,
    @Param('id') noteId: string,
    @Body() dto: AddProjectRowDto,
  ) {
    return this.employeeNotesService.addRow(employeeId, noteId, dto);
  }

  /**
   * PUT /employee-notes/:employeeId/:id/rows/:rowId
   * Update an existing project-detail row.
   * Body: { title?, notes? }
   */
  @Put(':employeeId/:id/rows/:rowId')
  @ApiOperation({ summary: 'Update a project detail row in a note' })
  async updateRow(
    @Param('employeeId') employeeId: string,
    @Param('id') noteId: string,
    @Param('rowId') rowId: string,
    @Body() dto: AddProjectRowDto,
  ) {
    return this.employeeNotesService.updateRow(employeeId, noteId, rowId, dto);
  }

  /**
   * DELETE /employee-notes/:employeeId/:id/rows/:rowId
   * Remove a project-detail row from the note's sub-table.
   */
  @Delete(':employeeId/:id/rows/:rowId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a project detail row from a note' })
  async removeRow(
    @Param('employeeId') employeeId: string,
    @Param('id') noteId: string,
    @Param('rowId') rowId: string,
  ) {
    const updated = await this.employeeNotesService.removeRow(employeeId, noteId, rowId);
    return { message: 'Row deleted successfully', note: updated };
  }
}