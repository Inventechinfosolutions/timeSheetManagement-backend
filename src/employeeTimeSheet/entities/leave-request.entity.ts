import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('leave_requests')
@Index('IDX_LEAVE_REQUEST_EMPLOYEE_ID', ['employeeId'])
@Index('IDX_LEAVE_REQUEST_STATUS', ['status'])
@Index('IDX_LEAVE_REQUEST_EMPLOYEE_STATUS', ['employeeId', 'status'])
@Index('IDX_LEAVE_REQUEST_FROM_DATE', ['fromDate'])
@Index('IDX_LEAVE_REQUEST_TO_DATE', ['toDate'])
@Index('IDX_LEAVE_REQUEST_IS_READ', ['isRead'])
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
}
