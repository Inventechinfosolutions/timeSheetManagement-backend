import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { QuaterlyEnum } from '../enums/quarterly_review.enums';
import {
  EmployeePerformanceStatus,
  LearningGoalsEnum,
  FeedbackOnWorkCultureEnum,
  WorkLifeBalanceEnum,
  SuggestionsForImprovementEnum,
  RateCompanyEnvironmentEnum,
} from '../enums/employee_performance.enums';
import { EditRequestStatus } from '../enums/edit_request.enums';

export interface PerformanceAttachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
}

@Entity('employee_performance')
@Unique(['employeeId', 'quarter', 'financialYear'])
export class EmployeePerformance extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  employeeId: string;

  @Column({
    type: 'enum',
    enum: QuaterlyEnum,
    nullable: false,
  })
  quarter: QuaterlyEnum; // 'Q1', 'Q2', 'Q3', 'Q4'

  @Column({ type: 'varchar', length: 50, nullable: false })
  financialYear: string; // e.g. '2025-2026'

  @Column({
    type: 'enum',
    enum: EmployeePerformanceStatus,
    default: EmployeePerformanceStatus.DRAFT,
    nullable: false,
  })
  status: EmployeePerformanceStatus;

  @Column({ type: 'datetime', nullable: true })
  submittedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastModifiedDate: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastModifiedBy: string;

  // --- Edit Permission Tracking (Option A - No separate table needed) ---
  @Column({
    type: 'enum',
    enum: EditRequestStatus,
    default: EditRequestStatus.NONE,
    nullable: false,
  })
  editRequestStatus: EditRequestStatus;

  @Column({ type: 'datetime', nullable: true })
  editRequestedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  editRequestReason: string | null;

  @Column({ type: 'datetime', nullable: true })
  editRespondedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  editResponseNote: string | null;

  @Column({ type: 'datetime', nullable: true })
  editAllowedUntil: Date | null;

  @Column({ type: 'varchar', name: 'editPopupSeenStatus', length: 50, nullable: true })
  editPopupSeenStatus: EmployeePerformanceStatus | null;

  // --- FRS Stepper 1 & Section A: Key Deliverables ---
  @Column({ type: 'text', nullable: true })
  majorProjects: string;

  @Column({ type: 'text', nullable: true })
  responsibilitiesHandled: string;

  @Column({ type: 'text', nullable: true })
  deliverablesCompleted: string;

  // --- FRS Stepper 2 & Section B: Achievements ---
  @Column({ type: 'text', nullable: true })
  keyAccomplishments: string;

  // --- FRS Stepper 3 & Section C: Challenges ---
  @Column({ type: 'text', nullable: true })
  challengesFaced: string;

  @Column({ type: 'text', nullable: true })
  riskMitigationSteps: string;

  // --- FRS Stepper 4 & Section D: Learning & Development ---
  @Column({ type: 'text', nullable: true })
  skillsAcquired: string;

  // --- FRS Stepper 5 & Section E: Goals for Next Quarter ---
  @Column({ type: 'text', nullable: true })
  plannedDeliverables: string;

  @Column({ type: 'text', nullable: true })
  careerDevelopmentGoals: string;

  // --- Supporting Documents (Up to 5 files, 10MB each) ---
  @Column({ type: 'simple-json', nullable: true })
  attachments: PerformanceAttachment[];

  // --- Legacy Compatibility Fields (Nullable) ---
  @Column({ type: 'text', nullable: true })
  overview: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  projectTitle: string;

  @Column({ type: 'text', nullable: true })
  projectDescription: string;

  @Column({ type: 'text', nullable: true })
  challenge: string;

  @Column({ type: 'int', nullable: true })
  crossDepartmentCollaboration: number;

  @Column({ type: 'int', nullable: true })
  mentorshipKnowledgeSharing: number;

  @Column({ type: 'int', nullable: true })
  reliabilityAccountability: number;

  @Column({ type: 'int', nullable: true })
  communicationTransparency: number;

  @Column({ type: 'int', nullable: true })
  peerSupportTeamSpirit: number;

  @Column({ type: 'int', nullable: true })
  adaptabilityInitiative: number;

  @Column({
    type: 'enum',
    enum: LearningGoalsEnum,
    nullable: true,
  })
  learningGoals: LearningGoalsEnum;

  @Column({
    type: 'enum',
    enum: FeedbackOnWorkCultureEnum,
    nullable: true,
  })
  feedbackOnWorkCulture: FeedbackOnWorkCultureEnum;

  @Column({
    type: 'enum',
    enum: WorkLifeBalanceEnum,
    nullable: true,
  })
  workLifeBalance: WorkLifeBalanceEnum;

  @Column({
    type: 'enum',
    enum: SuggestionsForImprovementEnum,
    nullable: true,
  })
  suggestionsForImprovement: SuggestionsForImprovementEnum;

  @Column({
    type: 'enum',
    enum: RateCompanyEnvironmentEnum,
    nullable: true,
  })
  rateCompanyEnvironment: RateCompanyEnvironmentEnum;
}

// Backward compatibility alias
export const MasterEmployeePerformance = EmployeePerformance;
export type MasterEmployeePerformance = EmployeePerformance;
