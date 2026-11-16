import { IsOptional, IsEnum, IsInt, Min, Max, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FinancialYearQuarter } from '../enums/financial-year.enums';

export class QuarterDetailResponseDto {
  @ApiProperty({ enum: FinancialYearQuarter, example: 'Q1' })
  quarter: FinancialYearQuarter;

  @ApiProperty({ example: 'Quarter 1' })
  quarterName: string;

  @ApiProperty({ example: 'April' })
  fromMonth: string;

  @ApiProperty({ example: 'June' })
  toMonth: string;

  @ApiProperty({ example: 4 })
  fromMonthNumber: number;

  @ApiProperty({ example: 6 })
  toMonthNumber: number;

  @ApiProperty({ example: 2025 })
  year: number;

  @ApiProperty({ example: '2025-04-01' })
  startDate: string;

  @ApiProperty({ example: '2025-06-30' })
  endDate: string;

  @ApiProperty({ example: ['April', 'May', 'June'] })
  months: string[];

  @ApiProperty({ example: 'April to June 2025' })
  description: string;
}

export class FinancialYearWithQuartersDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2025-2026' })
  financialYear: string;

  @ApiProperty({ example: 2025 })
  fromYear: number;

  @ApiProperty({ example: 2026 })
  toYear: number;

  @ApiPropertyOptional({ example: 'Financial Year 2025-2026' })
  description?: string;

  @ApiProperty({ example: '2025-04-01' })
  startDate: string;

  @ApiProperty({ example: '2026-03-31' })
  endDate: string;

  @ApiProperty({ example: true })
  isCurrent: boolean;

  @ApiProperty({ type: [QuarterDetailResponseDto] })
  quarters: QuarterDetailResponseDto[];

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;

  @ApiPropertyOptional()
  createdBy?: string;

  @ApiPropertyOptional()
  updatedBy?: string;
}

export class QueryFinancialYearDto {
  @ApiPropertyOptional({
    description: 'Filter by financial year string (e.g. 2025-2026)',
    example: '2025-2026',
  })
  @IsOptional()
  @IsString()
  financialYear?: string;

  @ApiPropertyOptional({
    description: 'Filter by start year (e.g. 2025)',
    example: 2025,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    enum: FinancialYearQuarter,
    description: 'Filter by quarter (Q1, Q2, Q3, Q4) within the financial year',
    example: FinancialYearQuarter.Q1,
  })
  @IsOptional()
  @IsEnum(FinancialYearQuarter)
  quarter?: FinancialYearQuarter;
}

export class CreateFinancialYearDto {
  @ApiProperty({
    description: 'Starting year of the financial year (e.g. 2025 for 2025-2026)',
    example: 2025,
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  fromYear: number;

  @ApiPropertyOptional({
    description: 'Ending year of the financial year (defaults to fromYear + 1)',
    example: 2026,
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  toYear?: number;

  @ApiPropertyOptional({
    description: 'Custom label for financial year (defaults to fromYear-toYear, e.g. 2025-2026)',
    example: '2025-2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  financialYear?: string;

  @ApiPropertyOptional({
    description: 'Optional description of the financial year',
    example: 'Financial Year 2025-2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateFinancialYearDto extends PartialType(CreateFinancialYearDto) {}
