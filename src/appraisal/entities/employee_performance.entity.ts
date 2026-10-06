import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
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

@Entity('employee_performance')
export class EmployeePerformance extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  employeeId: string;

  // Fetched/associated with the standard quarterly review quarter
  @Column({
    type: 'enum',
    enum: QuaterlyEnum,
    nullable: false,
  })
  quarter: QuaterlyEnum; // 'Q1', 'Q2', 'Q3', 'Q4'

  @Column({ type: 'varchar', length: 50, nullable: true })
  financialYear: string; // e.g. '2025-2026'

  @Column({ type: 'text', nullable: false })
  overview: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  projectTitle: string;

  @Column({ type: 'text', nullable: false })
  projectDescription: string;

  @Column({ type: 'text', nullable: false })
  challenge: string;

  // Evaluation Metrics (INT, Not Null)
  @Column({ type: 'int', nullable: false })
  crossDepartmentCollaboration: number;

  @Column({ type: 'int', nullable: false })
  mentorshipKnowledgeSharing: number;

  @Column({ type: 'int', nullable: false })
  reliabilityAccountability: number;

  @Column({ type: 'int', nullable: false })
  communicationTransparency: number;

  @Column({ type: 'int', nullable: false })
  peerSupportTeamSpirit: number;

  @Column({ type: 'int', nullable: false })
  adaptabilityInitiative: number;

  // Qualitative Feedback Enums (Not Null)
  @Column({
    type: 'enum',
    enum: LearningGoalsEnum,
    nullable: false,
  })
  learningGoals: LearningGoalsEnum;

  @Column({
    type: 'enum',
    enum: FeedbackOnWorkCultureEnum,
    nullable: false,
  })
  feedbackOnWorkCulture: FeedbackOnWorkCultureEnum;

  @Column({
    type: 'enum',
    enum: WorkLifeBalanceEnum,
    nullable: false,
  })
  workLifeBalance: WorkLifeBalanceEnum;

  @Column({
    type: 'enum',
    enum: SuggestionsForImprovementEnum,
    nullable: false,
  })
  suggestionsForImprovement: SuggestionsForImprovementEnum;

  @Column({
    type: 'enum',
    enum: RateCompanyEnvironmentEnum,
    nullable: false,
  })
  rateCompanyEnvironment: RateCompanyEnvironmentEnum;

  @Column({
    type: 'enum',
    enum: EmployeePerformanceStatus,
    default: EmployeePerformanceStatus.DRAFT,
    nullable: false,
  })
  status: EmployeePerformanceStatus;
}

// Backward compatibility alias
export const MasterEmployeePerformance = EmployeePerformance;
export type MasterEmployeePerformance = EmployeePerformance;
