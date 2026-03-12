import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ArrayMaxSize,
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

  @IsString()
  @IsOptional()
  halfDayType?: string;

  @IsString()
  @IsOptional()
  otherHalfType?: string;

  @IsNotEmpty()
  @IsOptional()
  isHalfDay?: boolean;

  @IsString()
  @IsOptional()
  firstHalf?: string;

  @IsString()
  @IsOptional()
  secondHalf?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  ccEmails?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentKeys?: string[];

  @IsOptional()
  @IsString()
  availableDates?: string;
}
