  import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
  import { AttendanceStatus } from '../enums/attendance-status.enum';
  import { WorkLocation } from '../enums/work-location.enum';
  import { BaseEntity } from '../../common/core/models/base.entity';

  @Entity('employee_attendance')
  export class EmployeeAttendance extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'employee_id', type: 'varchar' })
    employeeId: string;

    @Column({ name: 'working_date', type: 'date' })
    workingDate: Date;

    @Column({ name: 'total_hours', type: 'decimal', precision: 10, scale: 2, nullable: true })
    totalHours: number | null;

    @Column({ name: 'work_location', type: 'varchar', nullable: true })
    workLocation: WorkLocation | null;

    @Column({
      name: 'status',
      type: 'enum',
      enum: AttendanceStatus,
      nullable: true,
    })
    status: AttendanceStatus | null;

    @Column({ name: 'first_half', type: 'varchar', nullable: true })
    firstHalf: WorkLocation | AttendanceStatus | null;

    @Column({ name: 'second_half', type: 'varchar', nullable: true })
    secondHalf: WorkLocation | AttendanceStatus | null;

    @Column({ name: 'source_request_id', type: 'int', nullable: true })
    sourceRequestId?: number | null;

  }
