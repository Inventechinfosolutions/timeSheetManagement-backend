import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { Project } from './project.entity';
import { ProjectModel } from './project-model.entity';

@Entity('project_attachments')
export class ProjectAttachment extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500 })
  fileUrl: string;

  @Column({ type: 'varchar', length: 500 })
  fileKey: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string;

  @ManyToOne(() => Project, (project) => project.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: number;

  @ManyToOne(() => ProjectModel, (model) => model.attachments, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'modelId' })
  model: ProjectModel;

  @Column({ nullable: true })
  modelId: number;
}

