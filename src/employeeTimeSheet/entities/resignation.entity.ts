import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { ResignationStatus } from '../enums/resignation-status.enum';

@Entity('resignations')
export class Resignation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'submitted_date', type: 'date' })
  submittedDate: string;

  @Column({ name: 'proposed_last_working_date', type: 'date' })
  proposedLastWorkingDate: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: ResignationStatus,
    default: ResignationStatus.PENDING,
  })
  status: ResignationStatus;

  @Column({ name: 'reviewed_by', type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;
}
