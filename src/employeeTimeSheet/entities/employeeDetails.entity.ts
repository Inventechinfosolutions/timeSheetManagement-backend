import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('employee_details')
export class EmployeeDetails extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ name: 'employee_id', unique: true, length: 100 })
  employeeId: string;

  @Column({ name: 'department', length: 200 })
  department: string;

  @Column({ name: 'designation', length: 200 })
  designation: string;

  @Column({ name: 'email', unique: true, length: 255 })
  email: string;

  @Column({ name: 'password', length: 255, nullable: true })
  password: string;

  @Column({ name: 'user_status', default: 'ACTIVE', length: 50 })
  userStatus: string;
}
