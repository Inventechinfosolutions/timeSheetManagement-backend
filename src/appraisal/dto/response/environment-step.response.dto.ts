import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepEnvironment } from '../../interfaces/employee_performance.interface';
import { StepResponseBaseDto } from './step-response.base.dto';

export class EnvironmentStepResponseDto extends StepResponseBaseDto {
  @ApiPropertyOptional({ description: 'Step 5 environment data (null if not started)' })
  data!: StepEnvironment | null;
}
