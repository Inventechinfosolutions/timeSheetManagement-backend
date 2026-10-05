import { IsEnum, IsNotEmpty, IsOptional, IsString, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoteType } from '../enums/note-type.enum';
import { NotePermission } from '../enums/note-permission.enum';
import { CreateSubNoteDto } from './create-sub-note.dto';

export class CreateNoteDto {
  @ApiProperty({ description: 'Note title' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Note description / HTML body content' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: NoteType, default: NoteType.PERSONAL })
  @IsOptional()
  @IsEnum(NoteType)
  type?: NoteType;

  @ApiPropertyOptional({ description: 'Project name if type is PROJECT' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ description: 'Parent note ID if this is a sub-note' })
  @IsOptional()
  @IsNumber()
  parentId?: number;

  @ApiPropertyOptional({ description: 'Hex color string', default: '#4318FF' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Whether the note is pinned', default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ description: 'Whether auto-save is enabled', default: false })
  @IsOptional()
  @IsBoolean()
  autoSave?: boolean;

  @ApiPropertyOptional({ description: 'Whether note page is vertical (portrait)', default: true })
  @IsOptional()
  @IsBoolean()
  isVertical?: boolean;

  @ApiPropertyOptional({ type: [CreateSubNoteDto], description: 'Sub-notes batch' })
  @IsOptional()
  @IsArray()
  subNotes?: CreateSubNoteDto[];

  @ApiPropertyOptional({ type: [String], description: 'Pre-uploaded attachment keys' })
  @IsOptional()
  @IsArray()
  attachmentKeys?: string[];

  @ApiPropertyOptional({
    description: 'Access permission granted to recipients (CanView or CanEdit)',
    enum: NotePermission,
    default: NotePermission.CanView,
    example: NotePermission.CanEdit,
  })
  @IsOptional()
  @IsEnum(NotePermission)
  permission?: NotePermission;

  @ApiPropertyOptional({
    description: 'Array of recipient employee IDs or emails to share the note with on creation',
    example: ['IIS475', 'user@inventechinfo.com'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];
}

