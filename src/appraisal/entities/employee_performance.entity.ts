import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { QuaterlyEnum } from '../enums/quarterly_review.enums';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { AppraisalAuditEntry } from '../interfaces/appraisal_audit.interface';
import {
  StepAchievements,
  StepEnvironment,
  StepFinalReview,
  StepLearning,
  StepOverview,
  StepTeamwork,
} from '../interfaces/employee_performance.interface';
export {
  PerformanceAttachment,
  PerformanceProject,
} from '../interfaces/employee_performance.interface';

@Entity('employee_performance')
@Unique(['employeeId', 'quarter', 'financialYear'])
export class EmployeePerformance extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  employeeId!: string;

  @Column({
    type: 'enum',
    enum: QuaterlyEnum,
    nullable: false,
  })
  quarter!: QuaterlyEnum;

  @Column({ type: 'varchar', length: 50, nullable: false })
  financialYear!: string;

  @Column({
    type: 'enum',
    enum: EmployeePerformanceStatus,
    default: EmployeePerformanceStatus.DRAFT,
    nullable: false,
  })
  status!: EmployeePerformanceStatus;

  @Column({ type: 'datetime', nullable: true })
  submittedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  lastModifiedDate!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastModifiedBy!: string;

  @Column({ type: 'datetime', nullable: true })
  editRequestedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  editRequestReason!: string | null;

  @Column({ type: 'datetime', nullable: true })
  editRespondedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  editResponseNote!: string | null;

  @Column({ type: 'datetime', nullable: true })
  editAllowedUntil!: Date | null;

  /** Step 1 */
  @Column({ type: 'json', nullable: true })
  stepOverview!: StepOverview | null;

  /** Step 2. Projects and their files live in this JSON. */
  @Column({ type: 'json', nullable: true })
  stepAchievements!: StepAchievements | null;

  /** Step 3 */
  @Column({ type: 'json', nullable: true })
  stepTeamwork!: StepTeamwork | null;

  /** Step 4 */
  @Column({ type: 'json', nullable: true })
  stepLearning!: StepLearning | null;

  /** Step 5 */
  @Column({ type: 'json', nullable: true })
  stepEnvironment!: StepEnvironment | null;

  /** Step 6 */
  @Column({ type: 'json', nullable: true })
  stepFinalReview!: StepFinalReview | null;

  @Column({ type: 'json', nullable: true })
  auditHistory!: AppraisalAuditEntry[] | null;
}

// Backward compatibility alias
export const MasterEmployeePerformance = EmployeePerformance;
export type MasterEmployeePerformance = EmployeePerformance;

