import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('leave_requests')
export class LeaveRequest extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'request_type', type: 'varchar' })
  requestType: string;

  @Column({ name: 'from_date', type: 'date' })
  fromDate: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', default: 'Pending' })
  status: string;

  @Column({ name: 'submitted_date', type: 'date', nullable: true })
  submittedDate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  duration: number;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'is_read_employee', default: true })
  isReadEmployee: boolean;

  @Column({ name: 'request_modified_from', type: 'varchar', nullable: true })
  requestModifiedFrom: string;

  @Column({ name: 'reviewed_by', type: 'varchar', nullable: true })
  reviewedBy: string;


  @Column({ name: 'first_half', type: 'varchar', nullable: true })
  firstHalf: string | null;

  @Column({ name: 'second_half', type: 'varchar', nullable: true })
  secondHalf: string | null;

  @Column({ name: 'is_half_day', type: 'boolean', default: false })
  isHalfDay: boolean;

  @Column({ name: 'is_modified', type: 'boolean', default: false })
  isModified: boolean;

  @Column({ name: 'modification_count', type: 'int', default: 0 })
  modificationCount: number;

  @Column({ name: 'last_modified_date', type: 'timestamp', nullable: true })
  lastModifiedDate: Date;
	}
