import { IsString, IsOptional, IsArray, ValidateIf, IsEnum, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoteCategory, NoteType } from '../enums/employee-note.enums';

export class CreateEmployeeNoteDto {
  @IsString()
  employeeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  })
  @ValidateIf((_, val) => val !== null && val !== undefined)
  @IsNumber()
  parentNoteId?: number | null;

  @ApiPropertyOptional({ enum: NoteType, default: NoteType.PARENT })
  @IsOptional()
  @IsEnum(NoteType)
  type?: NoteType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: NoteCategory, default: NoteCategory.PERSONAL_NOTE })
  @IsOptional()
  @IsEnum(NoteCategory)
  category?: NoteCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'object_store UUID IDs only, e.g. ["269091ee-9001-47a8-8117-8aca7f86d9a4"]',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      const id = typeof item === 'string' ? item : (item?.s3Key || item?.id || item?.key || '');
      if (id && typeof id === 'string' && !id.startsWith('temp-') && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  })
  files?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedBy?: string;
}
