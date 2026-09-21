import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class ExportNoteDescriptionDto {
  @ApiPropertyOptional({ description: 'HTML content of note description' })
  @IsOptional()
  @Transform(({ value }) => (value == null ? '' : String(value)))
  @IsString()
  htmlContent?: string;

  @ApiPropertyOptional({ description: 'Note or Project title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Export format', enum: ['pdf', 'doc', 'docx', 'txt'] })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['pdf', 'doc', 'docx', 'txt'])
  format!: 'pdf' | 'doc' | 'docx' | 'txt';

  @ApiPropertyOptional({ description: 'Employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Note ID' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return String(value);
  })
  @IsString()
  noteId?: string;
}
