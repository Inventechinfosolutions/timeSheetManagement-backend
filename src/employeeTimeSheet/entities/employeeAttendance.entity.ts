import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export enum OfficeLocation {
  OFFICE = 'Office',
  WORK_FROM_HOME = 'Work from Home',
  CLIENT_PLACE = 'Client Place',
}

export enum AttendanceStatus {
  FULL_DAY = 'Full Day',
  HALF_DAY = 'Half Day',
  LEAVE = 'Leave',
  PENDING = 'Pending',
}

@Entity('employee_attendance')
export class EmployeeAttendance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'working_date', type: 'date' })
  workingDate: Date;

  @Column({ name: 'login_time', nullable: true })
  loginTime: string;

  @Column({ name: 'logout_time', nullable: true })
  logoutTime: string;

  @Column({
    name: 'location',
    type: 'enum',
    enum: OfficeLocation,
    nullable: true,
  })
  location: string;

  @Column({ name: 'total_hours', type: 'float', nullable: true })
  totalHours: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceStatus,
    nullable: true,
  })
  status: string;
}
