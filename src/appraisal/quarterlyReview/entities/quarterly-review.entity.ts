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

  @Column({ name: 'achievements', type: 'text', nullable: true })
  achievements: string;

  @Column({ name: 'challenges', type: 'text', nullable: true })
  challenges: string;

  @Column({ name: 'learning_goals', type: 'text', nullable: true })
  learningGoals: string;

  @Column({ name: 'submitted_date', type: 'timestamp', nullable: true })
  submittedDate: Date | null;

  @Column({ name: 'manager_name', type: 'varchar', length: 150, nullable: true })
  managerName: string | null;
}
