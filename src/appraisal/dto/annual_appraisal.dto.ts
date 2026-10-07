import { IsNotEmpty, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryAnnualAppraisalDto {
  @ApiPropertyOptional({ example: 'EMP-10021', description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: '2025-2026', description: 'Filter by financial year' })
  @IsOptional()
  @IsString()
  financialYear?: string;

  @ApiPropertyOptional({ example: 'IT', description: 'Filter by department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'MGR-005', description: 'Filter by manager ID' })
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional({ example: 4, description: 'Filter by minimum annual rating' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: 'John', description: 'Search keyword across employee name, id, department' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class RevealAnnualSummaryDto {
  @ApiProperty({ example: '2026-2027' })
  @IsNotEmpty()
  @IsString()
  financialYear: string;

  @ApiProperty({
    description: 'Checked against the users table password for the logged-in employee. Not saved on the annual summary or employee tables.',
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
