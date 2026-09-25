import { IsEnum, IsNotEmpty, IsOptional, IsString, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { NoteType } from '../enums/note-type.enum';
import { CreateSubNoteDto } from './create-sub-note.dto';

export class CreateNoteDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(NoteType)
  type?: NoteType;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsNumber()
  parentId?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsArray()
  subNotes?: CreateSubNoteDto[];
}
