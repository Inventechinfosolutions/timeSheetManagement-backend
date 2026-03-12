import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { CompOffStatus } from '../enums/comp-off-status.enum';
import { Transform } from 'class-transformer';

export class CompOffDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
  @Transform(({ value }) => value?.trim())
  @IsNotEmpty()
  employeeId: string;

  @IsDateString()
  @IsNotEmpty()
  attendanceDate: string;

  @IsEnum(CompOffStatus)
  @IsOptional()
  status?: CompOffStatus;

  @IsNumber()
  @IsOptional()
  attendanceId?: number;

  @IsNumber()
  @IsOptional()
  remainingDays?: number;

  @IsString()
  @IsOptional()
  takenDates?: string;

  @IsNumber()
  @IsOptional()
  leaveRequestId?: number;
}
