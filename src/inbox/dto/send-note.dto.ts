import { IsNotEmpty, IsNumber, IsArray, IsString, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotePermission } from '../../notes/enums/note-permission.enum';

export class SendNoteDto {
  @ApiProperty({ description: 'The ID of the note being sent' })
  @IsNotEmpty()
  @IsNumber()
  notesId: number;

  @ApiProperty({
    description: 'Array of recipient emails or employee IDs',
    example: ['user1@example.com', 'user2@example.com'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  recipients: string[];

  @ApiPropertyOptional({ description: 'Optional subject override for the note notification' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Optional custom message from sender' })
  @IsOptional()
  @IsString()
  customMessage?: string;

  @ApiPropertyOptional({ description: 'Array of attachment keys to share with the note' })
  @IsOptional()
  @IsArray()
  attachmentKeys?: string[];

  @ApiPropertyOptional({
    description: 'Access permission granted to the recipient (e.g. CanView, CanEdit, CanDelete, or comma-separated)',
    enum: NotePermission,
    default: NotePermission.CanView,
  })
  @IsOptional()
  permission?: NotePermission | string;

  @ApiPropertyOptional({
    description: 'Array of permissions granted to the recipient',
    type: [String],
    example: ['CanView', 'CanEdit', 'CanDelete'],
  })
  @IsOptional()
  permissions?: string[] | string;

  @ApiPropertyOptional({ description: 'Allow View permission', default: true })
  @IsOptional()
  canView?: boolean;

  @ApiPropertyOptional({ description: 'Allow Edit permission', default: false })
  @IsOptional()
  canEdit?: boolean;

  @ApiPropertyOptional({ description: 'Allow Delete permission', default: false })
  @IsOptional()
  canDelete?: boolean;

  @ApiPropertyOptional({ description: 'Indicates whether documents/attachments are selected to send', default: false })
  @IsOptional()
  hasDocument?: boolean;

  @ApiPropertyOptional({ description: 'Indicates whether description is selected to send', default: true })
  @IsOptional()
  hasDescription?: boolean;

  @ApiPropertyOptional({ description: 'Alternative alias for hasDocument', default: false })
  @IsOptional()
  includeFiles?: boolean;

  @ApiPropertyOptional({ description: 'Alternative alias for hasDescription', default: true })
  @IsOptional()
  includeDescription?: boolean;

  @ApiPropertyOptional({
    description: 'Deliver into Worksphere Inbox (application). Defaults to true when omitted.',
    default: true,
  })
  @IsOptional()
  sendToInbox?: boolean;

  @ApiPropertyOptional({
    description: 'Also send an email notification. Defaults to true when omitted.',
    default: true,
  })
  @IsOptional()
  sendToEmail?: boolean;
}

