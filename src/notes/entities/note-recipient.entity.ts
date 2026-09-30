import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Note } from './note.entity';

export enum NotePermission {
  CanView = 'CanView',
  CanEdit = 'CanEdit',
}

@Entity('note_permission')
@Index('unique_note_employee', ['noteId', 'employeeId'], { unique: true })
export class NoteRecipient {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'note_id', type: 'int' })
  noteId: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId: string;

  @Column({
    type: 'enum',
    enum: NotePermission,
    default: NotePermission.CanView,
  })
  permission: NotePermission;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @ManyToOne(() => Note, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'note_id' })
  note: Note;
}
