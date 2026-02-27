import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { Department } from '../enums/department.enum';
import { EmploymentType } from '../enums/employment-type.enum';
import { Gender } from '../enums/gender.enum';
import { UserType } from '../../users/enums/user-type.enum';

@Entity('employee_details')
export class EmployeeDetails extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ name: 'employee_id', unique: true, length: 100 })
  employeeId: string;

  @Column({
    name: 'department',
    type: 'enum',
    enum: Department,
    nullable: true,
  })
  department: Department;

  @Column({ name: 'designation', length: 200 })
  designation: string;

  /** Full timer = 18 leaves/year, Intern = 12 leaves/year. If null, inferred from designation (contains "intern"). */
  @Column({
    name: 'employment_type',
    type: 'enum',
    enum: EmploymentType,
    nullable: true,
  })
  employmentType: EmploymentType | null;

  @Column({ name: 'email', unique: true, length: 255 ,nullable: true })
  email: string;

  @Column({ name: 'joining_date', type: 'date', nullable: true })
  joiningDate: Date;

  @Column({ name: 'conversion_date', type: 'date', nullable: true })
  conversionDate: Date;

  @Column({ name: 'password', length: 255, nullable: true })
  password: string;

  @Column({ name: 'user_status', default: 'ACTIVE', length: 50 })
  userStatus: string;

  @Column({
    name: 'gender',
    type: 'enum',
    enum: Gender,
    nullable: true,
  })
  gender: Gender;

  @Column({
    name: 'role',
    type: 'enum',
    enum: UserType,
    nullable: true,
  })
  role: UserType;

  @Column({ name: 'month_status', length: 50, default: 'Pending' })
  monthStatus: string;
}
