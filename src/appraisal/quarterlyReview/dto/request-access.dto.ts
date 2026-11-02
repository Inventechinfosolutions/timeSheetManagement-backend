import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RequestQuarterlyReviewAccessDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Quarter name (e.g. Q1 FY2026-27)' })
  quarter: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Reason for requesting reopening/access extension' })
  reason?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Alternative field for reason/description', required: false })
  description?: string;

  @IsOptional()
  @ApiProperty({ description: 'Assignment ID', required: false })
  assignmentId?: any;

  @IsOptional()
  @ApiProperty({ description: 'Assignment object', required: false })
  assignment?: any;

  @IsOptional()
  @ApiProperty({ description: 'Employee ID', required: false })
  employeeId?: string;

  @IsOptional()
  @ApiProperty({ description: 'Review ID', required: false })
  reviewId?: any;

  @IsOptional()
  @ApiProperty({ description: 'Review record ID', required: false })
  id?: any;
}

export class ApproveAccessRequestDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Approver comment or remarks', required: false })
  remarks?: string;

  @IsOptional()
  @ApiProperty({ description: 'Hours of extension if approved (default 48)', required: false })
  extensionHours?: number;
}

export class RejectAccessRequestDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Reason for rejecting request' })
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Remarks or rejection comment', required: false })
  remarks?: string;
}
