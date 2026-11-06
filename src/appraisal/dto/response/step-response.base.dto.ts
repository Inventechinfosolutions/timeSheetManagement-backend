import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeePerformanceStatus } from '../../enums/employee_performance.enums';

/** Shared meta returned with every step GET/PATCH response. */
export class StepResponseBaseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ enum: EmployeePerformanceStatus })
  status!: EmployeePerformanceStatus;

  @ApiPropertyOptional()
  canEdit?: boolean;

  @ApiPropertyOptional()
  canRequestEdit?: boolean;

  @ApiPropertyOptional({
    example: 4,
    description: 'First incomplete appraisal step (1–6) from DB',
  })
  step?: number;
}
