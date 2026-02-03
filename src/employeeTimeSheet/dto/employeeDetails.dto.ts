import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Department } from '../enums/department.enum';
import { UserType } from '../../users/enums/user-type.enum';

export class EmployeeDetailsDto {
  @IsOptional()
  @IsNumber()
  id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  employeeId: string;

  @IsEnum(Department)
  @IsNotEmpty()
  department: Department;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  designation: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  password?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  confirmPassword?: string;

  @IsEnum(UserType)
  @IsOptional()
  role?: UserType;
}
