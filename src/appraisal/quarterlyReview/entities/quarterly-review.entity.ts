import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../../common/core/models/base.entity';
import { ReviewStatus } from '../enums/quarterly-review.enum';

@Entity('quarterly_reviews')
export class QuarterlyReview extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId: string;

  @Column({ name: 'quarter', type: 'varchar', length: 50 })
  quarter: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.DRAFT,
  })
  status: ReviewStatus;

  @Column({ name: 'overview', type: 'text', nullable: true })
  overview: string;

  @Column({ name: 'achievements', type: 'json', nullable: true })
  achievements: any;

  @Column({ name: 'challenges', type: 'json', nullable: true })
  challenges: any;

  @Column({ name: 'learning_goals', type: 'json', nullable: true })
  learningGoals: any;

  @Column({ name: 'submitted_date', type: 'timestamp', nullable: true })
  submittedDate: Date | null;

  @Column({ name: 'manager_name', type: 'varchar', length: 150, nullable: true })
  managerName: string | null;

  @Column({ name: 'review_status', type: 'varchar', length: 50, nullable: true })
  reviewStatus: string | null;

  @Column({ name: 'final_rating', type: 'varchar', length: 100, nullable: true })
  finalRating: string | null;

  @Column({ name: 'reviewed_on', type: 'timestamp', nullable: true })
  reviewedOn: Date | null;

  @Column({ name: 'ratings', type: 'json', nullable: true })
  ratings: any;

  @Column({ name: 'strengths', type: 'text', nullable: true })
  strengths: string | null;

  @Column({ name: 'improvements', type: 'text', nullable: true })
  improvements: string | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;
}

