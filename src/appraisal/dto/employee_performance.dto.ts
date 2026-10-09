import {
  IsNotEmpty,
  IsEnum,
  IsString,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QuaterlyEnum } from '../enums/quarterly_review.enums';
import {
  EmployeePerformanceStatus,
  RateCompanyEnvironmentEnum,
} from '../enums/employee_performance.enums';
import { PerformanceAttachment } from '../entities/employee_performance.entity';

export class PerformanceProjectAttachmentDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsString()
  @IsNotEmpty()
  objectKey: string;
}

export class PerformanceProjectDto {
  @ApiProperty({ example: 'Timesheet Workflow' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Delivered the appraisal flow' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'Resolved the quarter window' })
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceProjectAttachmentDto)
  attachments?: PerformanceProjectAttachmentDto[];
}

export class CreateEmployeePerformanceDto {
  @ApiProperty({ example: 'EMP-10021', description: 'Employee ID' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({
    enum: QuaterlyEnum,
    example: QuaterlyEnum.Q1,
    description: 'Quarter (Q1, Q2, Q3, Q4)',
  })
  @IsNotEmpty()
  @IsEnum(QuaterlyEnum)
  quarter: QuaterlyEnum;

  @ApiProperty({
    example: '2025-2026',
    description: 'Financial year (e.g. 2025-2026)',
  })
  @IsNotEmpty()
  @IsString()
  financialYear: string;

  // --- Section A: Key Deliverables (Stepper 1) ---
  @ApiPropertyOptional({ example: 'Backend lead, API design, testing', description: 'Responsibilities handled' })
  @IsOptional()
  @IsString()
  responsibilitiesHandled?: string;

  @ApiPropertyOptional({ example: 'Deployed 12 REST endpoints and Swagger specs', description: 'Deliverables completed' })
  @IsOptional()
  @IsString()
  deliverablesCompleted?: string;

  // --- Section B: Achievements (Stepper 2) ---
  @ApiPropertyOptional({ example: 'Reduced API response times by 35%', description: 'Key accomplishments' })
  @IsOptional()
  @IsString()
  keyAccomplishments?: string;

  // --- Section C: Challenges (Stepper 3) ---
  @ApiPropertyOptional({ example: 'Database locking during peak hours', description: 'Challenges faced' })
  @IsOptional()
  @IsString()
  challengesFaced?: string;

  // --- Section D: Learning & Development (Stepper 4) ---
  @ApiPropertyOptional({ example: 'NestJS CQRS, Docker containerization', description: 'Skills acquired' })
  @IsOptional()
  @IsString()
  skillsAcquired?: string;

  // --- Section E: Goals for Next Quarter (Stepper 5) ---
  @ApiPropertyOptional({ example: 'Complete multi-tenant database isolation', description: 'Planned deliverables' })
  @IsOptional()
  @IsString()
  plannedDeliverables?: string;

  @ApiPropertyOptional({ example: 'Achieve AWS Solutions Architect associate', description: 'Career development goals' })
  @IsOptional()
  @IsString()
  careerDevelopmentGoals?: string;

  // --- Attachments (Stepper 6) ---
  @ApiPropertyOptional({ description: 'List of uploaded files (PDF, DOCX, XLSX)' })
  @IsOptional()
  @IsArray()
  attachments?: PerformanceAttachment[];

  // --- Legacy Compatibility Fields (Optional) ---
  @ApiPropertyOptional({ description: 'Legacy overview' })
  @IsOptional()
  @IsString()
  overview?: string;

  @ApiPropertyOptional({ type: [PerformanceProjectDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceProjectDto)
  projects?: PerformanceProjectDto[];

  @ApiPropertyOptional({ description: 'Legacy metric' })
  @IsOptional()
  @IsInt()
  crossDepartmentCollaboration?: number;

  @ApiPropertyOptional({ description: 'Legacy metric' })
  @IsOptional()
  @IsInt()
  mentorshipKnowledgeSharing?: number;

  @ApiPropertyOptional({ description: 'Legacy metric' })
  @IsOptional()
  @IsInt()
  reliabilityAccountability?: number;

  @ApiPropertyOptional({ description: 'Legacy metric' })
  @IsOptional()
  @IsInt()
  communicationTransparency?: number;

  @ApiPropertyOptional({ description: 'Legacy metric' })
  @IsOptional()
  @IsInt()
  peerSupportTeamSpirit?: number;

  @ApiPropertyOptional({ description: 'Legacy metric' })
  @IsOptional()
  @IsInt()
  adaptabilityInitiative?: number;

  @ApiPropertyOptional({ type: [String], description: 'List of learning goals' })
  @IsOptional()
  @IsArray()
  learningGoals?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedbackOnWorkCulture?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workLifeBalance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suggestionsForImprovement?: string;

  @ApiPropertyOptional({ enum: RateCompanyEnvironmentEnum })
  @IsOptional()
  @IsEnum(RateCompanyEnvironmentEnum)
  rateCompanyEnvironment?: RateCompanyEnvironmentEnum;

  @ApiPropertyOptional({
    enum: EmployeePerformanceStatus,
    default: EmployeePerformanceStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(EmployeePerformanceStatus)
  status?: EmployeePerformanceStatus;
}

export class UpdateEmployeePerformanceDto extends PartialType(CreateEmployeePerformanceDto) { }

export class SaveDraftDto extends CreateEmployeePerformanceDto { }

export class SubmitReviewDto {
  @ApiProperty({ example: 'EMP-10021' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ enum: QuaterlyEnum, example: QuaterlyEnum.Q1 })
  @IsNotEmpty()
  @IsEnum(QuaterlyEnum)
  quarter: QuaterlyEnum;

  @ApiProperty({ example: '2025-2026' })
  @IsNotEmpty()
  @IsString()
  financialYear: string;
}

export class RequestEditPermissionDto {
  @ApiPropertyOptional({ example: 1, description: 'EmployeePerformance record ID' })
  @IsOptional()
  @IsInt()
  performanceId?: number;

  @ApiPropertyOptional({ example: 1, description: 'QuarterlyReview record ID' })
  @IsOptional()
  @IsInt()
  reviewId?: number;

  @ApiProperty({ example: 'EMP-10021' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional({ example: 'Need to update section B deliverables with latest metrics' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RespondEditPermissionDto {
  @ApiProperty({ example: 1, description: 'EmployeePerformance record ID' })
  @IsNotEmpty()
  @IsInt()
  performanceId: number;

  @ApiPropertyOptional({ example: 1, description: 'Legacy requestId alias' })
  @IsOptional()
  @IsInt()
  requestId?: number;

  @ApiProperty({ example: 'MGR-005', description: 'Manager employee ID' })
  @IsNotEmpty()
  @IsString()
  managerId: string;

  @ApiProperty({ example: true, description: 'true to approve edit, false to reject' })
  @IsNotEmpty()
  approved: boolean;

  @ApiPropertyOptional({ example: 'Approved. You have 24 hours to update.' })
  @IsOptional()
  @IsString()
  responseNote?: string;

  @ApiPropertyOptional({
    example: '2026-10-08T18:00:00.000Z',
    description: 'Deadline date/time until which the employee is allowed to edit',
  })
  @IsOptional()
  @IsDateString()
  editAllowedUntil?: string;
}

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
    example: 'Timesheet',
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

export class SearchEmployeePerformanceDto extends QueryEmployeePerformanceDto { }
