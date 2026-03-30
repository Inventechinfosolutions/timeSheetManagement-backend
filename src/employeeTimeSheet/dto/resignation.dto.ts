import { IsDateString, IsNotEmpty, IsOptional, IsString, IsEnum, MaxLength, IsArray, IsEmail, ArrayMaxSize } from 'class-validator';
import { ResignationStatus } from '../enums/resignation-status.enum';

export class CreateResignationDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsDateString()
  @IsNotEmpty()
  submittedDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  noticePeriod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  handoverTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  handoverDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;

  /** Optional CC email addresses for resignation notifications (max 10). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  ccEmails?: string[];
}

export class UpdateResignationStatusDto {
  @IsEnum(ResignationStatus, {
    message: 'status must be APPROVED or REJECTED for review actions',
  })
  status: ResignationStatus.APPROVED | ResignationStatus.REJECTED;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  comments: string;

  @IsOptional()
  @IsDateString()
  noticePeriodStartDate?: string;

  @IsOptional()
  @IsDateString()
  noticePeriodEndDate?: string;
}
