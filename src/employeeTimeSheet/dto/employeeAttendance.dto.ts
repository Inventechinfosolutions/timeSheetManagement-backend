import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { AttendanceStatus } from '../enums/attendance-status.enum';

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



  @IsNumber()
  @IsOptional()
  totalHours: number;

  @IsString()
  @IsOptional()
  workLocation: string;

  @IsEnum(AttendanceStatus)
  @IsOptional()
  status: AttendanceStatus;
}
