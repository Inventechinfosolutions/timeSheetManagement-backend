import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsArray,
  ArrayMinSize,
  IsDateString,
  ValidateIf,
  IsOptional,
} from 'class-validator';
import { AssignmentMode, QuarterLabel } from '../../quarterlyReview/enums/quarterly-review.enum';

/**
 * DTO for the new "+ Create" assignment flow.
 *
 * Mode INDIVIDUAL:  employeeIds required (≥ 1 item).
 * Mode ALL:         employeeIds is ignored / optional — the backend resolves
 *                   all mapped employees automatically.
 *
 * All other fields (quarter, financialYear, startDate, endDate, description)
 * are mandatory regardless of mode.
 */
export class CreateReviewAssignmentDto {
  @ApiProperty({
    enum: AssignmentMode,
    description: 'INDIVIDUAL = assign to specific employee(s); ALL = assign to every mapped team member.',
    example: AssignmentMode.INDIVIDUAL,
  })
  @IsEnum(AssignmentMode, { message: 'mode must be INDIVIDUAL or ALL' })
  @IsNotEmpty()
  mode!: AssignmentMode;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required when mode is INDIVIDUAL. Array of employee IDs to assign.',
    example: ['IIS2782', '345'],
  })
  @ValidateIf((o) => o.mode === AssignmentMode.INDIVIDUAL)
  @IsArray({ message: 'employeeIds must be an array when mode is INDIVIDUAL' })
  @ArrayMinSize(1, { message: 'At least one employeeId must be provided when mode is INDIVIDUAL' })
  @IsString({ each: true, message: 'Each employeeId must be a string' })
  @IsNotEmpty({ each: true, message: 'Employee IDs must not be empty strings' })
  employeeIds?: string[];

  @ApiProperty({
    enum: QuarterLabel,
    description: 'Quarter to assign (Q1 | Q2 | Q3 | Q4).',
    example: QuarterLabel.Q2,
  })
  @IsEnum(QuarterLabel, { message: 'quarter must be one of: Q1, Q2, Q3, Q4' })
  @IsNotEmpty()
  quarter!: QuarterLabel;

  @ApiPropertyOptional({
    description: 'Financial year in the format FY<YYYY>-<YY>, e.g. FY2026-27. Defaults to current FY if omitted.',
    example: 'FY2026-27',
  })
  @IsString()
  @IsOptional()
  financialYear?: string;

  @ApiProperty({
    description: 'Start date of the review period (ISO 8601 date string).',
    example: '2026-07-01',
  })
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'startDate is required' })
  startDate!: string;

  @ApiProperty({
    description: 'End date (deadline) of the review period (ISO 8601 date string).',
    example: '2026-09-30',
  })
  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'endDate is required' })
  endDate!: string;

  @ApiProperty({
    description: 'Description / instructions for the assigned employees. Stored in the notes column.',
    example: 'Please complete your Q2 self-assessment by the deadline.',
  })
  @IsString()
  @IsNotEmpty({ message: 'description is required' })
  description!: string;
}
