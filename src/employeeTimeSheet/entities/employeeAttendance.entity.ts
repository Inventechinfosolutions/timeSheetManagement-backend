import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { AttendanceStatus } from '../enums/attendance-status.enum';

@Entity('employee_attendance')
export class EmployeeAttendance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'working_date', type: 'date' })
  workingDate: Date;

  @Column({ name: 'total_hours', type: 'float', nullable: true })
  totalHours: number | null;

  @Column({ name: 'work_location', type: 'varchar', nullable: true })
  workLocation: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceStatus,
    nullable: true,
  })
  status: AttendanceStatus | string | null;

  @Column({ name: 'source_request_id', type: 'int', nullable: true })
  sourceRequestId?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
