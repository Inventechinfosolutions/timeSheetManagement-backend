import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { Department } from '../enums/department.enum';
import { Gender } from '../enums/gender.enum';
import { UserType } from '../../users/enums/user-type.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

@Entity('intern_details')
export class InternDetails extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ name: 'intern_id', type: 'varchar', unique: true, length: 100 })
  internId: string;

  @Column({
    name: 'department',
    type: 'enum',
    enum: Department,
    nullable: true,
  })
  department: Department;

  @Column({ name: 'designation', length: 200 })
  designation: string;

  @Column({ name: 'email', unique: true, length: 255, nullable: true })
  email: string;

  @Column({ name: 'joining_date', type: 'date', nullable: true })
  joiningDate: Date;

  @Column({ name: 'conversion_date', type: 'date', nullable: true })
  conversionDate: Date | null;

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

  @Column({
    name: 'user_status',
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  userStatus: UserStatus;
}
