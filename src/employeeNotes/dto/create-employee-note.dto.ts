import { IsString, IsOptional, IsArray, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectRowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;          // "Project Title" label in sub-table

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;          // note content for this row

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;      // employee id / display name

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdAt?: string;      // ISO string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedAt?: string;
}

export class CreateEmployeeNoteDto {
  @IsString()
  employeeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined)
  @IsString()
  parentNoteId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: ['Project Note', 'Personal Note'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: [ProjectRowDto] })
  @IsOptional()
  @IsArray()
  rows?: ProjectRowDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  files?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedAt?: string;
}
