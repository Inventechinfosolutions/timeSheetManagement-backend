import {
  IsNotEmpty,
  IsEnum,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QuaterlyEnum } from '../enums/quarterly_review.enums';
import {
  EmployeePerformanceStatus,
  LearningGoalsEnum,
  FeedbackOnWorkCultureEnum,
  WorkLifeBalanceEnum,
  SuggestionsForImprovementEnum,
  RateCompanyEnvironmentEnum,
} from '../enums/employee_performance.enums';

export class CreateEmployeePerformanceDto {
  @ApiProperty({
    example: 'EMP-10021',
    description: 'Employee ID',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({
    enum: QuaterlyEnum,
    example: QuaterlyEnum.Q1,
    description: 'Quarter (Q1, Q2, Q3, Q4) - aligns with the Quarterly Review quarter',
  })
  @IsNotEmpty()
  @IsEnum(QuaterlyEnum)
  quarter: QuaterlyEnum;

  @ApiPropertyOptional({
    example: '2025-2026',
    description: 'Optional financial year label',
  })
  @IsOptional()
  @IsString()
  financialYear?: string;

  @ApiProperty({
    example: 'Completed key backend architecture enhancements',
    description: 'Performance overview',
  })
  @IsNotEmpty()
  @IsString()
  overview: string;

  @ApiProperty({
    example: 'TimeSheet Management Microservices',
    description: 'Project title',
  })
  @IsNotEmpty()
  @IsString()
  projectTitle: string;

  @ApiProperty({
    example: 'Designed and deployed modular appraisal features and quarterly review entities',
    description: 'Detailed description of the project contributions',
  })
  @IsNotEmpty()
  @IsString()
  projectDescription: string;

  @ApiProperty({
    example: 'High concurrency latency on bulk uploads during quarterly review deadlines',
    description: 'Challenges faced during execution',
  })
  @IsNotEmpty()
  @IsString()
  challenge: string;

  // Evaluation Metrics (INT, 1-10 scale, Mandatory)
  @ApiProperty({
    example: 9,
    description: 'Cross Department Collaboration rating (1-10)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  crossDepartmentCollaboration: number;

  @ApiProperty({
    example: 8,
    description: 'Mentorship and Knowledge Sharing rating (1-10)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  mentorshipKnowledgeSharing: number;

  @ApiProperty({
    example: 9,
    description: 'Reliability and Accountability rating (1-10)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  reliabilityAccountability: number;

  @ApiProperty({
    example: 8,
    description: 'Communication and Transparency rating (1-10)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  communicationTransparency: number;

  @ApiProperty({
    example: 9,
    description: 'Peer Support and Team Spirit rating (1-10)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  peerSupportTeamSpirit: number;

  @ApiProperty({
    example: 8,
    description: 'Adaptability and Initiative rating (1-10)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  adaptabilityInitiative: number;

  // Qualitative Feedback Enums (Mandatory)
  @ApiProperty({
    enum: LearningGoalsEnum,
    example: LearningGoalsEnum.UPSKILL_TECHNICAL,
    description: 'Learning and personal development goal status',
  })
  @IsNotEmpty()
  @IsEnum(LearningGoalsEnum)
  learningGoals: LearningGoalsEnum;

  @ApiProperty({
    enum: FeedbackOnWorkCultureEnum,
    example: FeedbackOnWorkCultureEnum.EXCELLENT,
    description: 'Feedback on organization culture',
  })
  @IsNotEmpty()
  @IsEnum(FeedbackOnWorkCultureEnum)
  feedbackOnWorkCulture: FeedbackOnWorkCultureEnum;

  @ApiProperty({
    enum: WorkLifeBalanceEnum,
    example: WorkLifeBalanceEnum.EXCELLENT,
    description: 'Feedback on work-life balance',
  })
  @IsNotEmpty()
  @IsEnum(WorkLifeBalanceEnum)
  workLifeBalance: WorkLifeBalanceEnum;

  @ApiProperty({
    enum: SuggestionsForImprovementEnum,
    example: SuggestionsForImprovementEnum.PROCESS_AUTOMATION,
    description: 'Constructive suggestions for organizational improvement',
  })
  @IsNotEmpty()
  @IsEnum(SuggestionsForImprovementEnum)
  suggestionsForImprovement: SuggestionsForImprovementEnum;

  @ApiProperty({
    enum: RateCompanyEnvironmentEnum,
    example: RateCompanyEnvironmentEnum.FIVE_STAR,
    description: 'Rating of company working environment',
  })
  @IsNotEmpty()
  @IsEnum(RateCompanyEnvironmentEnum)
  rateCompanyEnvironment: RateCompanyEnvironmentEnum;

  @ApiPropertyOptional({
    enum: EmployeePerformanceStatus,
    example: EmployeePerformanceStatus.DRAFT,
    description: 'Status of performance review record',
    default: EmployeePerformanceStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(EmployeePerformanceStatus)
  status?: EmployeePerformanceStatus;
}

export class UpdateEmployeePerformanceDto extends PartialType(CreateEmployeePerformanceDto) { }

export class QueryEmployeePerformanceDto {
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

  @ApiPropertyOptional({ enum: QuaterlyEnum, description: 'Filter by quarter (Q1, Q2, Q3, Q4)' })
  @IsOptional()
  @IsEnum(QuaterlyEnum)
  quarter?: QuaterlyEnum;

  @ApiPropertyOptional({ example: '2025-2026', description: 'Filter by financial year' })
  @IsOptional()
  @IsString()
  financialYear?: string;

  @ApiPropertyOptional({ enum: EmployeePerformanceStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(EmployeePerformanceStatus)
  status?: EmployeePerformanceStatus;

  @ApiPropertyOptional({
    example: 'TimeSheet',
    description: 'Search keyword across projectTitle, employeeId, employee name, department, financialYear, quarter, status, overview, description, and challenge',
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

export class SearchEmployeePerformanceDto extends QueryEmployeePerformanceDto { }
