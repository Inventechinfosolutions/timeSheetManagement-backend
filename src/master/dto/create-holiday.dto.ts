import { IsNotEmpty, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHolidayDto {
  @ApiProperty({ example: '2025-01-14', description: 'Holiday date in YYYY-MM-DD format' })
  @IsNotEmpty()
  @IsDateString()
  date: Date;

  @ApiProperty({ example: 'Makara Sankranti', description: 'Name of the holiday' })
  @IsNotEmpty()
  @IsString()
  name: string;


}
