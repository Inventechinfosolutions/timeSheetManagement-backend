import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('master_department')
export class MasterDepartment extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  departmentName: string;

  @Column({ type: 'varchar', length: 50, nullable: false, unique: true })
  departmentCode: string;
}
