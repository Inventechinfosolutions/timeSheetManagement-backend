import { IsEnum, IsOptional, IsString, IsBoolean, IsDateString, IsInt, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoteType } from '../enums/note-type.enum';

export class QueryNotesDto {
  @ApiPropertyOptional({ enum: NoteType, description: 'Filter by note type (PROJECT, PERSONAL)' })
  @IsOptional()
  @IsEnum(NoteType)
  type?: NoteType;

  @ApiPropertyOptional({ description: 'Search term for title, project name, or creator' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter notes created on or after date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Filter notes created on or before date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Filter by project name' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ description: 'Filter by pinned status (true/false)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ description: 'Filter by archived status (true/false, default: false)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'Include full note description without truncation (true/false)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean()
  full?: boolean;

  @ApiPropertyOptional({ description: 'Page number for pagination (starts at 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Number of notes per page (default: 5)', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number;

  @ApiPropertyOptional({ description: 'Alias for limit (items per page, default: 5)', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pageSize?: number;
}


