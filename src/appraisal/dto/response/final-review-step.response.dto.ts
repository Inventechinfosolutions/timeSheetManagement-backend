import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  StepAchievements,
  StepEnvironment,
  StepFinalReview,
  StepLearning,
  StepOverview,
  StepTeamwork,
} from '../../interfaces/employee_performance.interface';
import { StepResponseBaseDto } from './step-response.base.dto';

/**
 * Step 6 GET package: final-review fields + prior steps for the review summary UI.
 * PATCH still accepts only StepFinalReview fields (see FinalReviewStepRequestDto).
 */
export class FinalReviewStepDataDto implements StepFinalReview {
  @ApiPropertyOptional({ nullable: true })
  overallSelfRating?: number | null;

  @ApiPropertyOptional({ nullable: true })
  overallEmployeeComments?: string | null;

  @ApiPropertyOptional({ nullable: true })
  careerGrowthInterests?: string | null;

  @ApiPropertyOptional()
  confirmationAccepted?: boolean;

  @ApiPropertyOptional({ nullable: true })
  stepOverview?: StepOverview | null;

  @ApiPropertyOptional({ nullable: true })
  stepAchievements?: StepAchievements | null;

  @ApiPropertyOptional({ nullable: true })
  stepTeamwork?: StepTeamwork | null;

  @ApiPropertyOptional({ nullable: true })
  stepLearning?: StepLearning | null;

  @ApiPropertyOptional({ nullable: true })
  stepEnvironment?: StepEnvironment | null;
}

export class FinalReviewStepResponseDto extends StepResponseBaseDto {
  @ApiProperty({
    type: FinalReviewStepDataDto,
    description:
      'Final review fields plus prior steps (overview–environment) for the Step 6 summary',
  })
  data!: FinalReviewStepDataDto;
}
