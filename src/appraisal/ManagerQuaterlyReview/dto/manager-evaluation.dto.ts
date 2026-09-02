import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsObject, IsBoolean } from 'class-validator';

export class ManagerEvaluationDto {
  @IsOptional()
  @IsObject()
  @ApiProperty({ description: 'Rating breakdown object (productivity, quality, ownership, communication, collaboration, innovation)' })
  ratings?: Record<string, number>;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Performance strengths' })
  strengths?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Areas for improvement' })
  improvements?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Additional manager remarks' })
  remarks?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Final rating label or score' })
  finalRating?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Review status (e.g. In Review, Reviewed, Approved)' })
  reviewStatus?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Whether this is a draft save' })
  isDraft?: boolean;
}
