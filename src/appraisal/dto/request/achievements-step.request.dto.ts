import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { PerformanceProjectDto } from '../employee_performance.dto';

/**
 * PATCH body for Step 2 — send only changed fields.
 * Prefer /projects endpoints for single-project edits; use this to replace the projects list when needed.
 */
export class AchievementsStepRequestDto {
  @ApiPropertyOptional({ type: [PerformanceProjectDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceProjectDto)
  projects?: PerformanceProjectDto[];
}
