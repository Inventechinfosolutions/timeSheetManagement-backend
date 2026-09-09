import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../../common/core/models/base.entity';

export enum AssignmentStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  AUTO_SUBMITTED = 'AUTO_SUBMITTED',
  COMPLETED = 'COMPLETED',
}

@Entity('review_assignments')
export class ReviewAssignment extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId!: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 150, nullable: true })
  employeeName!: string | null;

  @Column({ name: 'quarter', type: 'varchar', length: 50 })
  quarter!: string;

  @Column({ name: 'financial_year', type: 'varchar', length: 50, nullable: true })
  financialYear!: string | null;

  @Column({ name: 'assigned_by_id', type: 'varchar', length: 100 })
  assignedById!: string;

  @Column({ name: 'assigned_by_name', type: 'varchar', length: 150, nullable: true })
  assignedByName!: string | null;

  @Column({ name: 'assigned_by_role', type: 'varchar', length: 50 })
  assignedByRole!: 'MANAGER' | 'ADMIN' | 'CEO';

  @Column({ name: 'assigned_at', type: 'timestamp' })
  assignedAt!: Date;

  @Column({ name: 'deadline_at', type: 'timestamp' })
  deadlineAt!: Date;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 50,
    default: AssignmentStatus.ASSIGNED,
  })
  status!: AssignmentStatus;

  @Column({ name: 'is_access_open', type: 'tinyint', default: 1 })
  isAccessOpen!: number;

  @Column({ name: 'access_request_eligible_until', type: 'timestamp', nullable: true })
  accessRequestEligibleUntil!: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;
}