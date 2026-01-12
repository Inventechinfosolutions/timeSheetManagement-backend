import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';



export enum AttendanceStatus {
  FULL_DAY = 'Full Day',
  HALF_DAY = 'Half Day',
  LEAVE = 'Leave',
  PENDING = 'Pending',
  NOT_UPDATED = 'Not Updated',
  WEEKEND = 'Weekend'
}

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

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceStatus,
    nullable: true,
  })
  status: AttendanceStatus | string | null;
}
