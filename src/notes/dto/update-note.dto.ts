import { IsEnum, IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoteType } from '../enums/note-type.enum';
import { NotePermission } from '../enums/note-permission.enum';

export class UpdateNoteDto {
  @ApiPropertyOptional({ description: 'Updated title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Updated HTML / text description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: NoteType })
  @IsOptional()
  @IsEnum(NoteType)
  type?: NoteType;

  @ApiPropertyOptional({ description: 'Updated project name' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ description: 'Updated hex color string' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Pin status' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ description: 'Archive status' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'Auto-save status' })
  @IsOptional()
  @IsBoolean()
  autoSave?: boolean;

  @ApiPropertyOptional({ description: 'Display order index' })
  @IsOptional()
  @IsBoolean()
  isAutoSave?: boolean;

  @ApiPropertyOptional({ description: 'Whether note page is vertical (portrait)' })
  @IsOptional()
  @IsBoolean()
  isVertical?: boolean;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Page rotation in degrees (0, 90, 180, 270)' })
  @IsOptional()
  @IsNumber()
  rotation?: number;

  @ApiPropertyOptional({
    description: 'Access permission granted to recipient (CanView or CanEdit)',
    enum: NotePermission,
  })
  @IsOptional()
  @IsEnum(NotePermission)
  permission?: NotePermission;
}

