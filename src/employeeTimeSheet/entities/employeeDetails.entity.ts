import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('employee_details')
export class EmployeeDetails {
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
}
