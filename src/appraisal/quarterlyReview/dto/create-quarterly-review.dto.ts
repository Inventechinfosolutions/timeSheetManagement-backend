import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsArray, ValidateNested, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewStatus } from '../enums/quarterly-review.enum';

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
  @MinLength(10, {
    message: 'Overview must be at least 10 characters long.',
  })
  @MaxLength(1000, {
    message: 'Overview cannot exceed 1000 characters.',
  })
  overview?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  @ApiProperty({ type: [ReviewItemDto], description: 'Achievements list' })
  achievements?: ReviewItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  @ApiProperty({ type: [ReviewItemDto], description: 'Challenges list' })
  challenges?: ReviewItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  @ApiProperty({ type: [ReviewItemDto], description: 'Learning goals list' })
  learningGoals?: ReviewItemDto[];
}

