import { SetMetadata } from '@nestjs/common';
import { NotePermission } from '../enums/note-permission.enum';

export const NOTE_PERMISSION_KEY = 'note_permission';

/**
 * Decorator to enforce note-level permission requirements on controller routes.
 * Examples:
 *   @Permission(NotePermission.CanView)
 *   @Permission(NotePermission.CanEdit)
 */
export const Permission = (permission: NotePermission | 'CanView' | 'CanEdit') =>
  SetMetadata(NOTE_PERMISSION_KEY, permission);
