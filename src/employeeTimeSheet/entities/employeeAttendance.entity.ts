import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';


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
