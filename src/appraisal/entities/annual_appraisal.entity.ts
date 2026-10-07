import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

/**
 * Annual Appraisal Summary Table
 * Stores each employee's annual performance for a Financial Year:
 * All quarter ratings (Q1, Q2, Q3, Q4) and the overall Annual Average Rating.
 */
@Entity('annual_appraisal_summary')
@Unique(['employeeId', 'financialYear'])
export class AnnualAppraisalSummary extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  employeeId: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  employeeName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  designation: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  managerId: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  managerName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: false })
  financialYear: string; // e.g. '2025-2026'

  // Quarter 1
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  q1Rating: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  q1Status: string | null; // 'REVIEWED', 'SUBMITTED', 'PENDING', null

  // Quarter 2
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  q2Rating: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  q2Status: string | null;

  // Quarter 3
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  q3Rating: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  q3Status: string | null;

  // Quarter 4
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  q4Rating: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  q4Status: string | null;

  // Overall Annual Average & Final Rating
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  annualAverageRating: number | null; // Computed average of reviewed quarters

  @Column({ type: 'int', nullable: true })
  finalAnnualRating: number | null; // 1 to 5 rounded scale

  @Column({ type: 'varchar', length: 100, nullable: true })
  annualRatingDescription: string | null; // 'Outstanding', 'Exceeds Expectations', etc.

  @Column({ type: 'int', default: 0 })
  completedQuartersCount: number; // e.g. 1 to 4 quarters completed

  @Column({ type: 'text', nullable: true })
  remarks: string | null; // Annual HR or Manager summary remarks
}
