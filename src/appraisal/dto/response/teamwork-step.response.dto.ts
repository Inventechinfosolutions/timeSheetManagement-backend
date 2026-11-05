import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepTeamwork } from '../../interfaces/employee_performance.interface';
import { StepResponseBaseDto } from './step-response.base.dto';

export class TeamworkStepResponseDto extends StepResponseBaseDto {
  @ApiPropertyOptional({ description: 'Step 3 teamwork data (null if not started)' })
  data!: StepTeamwork | null;
}
