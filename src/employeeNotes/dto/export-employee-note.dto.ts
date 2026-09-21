import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, IsIn } from 'class-validator';

export class ExportNoteDescriptionDto {
  @ApiPropertyOptional({ description: 'HTML content of note description' })
  @IsOptional()
  @IsString()
  htmlContent?: string;

  @ApiPropertyOptional({ description: 'Note or Project title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Export format', enum: ['pdf', 'doc', 'docx', 'txt'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(['pdf', 'doc', 'docx', 'txt'])
  format!: 'pdf' | 'doc' | 'docx' | 'txt';

  @ApiPropertyOptional({ description: 'Employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Note ID' })
  @IsOptional()
  @IsString()
  noteId?: string;
}
