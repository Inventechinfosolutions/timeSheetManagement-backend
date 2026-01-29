import { IsNotEmpty, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class DownloadAttendanceDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year: number;
}
