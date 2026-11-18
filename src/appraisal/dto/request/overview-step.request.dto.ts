import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** PATCH body for Step 1 — send only changed fields. */
export class OverviewStepRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overallPerformanceSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyHighlights?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  majorContributions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areasForImprovement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewPeriodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewPeriodEnd?: string;
}
