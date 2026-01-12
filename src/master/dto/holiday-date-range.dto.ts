import { IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HolidayDateRangeDto {
  @ApiProperty({ example: '2025-01-01', description: 'Start date in YYYY-MM-DD format' })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate: string;

  @ApiProperty({ example: '2025-12-31', description: 'End date in YYYY-MM-DD format' })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate: string;
}
