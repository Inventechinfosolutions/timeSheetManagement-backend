import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class TimesheetBlockerDto {
  @IsOptional()
  id?: number;

  @IsString()
  @Transform(({ value }) => value?.trim())
  @IsNotEmpty()
  employeeId: string;

  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  blockedFrom: Date;

  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  blockedTo: Date;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsNotEmpty()
  blockedBy: string;
}
