import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Department } from '../../employeeTimeSheet/enums/department.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: 'Name of the project' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  projectName?: string;

  @ApiPropertyOptional({
    description: 'Department',
    enum: Department,
  })
  @IsEnum(Department)
  @IsOptional()
  department?: Department;

  @ApiPropertyOptional({ description: 'Project description' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the project has models' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  hasModels?: boolean;
}
