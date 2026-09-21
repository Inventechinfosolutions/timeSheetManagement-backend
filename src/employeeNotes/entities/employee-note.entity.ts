import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { NoteCategory, NoteType } from '../enums/employee-note.enums';

/** Hydrated file returned by the API. Not stored on employee_notes. */
export interface NoteFileRecord {
  id: string;
  name: string;
  size: number;
  type: string;
  s3Key: string;
}

const toStoredFileIds = (value: unknown): string[] => {
  if (!value) return [];
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const id =
      typeof item === 'string' ? item : (item?.s3Key || item?.id || item?.key || '');
    if (
      id &&
      typeof id === 'string' &&
      !id.startsWith('temp-') &&
      !id.startsWith('note-') &&
      !seen.has(id)
    ) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
};

@Entity('employee_notes')
export class EmployeeNote extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id' })
  employeeId!: string;

  /** If this is a CHILD note created inside a parent project note's sub-table */
  @Column({ name: 'parent_note_id', type: 'int', nullable: true })
  parentNoteId?: number | null;

  /**
   * PARENT = top-level note (parent_note_id is NULL)
   * CHILD  = sub-table note (parent_note_id points to the parent)
   */
  @Column({
    name: 'type',
    type: 'enum',
    enum: NoteType,
    default: NoteType.PARENT,
  })
  type!: NoteType;

  /** Used for "Project Note" category – stores the project name */
  @Column({ nullable: true, default: '' })
  projectName?: string;

  /** Main title of the note (shown in the parent table "TITLE" column) */
  @Column({ default: '' })
  title!: string;

  /** Note category — drives whether this is a Project or Personal note */
  @Column({
    type: 'enum',
    enum: NoteCategory,
    default: NoteCategory.PERSONAL_NOTE,
  })
  category!: NoteCategory;

  /** Rich-text content */
  @Column({ type: 'text', nullable: true, default: '' })
  content!: string;

  /**
   * object_store UUID IDs only, e.g. ["269091ee-9001-47a8-8117-8aca7f86d9a4"].
   * File name / mime / bytes come from object_store + MinIO using that id.
   */
  @Column({
    type: 'json',
    nullable: true,
    transformer: {
      to: (value: unknown) => toStoredFileIds(value),
      from: (value: unknown) => toStoredFileIds(value),
    },
  })
  files!: string[];
}
