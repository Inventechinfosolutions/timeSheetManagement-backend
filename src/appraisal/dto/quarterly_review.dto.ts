import {
  IsNotEmpty,
  IsEnum,
  IsString,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ReviewEmployeeType,
  ReviewAssignedBy,
  QuarterlyReviewStatus,
  PerformanceStrengthsEnum,
  AreasOfImprovementEnum,
  AdditionalRemarksEnum,
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

  @ApiProperty({
    enum: ReviewEmployeeType,
    example: ReviewEmployeeType.EMPLOYEE,
    description: 'Type of employee being reviewed (EMPLOYEE, INTERN, MANAGER)',
  })
  @IsNotEmpty()
  @IsEnum(ReviewEmployeeType)
  employeeType: ReviewEmployeeType;

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

  @ApiProperty({
    example: '2025-04-01',
    description: 'Date when the review was assigned (YYYY-MM-DD)',
  })
  @IsNotEmpty()
  @IsDateString()
  assignedDate: string;

  @ApiProperty({
    example: '2025-04-15',
    description: 'Deadline date to complete the review (YYYY-MM-DD)',
  })
  @IsNotEmpty()
  @IsDateString()
  deadlineDate: string;

  @ApiPropertyOptional({
    example: 'Quarterly performance evaluation for Q1',
    description: 'Optional description or notes for the review',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: ReviewAssignedBy,
    example: ReviewAssignedBy.MANAGER,
    description: 'Role of reviewer who assigned (MANAGER, EMPLOYEE, INTERN, ADMIN)',
  })
  @IsNotEmpty()
  @IsEnum(ReviewAssignedBy)
  assignedBy: ReviewAssignedBy;

  @ApiProperty({
    example: 'MGR-005',
    description: 'ID of the reviewer/manager assigning the review',
  })
  @IsNotEmpty()
  @IsString()
  assignerId: string;

  @ApiPropertyOptional({
    enum: QuarterlyReviewStatus,
    example: QuarterlyReviewStatus.PENDING,
    description: 'Status of the review',
    default: QuarterlyReviewStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(QuarterlyReviewStatus)
  status?: QuarterlyReviewStatus;

  // Evaluation Metrics (INT, Nullable, 1-10 scale)
  @ApiPropertyOptional({ example: 8, description: 'Productivity score (1-10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  productivity?: number;

  @ApiPropertyOptional({ example: 9, description: 'Ownership & Responsibility score (1-10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  ownershipResponsibility?: number;

  @ApiPropertyOptional({ example: 8, description: 'Team Collaboration score (1-10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  teamCollaboration?: number;

  @ApiPropertyOptional({ example: 9, description: 'Quality of Work score (1-10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  qualityOfWork?: number;

  @ApiPropertyOptional({ example: 8, description: 'Communication score (1-10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  communication?: number;

  @ApiPropertyOptional({ example: 7, description: 'Innovation & Problem Solving score (1-10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  innovationProblemSolving?: number;

  @ApiPropertyOptional({
    example: 85,
    description: 'Overall Performance Index score (e.g. 0-100, or auto-calculated)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  performanceIndex?: number;

  // Qualitative Feedback (Enums, Nullable)
  @ApiPropertyOptional({
    enum: PerformanceStrengthsEnum,
    example: PerformanceStrengthsEnum.TECHNICAL_EXCELLENCE,
    description: 'Performance strength category',
  })
  @IsOptional()
  @IsEnum(PerformanceStrengthsEnum)
  performanceStrengths?: PerformanceStrengthsEnum;

  @ApiPropertyOptional({
    enum: AreasOfImprovementEnum,
    example: AreasOfImprovementEnum.TIME_MANAGEMENT,
    description: 'Area of improvement category',
  })
  @IsOptional()
  @IsEnum(AreasOfImprovementEnum)
  areasOfImprovement?: AreasOfImprovementEnum;

  @ApiPropertyOptional({
    enum: AdditionalRemarksEnum,
    example: AdditionalRemarksEnum.EXCEEDS_EXPECTATIONS,
    description: 'Additional qualitative remarks rating',
  })
  @IsOptional()
  @IsEnum(AdditionalRemarksEnum)
  additionalRemarks?: AdditionalRemarksEnum;
}

export class UpdateQuarterlyReviewDto extends PartialType(CreateQuarterlyReviewDto) { }

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

  @ApiPropertyOptional({ example: 'MGR-005', description: 'Filter by assigner ID' })
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
    example: 'EMP-10021',
    description: 'Search keyword across employeeId, employee name, department, financialYear, quarter, status, and description',
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

// Aliases matching file naming convention
export const CreateQuaterlyReviewDto = CreateQuarterlyReviewDto;
export type CreateQuaterlyReviewDto = CreateQuarterlyReviewDto;
export const UpdateQuaterlyReviewDto = UpdateQuarterlyReviewDto;
export type UpdateQuaterlyReviewDto = UpdateQuarterlyReviewDto;
export const QueryQuaterlyReviewDto = QueryQuarterlyReviewDto;
export type QueryQuaterlyReviewDto = QueryQuarterlyReviewDto;
export const SearchQuaterlyReviewDto = SearchQuarterlyReviewDto;
export type SearchQuaterlyReviewDto = SearchQuarterlyReviewDto;
