import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignQuarterlyReviewDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Target Employee ID (single)', required: false })
  employeeId?: string;

  @IsOptional()
  @ApiProperty({ description: 'List of target Employee IDs', type: [String], required: false })
  employeeIds?: string[];

  @IsOptional()
  @ApiProperty({ description: 'Assign to all team members / whole organization', type: Boolean, required: false })
  assignToAll?: boolean;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Quarter name (e.g. Q1 FY2026-27 or Q2 FY2026-27)' })
  quarter!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Financial Year (e.g. FY2026-27)' })
  financialYear?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Optional instructions or assignment notes' })
  notes?: string;
}

export class ActionAccessRequestDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], description: 'Action to take' })
  action!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @ApiProperty({ description: 'Hours of extension if approved (default 48)' })
  extensionHours?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Remarks or rejection reason' })
  remarks?: string;
}