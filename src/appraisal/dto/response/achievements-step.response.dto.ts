import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepAchievements } from '../../interfaces/employee_performance.interface';
import { StepResponseBaseDto } from './step-response.base.dto';

export class AchievementsStepResponseDto extends StepResponseBaseDto {
  @ApiPropertyOptional({ description: 'Step 2 achievements / projects (null if not started)' })
  data!: StepAchievements | null;
}
