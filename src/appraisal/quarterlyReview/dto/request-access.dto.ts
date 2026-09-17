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

export class RejectAccessRequestDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Reason for rejecting request' })
  rejectionReason?: string;
}
