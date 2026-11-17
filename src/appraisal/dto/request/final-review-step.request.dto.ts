import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

/** PATCH body for Step 6 — send only changed fields. */
export class FinalReviewStepRequestDto {
  @ApiPropertyOptional({ description: 'Overall self-rating 1–5 (one decimal, e.g. 1.4)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
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
