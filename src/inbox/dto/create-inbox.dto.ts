import { IsNotEmpty, IsString, IsNumber, IsEmail, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotePermission } from '../../notes/enums/note-permission.enum';

export class CreateInboxDto {
  @ApiProperty({ description: 'Receiver employee ID' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ description: 'Note ID' })
  @IsNotEmpty()
  @IsNumber()
  notesId: number;

  @ApiProperty({ description: 'Sender email address' })
  @IsNotEmpty()
  @IsEmail()
  fromMail: string;

  @ApiProperty({ description: 'Receiver email address' })
  @IsNotEmpty()
  @IsEmail()
  toMail: string;

  @ApiPropertyOptional({ description: 'Read status', default: false })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({
    description: 'Access permission granted to recipient',
    enum: NotePermission,
    default: NotePermission.CanView,
    example: NotePermission.CanEdit,
  })
  @IsOptional()
  @IsString()
  permission?: NotePermission | string;
}
