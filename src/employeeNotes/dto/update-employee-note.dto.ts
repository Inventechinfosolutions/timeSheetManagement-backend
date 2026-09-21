import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeNoteDto, ProjectRowDto } from './create-employee-note.dto';

/** DTO for updating an existing note (all fields optional) */
export class UpdateEmployeeNoteDto extends PartialType(CreateEmployeeNoteDto) {}

/**
 * DTO for adding / updating a single project-detail row in a note's sub-table.
 * All fields are inherited from ProjectRowDto (all optional).
 */
export class AddProjectRowDto extends PartialType(ProjectRowDto) {}