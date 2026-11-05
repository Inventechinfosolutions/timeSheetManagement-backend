import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepLearning } from '../../interfaces/employee_performance.interface';
import { StepResponseBaseDto } from './step-response.base.dto';

export class LearningStepResponseDto extends StepResponseBaseDto {
  @ApiPropertyOptional({ description: 'Step 4 learning data (null if not started)' })
  data!: StepLearning | null;
}
