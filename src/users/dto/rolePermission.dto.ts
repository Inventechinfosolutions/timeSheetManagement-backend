import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsString } from 'class-validator';

/**
 * A RolePermission DTO object.
 */
export class RolePermissionDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({ description: 'Role ID field' })
  roleId: number;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Permission ID field' })
  permissionId: string;

  @IsNotEmpty()
  @IsBoolean()
  @ApiProperty({ description: 'Permission value (yes/no)' })
  valueYn: boolean;
}
