import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** PATCH body for Step 4 — send only changed fields. */
export class LearningStepRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skillsAcquired?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certificationsOrCourses?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skillsToImprove?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supportOrTrainingRequired?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextQuarterLearningGoals?: string;
}
