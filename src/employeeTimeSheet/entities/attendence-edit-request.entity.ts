import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { AttendenceEditRequestStatus } from '../enums/attendence-edit-request-status.enum';
import { LockType } from '../../master/enums/lock-type.enum';

@Entity('attendence_edit_request')
export class AttendenceEditRequest extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 64 })
  employeeId!: string;

  @Column({ name: 'request_dates', type: 'text' })
  requestDates!: string;

  @Column({
    type: 'enum',
    enum: AttendenceEditRequestStatus,
    default: AttendenceEditRequestStatus.PENDING,
  })
  status!: AttendenceEditRequestStatus;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 64, nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'datetime', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'submitted_date', type: 'date', nullable: true })
  submittedDate!: string | null;

  @Column({
    name: 'lock_type',
    type: 'enum',
    enum: LockType,
    default: LockType.WEEKLY,
  })
  lockType!: LockType;
}
