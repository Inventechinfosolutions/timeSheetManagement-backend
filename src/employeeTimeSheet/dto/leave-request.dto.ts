import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class LeaveRequestDto {
  @IsOptional()
  id?: number;

  @IsString()
  @Transform(({ value }) => value?.trim())
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  requestType: string;

  @IsDateString()
  @IsNotEmpty()
  fromDate: string;

  @IsDateString()
  @IsNotEmpty()
  toDate: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  submittedDate?: string;

  @IsNumber()
  @IsOptional()
  duration?: number;
}
