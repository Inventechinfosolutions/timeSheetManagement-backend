import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceCorrectionStatus } from '../enums/attendance-correction-status.enum';

@Entity('attendance_correction_requests')
export class AttendanceCorrectionRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ name: 'working_date', type: 'date' })
  workingDate: Date;

  @Column({ name: 'requested_check_in_time', type: 'time' })
  requestedCheckInTime: Date;

  @Column({ name: 'requested_check_out_time', type: 'time' })
  requestedCheckOutTime: Date;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: AttendanceCorrectionStatus,
    default: AttendanceCorrectionStatus.PENDING,
  })
  status: AttendanceCorrectionStatus;

  @Column({ name: 'reviewed_by', type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'attendance_id', type: 'int', nullable: true })
  attendanceId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
