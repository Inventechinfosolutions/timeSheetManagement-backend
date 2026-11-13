import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

export enum AppraisalMappingStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** Who first receives the submitted appraisal (employee-assigner or manager-assigner). */
export enum AppraisalAssignerType {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
}

@Entity('appraisal_mapping')
export class AppraisalMapping extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'department', type: 'varchar', nullable: true })
  department!: string | null;

  @Column({ name: 'assigner_id', type: 'varchar' })
  assignerId!: string;

  @Column({ name: 'assigner_name', type: 'varchar' })
  assignerName!: string;

  @Column({
    name: 'assigner_type',
    type: 'enum',
    enum: AppraisalAssignerType,
  })
  assignerType!: AppraisalAssignerType;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId!: string;

  @Column({ name: 'employee_name', type: 'varchar' })
  employeeName!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AppraisalMappingStatus,
    default: AppraisalMappingStatus.ACTIVE,
  })
  status!: AppraisalMappingStatus;
}
