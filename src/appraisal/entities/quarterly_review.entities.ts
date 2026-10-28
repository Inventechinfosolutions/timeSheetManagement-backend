import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import {
  ReviewEmployeeType,
  ReviewAssignedBy,
  QuarterlyReviewStatus,
  QuaterlyEnum,
} from '../enums/quarterly_review.enums';
import { AppraisalAuditEntry } from '../interfaces/appraisal_audit.interface';

@Entity('quaterly_review')
@Unique(['employeeId', 'quarter', 'financialYear'])
export class QuarterlyReview extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  employeeId!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  employeeName!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  designation!: string | null;

  @Column({
    type: 'enum',
    enum: ReviewEmployeeType,
    default: ReviewEmployeeType.EMPLOYEE,
    nullable: false,
  })
  employeeType!: ReviewEmployeeType;

  @Column({ type: 'varchar', length: 50, nullable: false })
  financialYear!: string; // e.g. '2025-2026'

  @Column({
    type: 'enum',
    enum: QuaterlyEnum,
    nullable: false,
  })
  quarter!: QuaterlyEnum; // 'Q1', 'Q2', 'Q3', 'Q4'

  @Column({ type: 'date', nullable: true })
  assignedDate!: Date | null;

  @Column({ type: 'date', nullable: true })
  deadlineDate!: Date | null; // Due date

  @Column({ type: 'datetime', nullable: true })
  submittedDate!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  reviewedDate!: Date | null; // Completion timestamp

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: ReviewAssignedBy,
    default: ReviewAssignedBy.MANAGER,
    nullable: false,
  })
  assignedBy!: ReviewAssignedBy;

  @Column({ type: 'varchar', length: 100, nullable: false })
  assignerId!: string; // ID of the reviewer/manager assigning the review

  @Column({ type: 'varchar', length: 100, nullable: true })
  managerId!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  managerName!: string | null;

  @Column({
    type: 'enum',
    enum: QuarterlyReviewStatus,
    default: QuarterlyReviewStatus.NOT_STARTED,
    nullable: false,
  })
  status!: QuarterlyReviewStatus;

  // Evaluation Metrics (1 to 5 scale, Nullable until reviewed)
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  overallPerformanceRating!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  productivity!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  qualityOfWork!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  technicalJobSkills!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  ownershipResponsibility!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  communication!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  teamCollaboration!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  innovationProblemSolving!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  finalRating!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ratingDescription!: string | null; // 'Outstanding', 'Exceeds Expectations', etc.

  @Column({ type: 'int', nullable: true })
  performanceIndex!: number | null; // Legacy score

  // Qualitative Feedback (FR-05 Manager Remarks text areas)
  @Column({ type: 'text', nullable: true })
  performanceStrengths!: string | null;

  @Column({ type: 'text', nullable: true })
  areasOfImprovement!: string | null;

  @Column({ type: 'text', nullable: true })
  managerComment!: string | null;

  // Section 5: Final Review & Submission Fields
  @Column({ type: 'text', nullable: true })
  goalsForNextReviewPeriod!: string | null;

  @Column({ type: 'text', nullable: true })
  trainingDevelopmentRecommendations!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  careerGrowthRecommendation!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reviewOutcome!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  performanceAction!: string | null;

  @Column({ type: 'boolean', default: false })
  managerConfirmation!: boolean;

  // Linked employee self-assessment submission
  @Column({ type: 'int', nullable: true })
  performanceId!: number | null;

  @Column({ type: 'int', default: 0, nullable: false })
  reassignCount!: number;

  @Column({ type: 'json', nullable: true })
  auditHistory!: AppraisalAuditEntry[] | null;
}

// Aliases
export const QuaterlyReview = QuarterlyReview;
export type QuaterlyReview = QuarterlyReview;
export const MasterQuaterlyReview = QuarterlyReview;
export type MasterQuaterlyReview = QuarterlyReview;
