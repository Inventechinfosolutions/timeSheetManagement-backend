import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RevealRatingDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Registered email address of the logged-in user' })
  email: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Password of the logged-in user' })
  password: string;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Quarterly Review record ID or Assignment ID' })
  reviewId?: any;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Quarter name (e.g. Q1 FY2026-27)' })
  quarter?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Employee ID (optional, for manager requests)' })
  employeeId?: string;
}
