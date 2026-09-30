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
import { NotePermission } from '../../notes/enums/note-permission.enum';

@Entity('inbox')
export class Inbox {
  @PrimaryGeneratedColumn({ name: 'inbox_id', type: 'bigint' })
  inboxId: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId: string;

  @Column({ name: 'notes_id', type: 'int' })
  notesId: number;

  @Column({ name: 'sender_id', type: 'varchar', length: 100, nullable: true })
  senderId?: string;

  @Column({ name: 'receiver_id', type: 'varchar', length: 100, nullable: true })
  receiverId?: string;

  @Column({ name: 'folder', type: 'varchar', length: 50, default: 'INBOX' })
  folder: 'INBOX' | 'SENT' | string;

  @Column({
    name: 'permission',
    type: 'varchar',
    length: 255,
    default: NotePermission.CanView,
  })
  permission: string;

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
