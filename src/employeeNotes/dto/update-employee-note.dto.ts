import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeNoteDto } from './create-employee-note.dto';

/** DTO for updating an existing note (all fields optional) */
export class UpdateEmployeeNoteDto extends PartialType(CreateEmployeeNoteDto) {}
