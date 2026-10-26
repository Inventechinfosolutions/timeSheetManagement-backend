import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { QuaterlyEnum } from '../enums/quarterly_review.enums';
import {
  EmployeePerformanceStatus,
  RateCompanyEnvironmentEnum,
} from '../enums/employee_performance.enums';
import { AppraisalAuditEntry } from '../interfaces/appraisal_audit.interface';
import {
  PerformanceAttachment,
  PerformanceProject,
} from '../interfaces/employee_performance.interface';
export {
  PerformanceAttachment,
  PerformanceProject,
} from '../interfaces/employee_performance.interface';

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

  // --- FRS Stepper 1 & Section A: Key Deliverables ---
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

  @Column({ type: 'simple-json', nullable: true })
  projects: PerformanceProject[];

  // --- Legacy Compatibility Fields (Nullable) ---
  @Column({ type: 'text', nullable: true })
  overview: string;

  // --- Step 1: Role & Quarter Overview ---
  @Column({ type: 'text', nullable: true })
  overallPerformanceSummary: string;

  @Column({ type: 'text', nullable: true })
  keyHighlights: string;

  @Column({ type: 'text', nullable: true })
  majorContributions: string;

  @Column({ type: 'text', nullable: true })
  areasForImprovement: string;

  // --- Step 3: Teamwork & Collaboration ---
  @Column({ type: 'text', nullable: true })
  teamCollaborationSummary: string;

  @Column({ type: 'text', nullable: true })
  crossTeamContributions: string;

  @Column({ type: 'text', nullable: true })
  knowledgeSharingMentoring: string;

  @Column({ type: 'text', nullable: true })
  teamworkExamples: string;

  @Column({ type: 'simple-json', nullable: true })
  teamRatings: Record<string, number>;

  // --- Step 4: Continuous Learning & Goals ---
  @Column({ type: 'text', nullable: true })
  certificationsOrCourses: string;

  @Column({ type: 'text', nullable: true })
  skillsToImprove: string;

  @Column({ type: 'text', nullable: true })
  supportOrTrainingRequired: string;

  @Column({ type: 'text', nullable: true })
  nextQuarterLearningGoals: string;

  // --- Step 5: Environment ---
  @Column({ type: 'int', nullable: true })
  workEnvironmentRating: number;

  @Column({ type: 'int', nullable: true })
  toolsResourcesRating: number;

  @Column({ type: 'int', nullable: true })
  managerSupportRating: number;

  @Column({ type: 'text', nullable: true })
  challengesAffectingProductivity: string;

  // --- Step 6: Review & Final Submission ---
  @Column({ type: 'int', nullable: true })
  overallSelfRating: number;

  @Column({ type: 'text', nullable: true })
  overallEmployeeComments: string;

  @Column({ type: 'text', nullable: true })
  careerGrowthInterests: string;

  @Column({ type: 'boolean', default: false })
  confirmationAccepted: boolean;

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

  @Column({ type: 'simple-json', nullable: true })
  learningGoals: string[];

  @Column({ type: 'text', nullable: true })
  feedbackOnWorkCulture: string;

  @Column({ type: 'text', nullable: true })
  workLifeBalance: string;

  @Column({ type: 'text', nullable: true })
  suggestionsForImprovement: string;

  @Column({
    type: 'enum',
    enum: RateCompanyEnvironmentEnum,
    nullable: true,
  })
  rateCompanyEnvironment: RateCompanyEnvironmentEnum;

  @Column({ type: 'json', nullable: true })
  auditHistory: AppraisalAuditEntry[] | null;
}

// Backward compatibility alias
export const MasterEmployeePerformance = EmployeePerformance;
export type MasterEmployeePerformance = EmployeePerformance;

