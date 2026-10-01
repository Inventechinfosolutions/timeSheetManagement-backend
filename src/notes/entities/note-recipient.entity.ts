import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { NotePermission } from '../enums/note-permission.enum';

export { NotePermission };

/**
 * Master Data Entity for Note Permission.
 * Contains only `id` and `permission` column.
 * Options: CanView (default) and CanEdit.
 */
@Entity('master_note_permission')
export class NotePermissionMaster {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: NotePermission,
    default: NotePermission.CanView,
    unique: true,
  })
  permission: NotePermission;
}

// Export aliases
export { NotePermissionMaster as MasterNotePermission, NotePermissionMaster as NoteRecipient };
