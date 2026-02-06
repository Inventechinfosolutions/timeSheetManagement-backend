import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Department } from '../../employeeTimeSheet/enums/department.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Name of the project', example: 'Mobile App Redesign' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  projectName: string;

  @ApiPropertyOptional({
    description: 'Department (auto-filled for employees, selectable for admin)',
    enum: Department,
    example: Department.IT,
  })
  @IsEnum(Department)
  @IsOptional()
  department?: Department;

  @ApiPropertyOptional({ description: 'Project description', example: 'Complete redesign of mobile application UI/UX' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiProperty({ description: 'Whether the project has models', example: true })
  @IsBoolean()
  @Type(() => Boolean)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true';
    }
    return value;
  })
  hasModels: boolean;
}
