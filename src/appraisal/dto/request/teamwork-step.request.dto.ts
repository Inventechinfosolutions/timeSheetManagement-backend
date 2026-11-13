import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/** PATCH body for Step 3 — send only changed fields. */
export class TeamworkStepRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamCollaborationSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crossTeamContributions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  knowledgeSharingMentoring?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamworkExamples?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  teamRatings?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  communicationDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownershipDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collaborationDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  problemSolvingDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadershipDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adaptabilityDescription?: string;
}
