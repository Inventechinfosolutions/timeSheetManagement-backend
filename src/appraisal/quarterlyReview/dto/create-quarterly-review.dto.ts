import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewStatus } from '../enums/quarterly-review.enum';

export class ProjectItemDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Project Title' })
  projectTitle?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Achievement details' })
  achievement?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Challenge details' })
  challenge?: string;

  @IsOptional()
  @ApiProperty({ description: 'Attachment details' })
  attachment?: any;
}

export class ReviewItemDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Title of project/goal' })
  title?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Details or description' })
  details?: string;
}

export class TeamContributionItemDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Category name' })
  category?: string;

  @IsOptional()
  @ApiProperty({ description: 'Rating score' })
  rating?: number;
}

export class CompanyEnvironmentDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Feedback on Work Culture' })
  workCultureFeedback?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Work-Life Balance feedback' })
  workLifeBalance?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Suggestions for Improvement' })
  suggestions?: string;

  @IsOptional()
  @ApiProperty({ description: 'Company environment rating (1-5)' })
  rating?: number;
}

export class CreateQuarterlyReviewDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Quarter (e.g. Q1 FY2026-27)' })
  quarter: string;

  @IsNotEmpty()
  @IsEnum(ReviewStatus)
  @ApiProperty({ enum: ReviewStatus, description: 'Review status' })
  status: ReviewStatus;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Overview text' })
  @IsNotEmpty({ message: 'Please provide your overview summary.' })
  // @MinLength(10, {
  //   message: 'Overview must be at least 10 characters long.',
  // })
  @MaxLength(2000, {
    message: 'Overview cannot exceed 2000 characters.',
  })
  overview?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectItemDto)
  @ApiProperty({ type: [ProjectItemDto], description: 'Projects list' })
  projects?: ProjectItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  @ApiProperty({ type: [ReviewItemDto], description: 'Learning goals list' })
  learningGoals?: ReviewItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamContributionItemDto)
  @ApiProperty({ type: [TeamContributionItemDto], description: 'Team contribution self-ratings list' })
  teamContribution?: TeamContributionItemDto[];

  @IsOptional()
  @ApiProperty({ description: 'Calculated average self rating' })
  averageRating?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyEnvironmentDto)
  @ApiProperty({ type: CompanyEnvironmentDto, description: 'Company Environment details' })
  companyEnvironment?: CompanyEnvironmentDto;
}
