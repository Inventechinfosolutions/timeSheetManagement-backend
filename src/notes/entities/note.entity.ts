import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { NoteType } from '../enums/note-type.enum';
import { DocumentDetailsDto } from '../../common/document-uploader/dto/documentdetails.dto';

@Entity('notes')
export class Note extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'longtext', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: NoteType,
    default: NoteType.PERSONAL,
  })
  type: NoteType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  projectName: string | null;

  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @ManyToOne(() => Note, (note) => note.subNotes, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parentId' })
  parent: Note | null;

  @OneToMany(() => Note, (note) => note.parent, {
    cascade: true,
  })
  subNotes: Note[];

  @Column({ type: 'varchar', length: 100, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  employeeId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: '#4318FF' })
  color: string;

  @Column({ type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  attachments?: DocumentDetailsDto[];
}
