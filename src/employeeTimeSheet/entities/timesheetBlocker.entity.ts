import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { BaseEntity } from 'src/common/entities/base.entity';

@Entity('timesheet_blocker')
@Index('IDX_TIMESHEET_BLOCKER_EMPLOYEE_ID', ['employeeId'])
@Index('IDX_TIMESHEET_BLOCKER_BLOCKED_FROM', ['blockedFrom'])
@Index('IDX_TIMESHEET_BLOCKER_BLOCKED_TO', ['blockedTo'])
@Index('IDX_TIMESHEET_BLOCKER_EMPLOYEE_DATES', ['employeeId', 'blockedFrom', 'blockedTo'])
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
