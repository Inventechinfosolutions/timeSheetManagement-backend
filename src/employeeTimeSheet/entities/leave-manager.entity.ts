import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from 'src/common/entities/base.entity';

/** Admin-entered leaves taken for employees of departments using MANUAL leave calculation. */
@Entity('leave_manager')
@Index('UQ_leave_manager_employee_year', ['employeeId', 'year'], { unique: true })
export class LeaveManager extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'department', type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'year', type: 'int' })
  year: number;

  /** Total leaves taken in `year` up to and including `asOfDate`. */
  @Column({
    name: 'total_leaves_taken',
    type: 'decimal',
    precision: 5,
    scale: 1,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number | null) => Number(value ?? 0),
    },
  })
  totalLeavesTaken: number;

  /** Leaves recorded in the system after this date are added on top of totalLeavesTaken. */
  @Column({ name: 'as_of_date', type: 'date' })
  asOfDate: string;
}
