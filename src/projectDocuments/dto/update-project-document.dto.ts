import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Department } from '../../employeeTimeSheet/enums/department.enum';

export class UpdateProjectDocumentDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  projectName?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @IsEnum(Department)
  @IsOptional()
  department?: Department;
}


