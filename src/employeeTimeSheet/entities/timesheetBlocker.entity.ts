import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { BaseEntity } from 'src/common/entities/base.entity';

@Entity('timesheet_blocker')
export class TimesheetBlocker extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'blocked_from', type: 'date' })
  blockedFrom: Date;

  @Column({ name: 'blocked_to', type: 'date' })
  blockedTo: Date;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'blocked_by' })
  blockedBy: string;

  @CreateDateColumn({ name: 'blocked_at' })
  blockedAt: Date;
}
