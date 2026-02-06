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

  @Column({ name: 'request_type' })
  requestType: string;

  @Column({ name: 'from_date', type: 'date' })
  fromDate: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'Pending' })
  status: string;

  @Column({ name: 'submitted_date', type: 'date', nullable: true })
  submittedDate: string;

  @Column({ type: 'int', default: 0 })
  duration: number;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'is_read_employee', default: true })
  isReadEmployee: boolean;

  @Column({ name: 'request_modified_from', nullable: true })
  requestModifiedFrom: string;

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy: string;
}
