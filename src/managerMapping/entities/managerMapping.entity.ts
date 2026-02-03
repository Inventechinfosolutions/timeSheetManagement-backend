/* eslint-disable @typescript-eslint/no-unused-vars */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

export enum ManagerMappingStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('manager_mapping')
export class ManagerMapping extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;


  @Column({ name: 'manager_name' })
  managerName: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'employee_name' })
  employeeName: string;

  @Column({ name: 'status', type: 'enum', enum: ManagerMappingStatus })
  status: ManagerMappingStatus;

  @Column({ name: 'department', nullable: true, type: 'varchar' })
  department: string | null;
}
