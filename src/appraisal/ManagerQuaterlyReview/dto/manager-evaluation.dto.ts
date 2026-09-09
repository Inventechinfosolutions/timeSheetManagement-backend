import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class ManagerEvaluationDto {
  @IsOptional()
  id?: number | string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  evaluatorName?: string;

  @IsOptional()
  @IsString()
  evaluatorRole?: string;

  @IsOptional()
  @IsString()
  evaluatorId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Quarter being evaluated (e.g. Q2 FY2026-27)' })
  quarter?: string;

  @IsOptional()
  @ApiProperty({ description: 'Rating breakdown object or rating-row array' })
  ratings?: Record<string, number> | Array<{ category: string; rating: number }>;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Performance strengths' })
  strengths?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Areas for improvement' })
  improvements?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Additional manager remarks' })
  remarks?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === null || value === undefined ? value : String(value)))
  @ApiProperty({ description: 'Final rating label or score' })
  finalRating?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Review status (e.g. In Review, Reviewed, Approved)' })
  reviewStatus?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Whether this is a draft save' })
  isDraft?: boolean;

  @IsOptional()
  overview?: string;

  @IsOptional()
  projects?: any;

  @IsOptional()
  learningGoals?: any;

  @IsOptional()
  teamContribution?: any;

  @IsOptional()
  averageRating?: number;

  @IsOptional()
  companyEnvironment?: any;

  @IsOptional()
  submittedDate?: any;

  @IsOptional()
  reviewedOn?: any;

  @IsOptional()
  status?: string;

  @IsOptional()
  autoSubmitted?: number;

  @IsOptional()
  accessUntil?: any;

  @IsOptional()
  isReopened?: number;
}
