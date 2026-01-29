import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AttendanceStatus {
  FULL_DAY = 'Full Day',
  HALF_DAY = 'Half Day',
  LEAVE = 'Leave',
  PENDING = 'Pending',
  NOT_UPDATED = 'Not Updated',
  WEEKEND = 'Weekend',
  HOLIDAY = 'Holiday'
}

@Entity('employee_attendance')
@Index('IDX_EMPLOYEE_ATTENDANCE_EMPLOYEE_ID', ['employeeId'])
@Index('IDX_EMPLOYEE_ATTENDANCE_WORKING_DATE', ['workingDate'])
@Index('IDX_EMPLOYEE_ATTENDANCE_EMPLOYEE_DATE', ['employeeId', 'workingDate'])
@Index('IDX_EMPLOYEE_ATTENDANCE_STATUS', ['status'])
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
