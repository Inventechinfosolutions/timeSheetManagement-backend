import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

export interface ProjectRow {
  id: string;
  title: string;       // "Project Title" shown in sub-table
  notes: string;       // rich-text / plain notes content
  createdBy?: string;  // employee id / name who added this row
  createdAt?: string;  // ISO date string
  updatedAt?: string;
}

@Entity('employee_notes')
export class EmployeeNote extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employee_id' })
  employeeId!: string;

  /** If this is a child note created inside a project note's sub-table */
  @Column({ name: 'parent_note_id', type: 'varchar', length: 255, nullable: true })
  parentNoteId?: string | null;

  /** Used for "Project Note" category – stores the project name */
  @Column({ nullable: true, default: '' })
  projectName?: string;

  /** Main title of the note (shown in the parent table "TITLE" column) */
  @Column({ default: '' })
  title!: string;

  /** 'Project Note' | 'Personal Note' */
  @Column({ default: 'Personal Note' })
  category!: string;

  /** Optional folder / tag */
  @Column({ nullable: true, default: 'General' })
  folder?: string;

  /** Rich-text content for Personal Notes */
  @Column({ type: 'text', nullable: true, default: '' })
  content!: string;

  /**
   * Sub-table rows for Project Notes.
   * Each row represents one project detail entry shown in the
   * expanded sub-table (Project Title / Created By columns).
   */
  @Column({ type: 'longtext', nullable: true })
  rows!: ProjectRow[];

  /** Attached file metadata */
  @Column({ type: 'longtext', nullable: true })
  files!: any[];
}
