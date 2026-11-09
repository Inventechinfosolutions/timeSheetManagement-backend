import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  AppraisalAssignerType,
  AppraisalMappingStatus,
} from '../entities/appraisal_mapping.entity';

export class CreateAppraisalMappingDto {
  @ApiProperty({ example: 'IT' })
  @IsNotEmpty()
  @IsString()
  department: string;

  @ApiProperty({ example: 'EMP-1001' })
  @IsNotEmpty()
  @IsString()
  assignerId: string;

  @ApiProperty({ example: 'Arun Kumar' })
  @IsNotEmpty()
  @IsString()
  assignerName: string;

  @ApiProperty({ enum: AppraisalAssignerType })
  @IsNotEmpty()
  @IsEnum(AppraisalAssignerType)
  assignerType: AppraisalAssignerType;

  @ApiProperty({ example: 'EMP-2001' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ example: 'Ravi Kumar' })
  @IsNotEmpty()
  @IsString()
  employeeName: string;

  @ApiPropertyOptional({ enum: AppraisalMappingStatus })
  @IsOptional()
  @IsEnum(AppraisalMappingStatus)
  status?: AppraisalMappingStatus;
}

export class BulkCreateAppraisalMappingDto {
  @ApiProperty({ type: [CreateAppraisalMappingDto] })
  @IsNotEmpty()
  items: CreateAppraisalMappingDto[];
}

export class AppraisalMappingResponseDto {
  @ApiProperty()
  id: number;

  @ApiPropertyOptional()
  department?: string | null;

  @ApiProperty()
  assignerId: string;

  @ApiProperty()
  assignerName: string;

  @ApiProperty({ enum: AppraisalAssignerType })
  assignerType: AppraisalAssignerType;

  @ApiProperty()
  employeeId: string;

  @ApiProperty()
  employeeName: string;

  @ApiProperty({ enum: AppraisalMappingStatus })
  status: AppraisalMappingStatus;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
