/* eslint-disable @typescript-eslint/no-unused-vars */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * A DTO base object.
 */
export class BaseDTO {
  @IsOptional()
  id?: number | string;

  @IsOptional()
  createdBy?: string;

  @IsOptional()
  createdDate?: Date;

  @IsOptional()
  createdAt?: Date;

  @IsOptional()
  updatedBy?: string;

  @IsOptional()
  updatedAt?: Date;
}

export class ManagerMappingDTO extends BaseDTO {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Manager name' })
  managerName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Employee name' })
  employeeName: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Manager mapping status' })
  status?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Manager ID (Login ID)' })
  managerId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Department' })
  department?: string;
}
