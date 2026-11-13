import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepOverview } from '../../interfaces/employee_performance.interface';
import { StepResponseBaseDto } from './step-response.base.dto';

export class OverviewStepResponseDto extends StepResponseBaseDto {
  @ApiPropertyOptional({
    description:
      'Step 1 overview. Always includes reviewPeriodStart/reviewPeriodEnd (from saved step or master quarter defaults), even when other fields are empty.',
  })
  data!: StepOverview | null;
}
