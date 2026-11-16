import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QuaterlyEnum } from '../enums/quaterly.enums';

export class QueryQuaterlyDto {
  @ApiPropertyOptional({
    enum: QuaterlyEnum,
    description: 'Filter by quarter (Q1, Q2, Q3, Q4) - when selected, only that particular quarter data is returned',
    example: QuaterlyEnum.Q1,
  })
  @IsOptional()
  @IsEnum(QuaterlyEnum)
  quarter?: QuaterlyEnum;

  @ApiPropertyOptional({
    description: 'Optional fiscal/calendar year for dynamic date calculation (defaults to current year)',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;
}
