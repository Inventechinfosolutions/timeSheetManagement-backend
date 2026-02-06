import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { Department } from '../../employeeTimeSheet/enums/department.enum';
import { ProjectModel } from './project-model.entity';
import { ProjectAttachment } from './project-attachment.entity';

@Entity('projects')
export class Project extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  projectName: string;

  @Column({
    type: 'enum',
    enum: Department,
    nullable: false,
  })
  department: Department;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoKey: string;

  @Column({ type: 'boolean', default: false })
  hasModels: boolean;

  @OneToMany(() => ProjectModel, (model) => model.project, { cascade: true })
  models: ProjectModel[];

  @OneToMany(() => ProjectAttachment, (attachment) => attachment.project, { cascade: true })
  attachments: ProjectAttachment[];
}

