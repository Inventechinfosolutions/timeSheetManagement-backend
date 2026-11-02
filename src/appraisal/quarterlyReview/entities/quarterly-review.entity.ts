import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../../common/core/models/base.entity';
import { ReviewStatus, AppraisalReviewStatus } from '../enums/quarterly-review.enum';

// ---------------------------------------------------------------------------
// QuarterlyReview
// ---------------------------------------------------------------------------
@Entity('quarterly_reviews')
export class QuarterlyReview extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId!: string;

  @Column({ name: 'quarter', type: 'varchar', length: 50 })
  quarter!: string;

  @Column({ name: 'financial_year', type: 'varchar', length: 50, nullable: true })
  financialYear!: string | null;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt!: Date | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 50,
    default: ReviewStatus.ASSIGNED,
  })
  status!: ReviewStatus;

  @Column({ name: 'overview', type: 'text', nullable: true })
  overview!: string;

  @Column({ name: 'projects', type: 'json', nullable: true })
  projects!: any;

  @Column({ name: 'learning_goals', type: 'json', nullable: true })
  learningGoals!: any;

  @Column({ name: 'self_rating', type: 'json', nullable: true })
  teamContribution!: any;

  @Column({ name: 'average_rating', type: 'decimal', precision: 3, scale: 1, nullable: true })
  averageRating!: number;

  @Column({ name: 'company_environment', type: 'json', nullable: true })
  companyEnvironment!: any;

  @Column({ name: 'submitted_date', type: 'timestamp', nullable: true })
  submittedDate!: Date | null;

  @Column({ name: 'manager_name', type: 'varchar', length: 150, nullable: true })
  managerName!: string | null;

  @Column({
    name: 'review_status',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: AppraisalReviewStatus.ASSIGNED,
  })
  reviewStatus!: AppraisalReviewStatus | string | null;

  @Column({ name: 'final_rating', type: 'varchar', length: 100, nullable: true })
  finalRating!: string | null;

  @Column({ name: 'reviewed_on', type: 'timestamp', nullable: true })
  reviewedOn!: Date | null;

  @Column({ name: 'ratings', type: 'json', nullable: true })
  ratings!: any;

  @Column({ name: 'strengths', type: 'text', nullable: true })
  strengths!: string | null;

  @Column({ name: 'improvements', type: 'text', nullable: true })
  improvements!: string | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'evaluator_name', type: 'varchar', length: 150, nullable: true })
  evaluatorName: string | null;

  @Column({ name: 'evaluator_role', type: 'varchar', length: 50, nullable: true })
  evaluatorRole: string | null;

  @Column({ name: 'auto_submitted', type: 'tinyint', default: 0 })
  autoSubmitted: number;

  @Column({ name: 'access_until', type: 'timestamp', nullable: true })
  accessUntil: Date | null;

  @Column({ name: 'is_reopened', type: 'tinyint', default: 0 })
  isReopened: number;
  @Column({ name: 'evaluator_id', type: 'varchar', length: 100, nullable: true })
  evaluatorId: string | null;

  @Column({ name: 'assignment_id', type: 'int', nullable: true })
  assignmentId: number | null;

  @Column({ name: 'submission_type', type: 'varchar', length: 50, nullable: true })
  submissionType: string | null;

  @Column({ name: 'deadline_at', type: 'timestamp', nullable: true })
  deadlineAt: Date | null;

  @Column({ name: 'access_request_eligible_until', type: 'timestamp', nullable: true })
  accessRequestEligibleUntil: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;
}