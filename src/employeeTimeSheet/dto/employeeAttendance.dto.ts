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
import { WorkLocation } from '../enums/work-location.enum';

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



  @IsOptional()
  totalHours?: number | null;

  @IsString()
  @IsOptional()
  workLocation?: string | null;

  @IsEnum(AttendanceStatus)
  @IsOptional()
  status: AttendanceStatus | string | null;

  @IsNumber()
  @IsOptional()
  sourceRequestId: number | null;

  @IsString()
  @IsOptional()
  firstHalf: string | null;

  @IsString()
  @IsOptional()
  secondHalf: string | null;
}
