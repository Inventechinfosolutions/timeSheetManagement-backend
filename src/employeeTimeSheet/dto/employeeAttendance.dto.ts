import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  AttendanceStatus,
  OfficeLocation,
} from '../entities/employeeAttendance.entity';

export class EmployeeAttendanceDto {
  @IsNumber()
  @IsOptional()
  id: number;

  @IsString()
  @Transform(({ value }) => value?.trim())
  @IsNotEmpty()
  employeeId: string;

  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  workingDate: Date;

  @IsString()
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  loginTime: string;

  @IsString()
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  logoutTime: string;

  @IsEnum(OfficeLocation)
  @IsOptional()
  location: OfficeLocation;

  @IsNumber()
  @IsOptional()
  totalHours: number;

  @IsEnum(AttendanceStatus)
  @IsOptional()
  status: AttendanceStatus;
}
