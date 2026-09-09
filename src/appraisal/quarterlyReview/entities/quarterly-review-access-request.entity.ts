import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../../common/core/models/base.entity';

export enum AccessRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('quarterly_review_access_requests')
export class QuarterlyReviewAccessRequest extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 150, nullable: true })
  employeeName: string | null;

  @Column({ name: 'quarter', type: 'varchar', length: 50 })
  quarter: string;

  @Column({ name: 'user_role', type: 'varchar', length: 50 })
  userRole: string; // 'EMPLOYEE' | 'MANAGER'

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 50,
    default: AccessRequestStatus.PENDING,
  })
  status: AccessRequestStatus;

  @Column({ name: 'manager_name', type: 'varchar', length: 150, nullable: true })
  managerName: string | null;

  @Column({ name: 'approved_by_id', type: 'varchar', length: 100, nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_by_name', type: 'varchar', length: 150, nullable: true })
  approvedByName: string | null;

  @Column({ name: 'approved_by_role', type: 'varchar', length: 50, nullable: true })
  approvedByRole: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'access_until', type: 'timestamp', nullable: true })
  accessUntil: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'rejected_by_id', type: 'varchar', length: 100, nullable: true })
  rejectedById: string | null;

  @Column({ name: 'rejected_by_name', type: 'varchar', length: 150, nullable: true })
  rejectedByName: string | null;
  @Column({ name: 'rejected_at', type: 'timestamp', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'assignment_id', type: 'int', nullable: true })
  assignmentId: number | null;

  @Column({ name: 'requested_at', type: 'timestamp', nullable: true })
  requestedAt: Date | null;

  @Column({ name: 'actioned_by_id', type: 'varchar', length: 100, nullable: true })
  actionedById: string | null;

  @Column({ name: 'actioned_by_name', type: 'varchar', length: 150, nullable: true })
  actionedByName: string | null;

  @Column({ name: 'actioned_at', type: 'timestamp', nullable: true })
  actionedAt: Date | null;

  @Column({ name: 'extension_deadline', type: 'timestamp', nullable: true })
  extensionDeadline: Date | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;
}