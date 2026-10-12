import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AttendenceEditRequestStatus } from '../enums/attendence-edit-request-status.enum';

export class CreateAttendenceEditRequestDto {
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((d) => String(d)).filter((d) => d.length > 0)
      : [],
  )
  @IsArray()
  @IsString({ each: true })
  requestDates: string[];

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class ReviewAttendenceEditRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AttendenceEditRequestResponseDto {
  id: number;
  employeeId: string;
  requestDates: string[];
  status: AttendenceEditRequestStatus;
  reason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  submittedDate?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  fullName?: string;
  department?: string;
  lockType?: string;
}
