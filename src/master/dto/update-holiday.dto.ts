import { IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHolidayDto {
  @ApiPropertyOptional({ example: '2025-01-14', description: 'Holiday date in YYYY-MM-DD format' })
  @IsOptional()
  @IsDateString()
  date?: Date;

  @ApiPropertyOptional({ example: 'Makara Sankranti', description: 'Name of the holiday' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'WEEKEND', description: 'Type of the holiday' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether this is a weekend holiday' })
  @IsOptional()
  @IsBoolean()
  isWeekendHoliday?: boolean;
}
