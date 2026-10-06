import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import {
    ReviewEmployeeType,
    ReviewAssignedBy,
    QuarterlyReviewStatus,
    PerformanceStrengthsEnum,
    AreasOfImprovementEnum,
    AdditionalRemarksEnum,
    QuaterlyEnum,
} from '../enums/quarterly_review.enums';

@Entity('quaterly_review')
export class QuarterlyReview extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 100, nullable: false })
    employeeId: string;

    @Column({
        type: 'enum',
        enum: ReviewEmployeeType,
        nullable: false,
    })
    employeeType: ReviewEmployeeType;

    @Column({ type: 'varchar', length: 50, nullable: false })
    financialYear: string; // e.g. '2025-2026'

    @Column({
        type: 'enum',
        enum: QuaterlyEnum,
        nullable: false,
    })
    quarter: QuaterlyEnum; // 'Q1', 'Q2', 'Q3', 'Q4'

    @Column({ type: 'date', nullable: false })
    assignedDate: Date;

    @Column({ type: 'date', nullable: false })
    deadlineDate: Date;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        type: 'enum',
        enum: ReviewAssignedBy,
        nullable: false,
    })
    assignedBy: ReviewAssignedBy;

    @Column({ type: 'varchar', length: 100, nullable: false })
    assignerId: string; // ID of the reviewer/manager assigning the review

    @Column({
        type: 'enum',
        enum: QuarterlyReviewStatus,
        default: QuarterlyReviewStatus.PENDING,
        nullable: false,
    })
    status: QuarterlyReviewStatus;

    // Evaluation Metrics (INT, Nullable)
    @Column({ type: 'int', nullable: true })
    productivity: number;

    @Column({ type: 'int', nullable: true })
    ownershipResponsibility: number;

    @Column({ type: 'int', nullable: true })
    teamCollaboration: number;

    @Column({ type: 'int', nullable: true })
    qualityOfWork: number;

    @Column({ type: 'int', nullable: true })
    communication: number;

    @Column({ type: 'int', nullable: true })
    innovationProblemSolving: number;

    @Column({ type: 'int', nullable: true })
    performanceIndex?: number; // Computed or assigned overall performance index score

    // Qualitative Feedback (Enums, Nullable)
    @Column({
        type: 'enum',
        enum: PerformanceStrengthsEnum,
        nullable: true,
    })
    performanceStrengths?: PerformanceStrengthsEnum;

    @Column({
        type: 'enum',
        enum: AreasOfImprovementEnum,
        nullable: true,
    })
    areasOfImprovement?: AreasOfImprovementEnum;

    @Column({
        type: 'enum',
        enum: AdditionalRemarksEnum,
        nullable: true,
    })
    additionalRemarks?: AdditionalRemarksEnum;
}

// Aliases
export const QuaterlyReview = QuarterlyReview;
export type QuaterlyReview = QuarterlyReview;
export const MasterQuaterlyReview = QuarterlyReview;
export type MasterQuaterlyReview = QuarterlyReview;
