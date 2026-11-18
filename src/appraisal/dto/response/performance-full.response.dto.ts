import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeePerformanceStatus } from '../../enums/employee_performance.enums';
import {
  StepAchievements,
  StepEnvironment,
  StepFinalReview,
  StepLearning,
  StepOverview,
  StepTeamwork,
} from '../../interfaces/employee_performance.interface';

/**
 * Full appraisal GET response (6 steps + assignment / edit meta).
 * Used by dashboard open and initial load — not for per-step saves.
 */
export class PerformanceFullResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  employeeId!: string;

  @ApiProperty()
  quarter!: string;

  @ApiProperty()
  financialYear!: string;

  @ApiProperty({ enum: EmployeePerformanceStatus })
  status!: EmployeePerformanceStatus;

  @ApiPropertyOptional()
  stepOverview!: StepOverview | null;

  @ApiPropertyOptional()
  stepAchievements!: StepAchievements | null;

  @ApiPropertyOptional()
  stepTeamwork!: StepTeamwork | null;

  @ApiPropertyOptional()
  stepLearning!: StepLearning | null;

  @ApiPropertyOptional()
  stepEnvironment!: StepEnvironment | null;

  @ApiPropertyOptional()
  stepFinalReview!: StepFinalReview | null;

  @ApiPropertyOptional()
  assignedBy?: string | null;

  @ApiPropertyOptional()
  assignedDate?: string | null;

  @ApiPropertyOptional()
  deadlineDate?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional()
  canEdit?: boolean;

  @ApiPropertyOptional()
  canRequestEdit?: boolean;

  @ApiPropertyOptional()
  remainingRequestHours?: number;

  @ApiPropertyOptional()
  isEditWindowActive?: boolean;
}
