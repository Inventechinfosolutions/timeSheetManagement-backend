import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { Department } from '../../employeeTimeSheet/enums/department.enum';

@Entity('project_documents')
export class ProjectDocument extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  projectName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: Department,
    nullable: false,
  })
  department: Department;

  @Column({ type: 'varchar', length: 500, nullable: true })
  projectPhotoUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  projectPhotoKey: string;
}


