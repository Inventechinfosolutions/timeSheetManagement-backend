import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

/** PATCH body for Step 5 — send only changed fields. */
export class EnvironmentStepRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  workEnvironmentRating?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  toolsResourcesRating?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
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
