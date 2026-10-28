import {
  IsNotEmpty,
  IsEnum,
  IsString,
  IsDateString,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ReviewEmployeeType,
  ReviewAssignedBy,
  QuarterlyReviewStatus,
  QuaterlyEnum,
} from '../enums/quarterly_review.enums';

export class CreateQuarterlyReviewDto {
  @ApiProperty({
    example: 'EMP-10021',
    description: 'ID or code of employee being reviewed',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional({
    enum: ReviewEmployeeType,
    example: ReviewEmployeeType.EMPLOYEE,
    description: 'Type of employee being reviewed (EMPLOYEE, INTERN, MANAGER)',
  })
  @IsOptional()
  @IsEnum(ReviewEmployeeType)
  employeeType?: ReviewEmployeeType;

  @ApiProperty({
    example: '2025-2026',
    description: 'Financial year (e.g. 2025-2026)',
  })
  @IsNotEmpty()
  @IsString()
  financialYear: string;

  @ApiProperty({
    enum: QuaterlyEnum,
    example: QuaterlyEnum.Q1,
    description: 'Quarter (Q1, Q2, Q3, Q4)',
  })
  @IsNotEmpty()
  @IsEnum(QuaterlyEnum)
  quarter: QuaterlyEnum;

  @ApiPropertyOptional({
    example: '2025-04-01',
    description: 'Date when the review was assigned (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  assignedDate?: string;

  @ApiPropertyOptional({
    example: '2025-04-30',
    description: 'Deadline/Due date to complete the review (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  deadlineDate?: string;

  @ApiProperty({
    example: 'Quarterly review cycle for Q1 2025-2026',
    description: 'Instructions, focus areas, or remarks for the review',
  })
  @IsNotEmpty({ message: 'Description is required' })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    enum: ReviewAssignedBy,
    example: ReviewAssignedBy.MANAGER,
  })
  @IsOptional()
  @IsEnum(ReviewAssignedBy)
  assignedBy?: ReviewAssignedBy;

  @ApiPropertyOptional({
    example: 'MGR-005',
    description: 'Manager ID assigning the review',
  })
  @IsOptional()
  @IsString()
  assignerId?: string;

  @ApiPropertyOptional({
    example: 'MGR-005',
    description: 'Reporting manager ID of the employee',
  })
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional({
    enum: QuarterlyReviewStatus,
    default: QuarterlyReviewStatus.NOT_STARTED,
  })
  @IsOptional()
  @IsEnum(QuarterlyReviewStatus)
  status?: QuarterlyReviewStatus;
}

export class ManagerEvaluationDto {
  @ApiPropertyOptional({
    example: 'MGR-005',
    description: 'Manager ID submitting the evaluation',
  })
  @IsOptional()
  @IsString()
  managerId?: string;

  // Evaluation Parameters (1-5 Scale)
  @ApiPropertyOptional({ example: 4, description: 'Productivity rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  productivity?: number;

  @ApiPropertyOptional({ example: 4, description: 'Quality of Work rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  qualityOfWork?: number;

  @ApiPropertyOptional({ example: 5, description: 'Ownership & Responsibility rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  ownership?: number;

  @ApiPropertyOptional({ example: 5, description: 'Ownership & Responsibility rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  ownershipResponsibility?: number;

  @ApiPropertyOptional({ example: 4, description: 'Communication rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  communication?: number;

  @ApiPropertyOptional({ example: 5, description: 'Team Collaboration rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  teamCollaboration?: number;

  @ApiPropertyOptional({ example: 4, description: 'Innovation & Problem Solving rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  innovation?: number;

  @ApiPropertyOptional({ example: 4, description: 'Innovation & Problem Solving rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  innovationProblemSolving?: number;

  // FR-05 Text Area Remarks
  @ApiPropertyOptional({
    example: 'Consistently delivers clean modular code and demonstrates high ownership.',
    description: 'Performance Strengths (Text Area)',
  })
  @IsOptional()
  @IsString()
  performanceStrengths?: string;

  @ApiPropertyOptional({
    example: 'Could take more initiative in cross-department design syncs.',
    description: 'Areas of Improvement (Text Area)',
  })
  @IsOptional()
  @IsString()
  areasOfImprovement?: string;

  @ApiPropertyOptional({
    example: 'Strong performer throughout the quarter. Recommended for leadership training.',
    description: 'Additional Remarks (Text Area)',
  })
  @IsOptional()
  @IsString()
  additionalRemarks?: string;

  // Optional overall and technical ratings
  @ApiPropertyOptional({ example: 4, description: 'Overall performance rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  overallPerformanceRating?: number;

  @ApiPropertyOptional({ example: 4, description: 'Technical / Job Skills rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  technicalJobSkills?: number;

  // Section 5: Final Review & Submission Fields
  @ApiPropertyOptional({ description: 'Goals for Next Review Period' })
  @IsOptional()
  @IsString()
  goalsForNextReviewPeriod?: string;

  @ApiPropertyOptional({ description: 'Training / Development Recommendations' })
  @IsOptional()
  @IsString()
  trainingDevelopmentRecommendations?: string;

  @ApiPropertyOptional({ description: 'Career Growth Recommendation' })
  @IsOptional()
  @IsString()
  careerGrowthRecommendation?: string;

  @ApiPropertyOptional({ description: 'Review Outcome' })
  @IsOptional()
  @IsString()
  reviewOutcome?: string;

  @ApiPropertyOptional({ description: 'Performance Action' })
  @IsOptional()
  @IsString()
  performanceAction?: string;

  @ApiPropertyOptional({ description: 'Final Manager Comments' })
  @IsOptional()
  @IsString()
  finalManagerComments?: string;

  @ApiPropertyOptional({ description: 'Manager Confirmation Checkbox' })
  @IsOptional()
  @IsBoolean()
  managerConfirmation?: boolean;

  @ApiPropertyOptional({ description: 'Flag to save as draft instead of finalizing' })
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @ApiPropertyOptional({ example: 4, description: 'Final performance rating chosen by manager (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  finalRating?: number;

  @ApiPropertyOptional({ example: 4, description: 'Final Performance Rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  finalPerformanceRating?: number;

  // Optional Override
  @ApiPropertyOptional({ example: 5, description: 'Manager override rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  overrideFinalScore?: number;

  @ApiPropertyOptional({
    example: 'Overridden due to outstanding execution on critical production outage.',
    description: 'Justification for score override',
  })
  @IsOptional()
  @IsString()
  overrideJustification?: string;
}

export class UpdateQuarterlyReviewDto extends PartialType(CreateQuarterlyReviewDto) {
  @ApiPropertyOptional({ example: 4, description: 'Overall performance rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  overallPerformanceRating?: number;

  @ApiPropertyOptional({ example: 4, description: 'Productivity rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  productivity?: number;

  @ApiPropertyOptional({ example: 4, description: 'Quality of Work rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qualityOfWork?: number;

  @ApiPropertyOptional({ example: 4, description: 'Technical / Job Skills rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  technicalJobSkills?: number;

  @ApiPropertyOptional({ example: 5, description: 'Ownership rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ownershipResponsibility?: number;

  @ApiPropertyOptional({ example: 4, description: 'Communication rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  communication?: number;

  @ApiPropertyOptional({ example: 5, description: 'Team Collaboration rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teamCollaboration?: number;

  @ApiPropertyOptional({ example: 4, description: 'Innovation rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  innovationProblemSolving?: number;

  @ApiPropertyOptional({ description: 'Performance strengths' })
  @IsOptional()
  @IsString()
  performanceStrengths?: string;

  @ApiPropertyOptional({ description: 'Areas of improvement' })
  @IsOptional()
  @IsString()
  areasOfImprovement?: string;

  @ApiPropertyOptional({ description: 'Additional remarks' })
  @IsOptional()
  @IsString()
  additionalRemarks?: string;

  @ApiPropertyOptional({ description: 'Goals for Next Review Period' })
  @IsOptional()
  @IsString()
  goalsForNextReviewPeriod?: string;

  @ApiPropertyOptional({ description: 'Training / Development Recommendations' })
  @IsOptional()
  @IsString()
  trainingDevelopmentRecommendations?: string;

  @ApiPropertyOptional({ description: 'Career Growth Recommendation' })
  @IsOptional()
  @IsString()
  careerGrowthRecommendation?: string;

  @ApiPropertyOptional({ description: 'Review Outcome' })
  @IsOptional()
  @IsString()
  reviewOutcome?: string;

  @ApiPropertyOptional({ description: 'Performance Action' })
  @IsOptional()
  @IsString()
  performanceAction?: string;

  @ApiPropertyOptional({ description: 'Final Manager Comments' })
  @IsOptional()
  @IsString()
  finalManagerComments?: string;

  @ApiPropertyOptional({ description: 'Manager Confirmation' })
  @IsOptional()
  @IsBoolean()
  managerConfirmation?: boolean;

  @ApiPropertyOptional({ example: 4.5, description: 'Manager-entered average score from 1 to 5' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  finalRating?: number;

  @ApiPropertyOptional({ description: 'Override score' })
  @IsOptional()
  @IsInt()
  overrideFinalScore?: number;

  @ApiPropertyOptional({ description: 'Override justification' })
  @IsOptional()
  @IsString()
  overrideJustification?: string;
}

export class QueryQuarterlyReviewDto {
  @ApiPropertyOptional({ example: 'EMP-10021', description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Filter by employee name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'IT', description: 'Filter by department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'MGR-005', description: 'Filter by assigner/manager ID' })
  @IsOptional()
  @IsString()
  assignerId?: string;

  @ApiPropertyOptional({ enum: ReviewEmployeeType, description: 'Filter by employee type' })
  @IsOptional()
  @IsEnum(ReviewEmployeeType)
  employeeType?: ReviewEmployeeType;

  @ApiPropertyOptional({ example: '2025-2026', description: 'Filter by financial year' })
  @IsOptional()
  @IsString()
  financialYear?: string;

  @ApiPropertyOptional({ enum: QuaterlyEnum, description: 'Filter by quarter (Q1, Q2, Q3, Q4)' })
  @IsOptional()
  @IsEnum(QuaterlyEnum)
  quarter?: QuaterlyEnum;

  @ApiPropertyOptional({ enum: ReviewAssignedBy, description: 'Filter by assignedBy role' })
  @IsOptional()
  @IsEnum(ReviewAssignedBy)
  assignedBy?: ReviewAssignedBy;

  @ApiPropertyOptional({ enum: QuarterlyReviewStatus, description: 'Filter by review status' })
  @IsOptional()
  @IsEnum(QuarterlyReviewStatus)
  status?: QuarterlyReviewStatus;

  @ApiPropertyOptional({
    example: 'MANAGER',
    description: 'Limit results to employees with this role',
  })
  @IsOptional()
  @IsString()
  employeeRole?: string;

  @ApiPropertyOptional({
    example: 'MANAGER',
    description: 'Filter by employee role, same as employee list-select',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    example: 'EMP-10021',
    description: 'Search keyword',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class SearchQuarterlyReviewDto extends QueryQuarterlyReviewDto { }

export class ExportQuarterlyReviewDto {
  @ApiPropertyOptional({ enum: QuaterlyEnum })
  @IsOptional()
  @IsEnum(QuaterlyEnum)
  quarter?: QuaterlyEnum;

  @ApiPropertyOptional({ example: '2025-2026' })
  @IsOptional()
  @IsString()
  financialYear?: string;

  @ApiPropertyOptional({ example: 'IT' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'MGR-005' })
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rating?: number;

  @ApiPropertyOptional({ enum: QuarterlyReviewStatus })
  @IsOptional()
  @IsEnum(QuarterlyReviewStatus)
  status?: QuarterlyReviewStatus;
}

export class ReassignQuarterlyReviewDto {
  @ApiProperty({ example: '2026-10-25', description: 'New deadline date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  deadlineDate: string;

  @ApiPropertyOptional({ example: '2026-10-11', description: 'Re-assigned date (defaults to today)' })
  @IsOptional()
  @IsDateString()
  reassignedDate?: string;

  @ApiPropertyOptional({ example: 'Extended deadline by manager', description: 'Remarks / reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

