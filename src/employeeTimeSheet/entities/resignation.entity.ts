import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { ResignationStatus } from '../enums/resignation-status.enum';

@Entity('resignations')
export class Resignation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'submitted_date', type: 'date' })
  submittedDate: string;

  @Column({ name: 'proposed_last_working_date', type: 'date', nullable: true })
  proposedLastWorkingDate: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: ResignationStatus,
    default: ResignationStatus.PENDING_MANAGER,
  })
  status: ResignationStatus;

  @Column({ name: 'reviewed_by', type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ name: 'notice_period', type: 'varchar', length: 100, nullable: true })
  noticePeriod: string | null;

  @Column({ name: 'handover_to', type: 'varchar', length: 255, nullable: true })
  handoverTo: string | null;

  @Column({ name: 'handover_description', type: 'text', nullable: true })
  handoverDescription: string | null;

  @Column({ name: 'manager_approval_status', type: 'varchar', length: 50, nullable: true })
  managerApprovalStatus: string | null;

  @Column({ name: 'hr_approval_status', type: 'varchar', length: 50, nullable: true })
  hrApprovalStatus: string | null;

  @Column({ name: 'final_exit_status', type: 'varchar', length: 50, nullable: true })
  finalExitStatus: string | null;

  /** Optional CC email addresses for resignation notifications (JSON array string). */
  @Column({ name: 'cc_emails', type: 'text', nullable: true })
  ccEmails: string | null;

  @Column({ name: 'manager_reviewed_by', type: 'varchar', length: 255, nullable: true })
  managerReviewedBy: string | null;

  @Column({ name: 'manager_reviewed_at', type: 'timestamp', nullable: true })
  managerReviewedAt: Date | null;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments: string | null;

  @Column({ name: 'final_reviewed_by', type: 'varchar', length: 255, nullable: true })
  finalReviewedBy: string | null;

  @Column({ name: 'final_reviewed_at', type: 'timestamp', nullable: true })
  finalReviewedAt: Date | null;

  @Column({ name: 'final_comments', type: 'text', nullable: true })
  finalComments: string | null;

  @Column({ name: 'notice_period_start_date', type: 'date', nullable: true })
  noticePeriodStartDate: string | null;

  @Column({ name: 'notice_period_end_date', type: 'date', nullable: true })
  noticePeriodEndDate: string | null;

  @Column({ name: 'notice_period_days', type: 'int', nullable: true })
  noticePeriodDays: number | null;

  @Column({ name: 'audit_log', type: 'longtext', nullable: true })
  auditLog: string | null;
}
