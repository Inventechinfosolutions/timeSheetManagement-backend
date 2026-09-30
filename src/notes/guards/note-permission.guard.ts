import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NOTE_PERMISSION_KEY } from '../decorators/permission.decorator';
import { Note } from '../entities/note.entity';
import { NotePermission } from '../enums/note-permission.enum';
import { Inbox } from '../../inbox/entities/inbox.entity';
import { DocumentMetaInfo } from '../../common/document-uploader/models/documentmetainfo.model';

@Injectable()
export class NotePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Note)
    private readonly noteRepo: Repository<Note>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<NotePermission | string>(
      NOTE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return true;
    }

    const rawUserId = user.id || user.userId;
    const userId = rawUserId !== undefined && rawUserId !== null ? String(rawUserId) : null;
    const employeeId = user.employeeId ? String(user.employeeId) : user.loginId || null;
    const userEmail = user.email || '';

    // Extract Note ID from params, body, query, or attachment key
    let noteId: number | null = null;
    if (request.params?.id && !isNaN(Number(request.params.id))) {
      noteId = Number(request.params.id);
    } else if (request.params?.noteId && !isNaN(Number(request.params.noteId))) {
      noteId = Number(request.params.noteId);
    } else if (request.body?.noteId && !isNaN(Number(request.body.noteId))) {
      noteId = Number(request.body.noteId);
    } else if (request.query?.noteId && !isNaN(Number(request.query.noteId))) {
      noteId = Number(request.query.noteId);
    } else if (request.params?.key) {
      // Attachment route: look up entityId from object_store
      const key = request.params.key;
      const doc = await this.documentRepo.findOne({
        where: [{ id: key }, { s3Key: key }],
      });
      if (doc && doc.entityId) {
        noteId = doc.entityId;
      }
    }

    if (!noteId) {
      return true;
    }

    const note = await this.noteRepo.findOne({ where: { id: noteId } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${noteId} not found`);
    }

    // Owner check: creator has full access
    const isOwner =
      (userId && note.userId === userId) ||
      (employeeId && note.employeeId === employeeId);

    if (isOwner) {
      return true;
    }

    // Shared Recipient check
    const recipient = await this.inboxRepo.findOne({
      where: [
        { notesId: noteId, employeeId: employeeId || '' },
        { notesId: noteId, toMail: userEmail || '' },
        { notesId: noteId, employeeId: userEmail || '' },
      ],
    });

    if (!recipient) {
      throw new ForbiddenException('You do not have access to this note');
    }

    // If CanEdit is required, verify recipient has CanEdit permission
    if (
      requiredPermission === NotePermission.CanEdit ||
      requiredPermission === 'CanEdit' ||
      requiredPermission === 'canEdit' ||
      requiredPermission === 'EDIT'
    ) {
      if (
        recipient.permission !== NotePermission.CanEdit &&
        (recipient.permission as any) !== 'CanEdit' &&
        (recipient.permission as any) !== 'canEdit'
      ) {
        throw new ForbiddenException('You only have view permission for this note');
      }
    }

    return true;
  }
}
