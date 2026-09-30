import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Note } from '../../notes/entities/note.entity';

@Entity('inbox')
export class Inbox {
  @PrimaryGeneratedColumn({ name: 'inbox_id', type: 'bigint' })
  inboxId: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId: string;

  @Column({ name: 'notes_id', type: 'int' })
  notesId: number;

  @Column({ name: 'from_mail', type: 'varchar', length: 255 })
  fromMail: string;

  @Column({ name: 'to_mail', type: 'varchar', length: 255 })
  toMail: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @ManyToOne(() => Note, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'notes_id' })
  note?: Note;
}
