import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

/** PATCH body for Step 5 — send only changed fields. */
export class EnvironmentStepRequestDto {
  @ApiPropertyOptional({ description: 'Work environment rating 1–5 (one decimal, e.g. 1.4)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  workEnvironmentRating?: number | null;

  @ApiPropertyOptional({ description: 'Tools/resources rating 1–5 (one decimal, e.g. 1.4)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  toolsResourcesRating?: number | null;

  @ApiPropertyOptional({ description: 'Manager support rating 1–5 (one decimal, e.g. 1.4)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  managerSupportRating?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  challengesAffectingProductivity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedbackOnWorkCulture?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workLifeBalance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suggestionsForImprovement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rateCompanyEnvironment?: string | null;
}
