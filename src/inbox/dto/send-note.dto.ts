import { IsNotEmpty, IsNumber, IsArray, IsString, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    description: 'Access permission granted to the recipient (CanView or CanEdit)',
    enum: ['CanView', 'CanEdit'],
    default: 'CanView',
  })
  @IsOptional()
  @IsString()
  permission?: 'CanView' | 'CanEdit';
}

