import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { Project } from './project.entity';
import { ProjectAttachment } from './project-attachment.entity';

@Entity('project_models')
export class ProjectModel extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  modelName: string;

  @ManyToOne(() => Project, (project) => project.models, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: number;

  @OneToMany(() => ProjectAttachment, (attachment) => attachment.model, { cascade: true })
  attachments: ProjectAttachment[];
}
