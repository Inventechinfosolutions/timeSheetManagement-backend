import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

/** PATCH body for Step 6 — send only changed fields. */
export class FinalReviewStepRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  overallSelfRating?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overallEmployeeComments?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careerGrowthInterests?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmationAccepted?: boolean;
}
