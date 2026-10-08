import { IsEnum, IsOptional, IsString, IsBoolean, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { NoteType } from '../enums/note-type.enum';

export class QueryNotesDto {
  @IsOptional()
  @IsEnum(NoteType)
  type?: NoteType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isArchived?: boolean;
}
