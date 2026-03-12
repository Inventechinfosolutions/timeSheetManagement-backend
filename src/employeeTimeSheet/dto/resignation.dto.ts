import { IsDateString, IsNotEmpty, IsOptional, IsString, IsEnum, MaxLength } from 'class-validator';
import { ResignationStatus } from '../enums/resignation-status.enum';

export class CreateResignationDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsDateString()
  @IsNotEmpty()
  submittedDate: string;

  @IsDateString()
  @IsNotEmpty()
  proposedLastWorkingDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}

export class UpdateResignationStatusDto {
  @IsEnum(ResignationStatus)
  status: ResignationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
