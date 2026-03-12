import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EmployeeDetails } from './employeeDetails.entity';
import { EmployeeAttendance } from './employeeAttendance.entity';
import { CompOffStatus } from '../enums/comp-off-status.enum';

@Entity('comp_off')
export class CompOff extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => EmployeeDetails)
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'employeeId' })
  employee: EmployeeDetails;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({
    type: 'enum',
    enum: CompOffStatus,
    default: CompOffStatus.NOT_TAKEN,
  })
  status: CompOffStatus;

  @Column({ name: 'attendance_id', nullable: true })
  attendanceId: number;

  @ManyToOne(() => EmployeeAttendance)
  @JoinColumn({ name: 'attendance_id' })
  attendance: EmployeeAttendance;

  @Column({ name: 'remaining_days', type: 'float', default: 1.0 })
  remainingDays: number;

  @Column({ name: 'taken_dates', type: 'text', nullable: true })
  takenDates: string | null;

  @Column({ name: 'leave_request_id', type: 'int', nullable: true })
  leaveRequestId: number | null;
}
