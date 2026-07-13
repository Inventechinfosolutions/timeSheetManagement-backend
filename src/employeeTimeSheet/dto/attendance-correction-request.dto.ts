import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { AttendanceCorrectionStatus } from '../enums/attendance-correction-status.enum';

export class CreateAttendanceCorrectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty()
  @IsDate()
  @Type(() => Date)
  workingDate: Date;

  @ApiProperty({ description: 'Requested check-in time' })
  @IsDate()
  @Type(() => Date)
  requestedCheckInTime: Date;

  @ApiProperty({ description: 'Requested check-out time' })
  @IsDate()
  @Type(() => Date)
  requestedCheckOutTime: Date;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class UpdateAttendanceCorrectionStatusDto {
  @ApiProperty({ enum: AttendanceCorrectionStatus })
  @IsEnum(AttendanceCorrectionStatus)
  status: AttendanceCorrectionStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  rejectionReason?: string;
}
