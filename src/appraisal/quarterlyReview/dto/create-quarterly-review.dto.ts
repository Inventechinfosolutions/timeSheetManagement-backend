import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { ReviewStatus } from '../enums/quarterly-review.enum';

export class CreateQuarterlyReviewDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Quarter (e.g. Q1 2026)' })
  quarter: string;

  @IsNotEmpty()
  @IsEnum(ReviewStatus)
  @ApiProperty({ enum: ReviewStatus, description: 'Review status' })
  status: ReviewStatus;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Overview text' })
  overview?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Achievements text' })
  achievements?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Challenges text' })
  challenges?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Learning and Goals text' })
  learningGoals?: string;
}
