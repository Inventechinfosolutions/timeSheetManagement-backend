import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { LockType } from '../enums/lock-type.enum';
import { LeaveCalculationType } from '../enums/leave-calculation-type.enum';

@Entity('master_department')
export class MasterDepartment extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  departmentName!: string;

  @Column({ type: 'varchar', length: 50, nullable: false, unique: true })
  departmentCode!: string;

  @Column({
    name: 'lock_type',
    type: 'enum',
    enum: LockType,
    default: LockType.WEEKLY,
  })
  lockType!: LockType;

  @Column({
    name: 'leave_calculation_type',
    type: 'enum',
    enum: LeaveCalculationType,
    default: LeaveCalculationType.AUTO,
  })
  leaveCalculationType!: LeaveCalculationType;
}
