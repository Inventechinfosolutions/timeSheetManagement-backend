import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Readable } from 'stream';
import { Inbox } from '../entities/inbox.entity';
import { Note } from '../../notes/entities/note.entity';
import { NotePermission } from '../../notes/enums/note-permission.enum';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { User } from '../../users/entities/user.entity';
import { CreateInboxDto } from '../dto/create-inbox.dto';
import { SendNoteDto } from '../dto/send-note.dto';
import { QueryInboxDto } from '../dto/query-inbox.dto';
import { MailService } from '../../common/mail/mail.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { getNoteEmailTemplate } from '../../common/mail/email-templates';

export function parseNotePermissions(
  val?: any,
  extra?: { canView?: boolean; canEdit?: boolean; canDelete?: boolean; permissions?: any },
): string {
  const result = new Set<NotePermission>();

  const addVal = (item: any) => {
    if (!item) return;
    const s = String(item).trim().toLowerCase();
    if (s.includes('delete') || s === '3') {
      result.add(NotePermission.CanDelete);
    }
    if (s.includes('edit') || s.includes('write') || s === '2') {
      result.add(NotePermission.CanEdit);
    }
    if (s.includes('view') || s.includes('read') || s === '1') {
      result.add(NotePermission.CanView);
    }
  };

  if (Array.isArray(val)) {
    val.forEach(addVal);
  } else if (typeof val === 'string' && val.includes(',')) {
    val.split(',').forEach(addVal);
  } else if (val) {
    addVal(val);
  }

  if (extra?.permissions) {
    if (Array.isArray(extra.permissions)) {
      extra.permissions.forEach(addVal);
    } else if (typeof extra.permissions === 'string') {
      extra.permissions.split(',').forEach(addVal);
    }
  }

  if (extra?.canDelete) result.add(NotePermission.CanDelete);
  if (extra?.canEdit) result.add(NotePermission.CanEdit);
  if (extra?.canView) result.add(NotePermission.CanView);

  // If nothing specified, default to CanView
  if (result.size === 0) {
    result.add(NotePermission.CanView);
  }

  const ordered: string[] = [];
  if (result.has(NotePermission.CanView)) ordered.push(NotePermission.CanView);
  if (result.has(NotePermission.CanEdit)) ordered.push(NotePermission.CanEdit);
  if (result.has(NotePermission.CanDelete)) ordered.push(NotePermission.CanDelete);

  return ordered.join(',');
}

export function hasNotePermission(
  assignedPermissions: string | undefined | null,
  target: NotePermission | string,
): boolean {
  if (!assignedPermissions) return target === NotePermission.CanView;
  const list = assignedPermissions.split(',').map((p) => p.trim().toLowerCase());
  const targetLower = String(target).trim().toLowerCase();
  return list.includes(targetLower);
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Note)
    private readonly noteRepo: Repository<Note>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
    private readonly documentUploaderService: DocumentUploaderService,
  ) { }

  /**
   * Create a single inbox record.
   */
  async createInboxEntry(dto: CreateInboxDto): Promise<Inbox> {
    const item = this.inboxRepo.create({
      employeeId: String(dto.employeeId),
      notesId: dto.notesId,
      permission: parseNotePermissions(dto.permission),
      fromMail: dto.fromMail,
      toMail: dto.toMail,
      isRead: dto.isRead || false,
      hasDocument: dto.hasDocument || false,
      hasDescription: dto.hasDescription !== undefined ? dto.hasDescription : true,
    });
    return await this.inboxRepo.save(item);
  }

  /**
   * Share / Send a note to one or more recipient employees with granular VIEW / EDIT permissions.
   * Creates / Updates Inbox delivery entries and assigned permissions.
   */
  async sendNote(dto: SendNoteDto, user: any): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const note = await this.noteRepo.findOne({ where: { id: dto.notesId } });
      if (!note) {
        throw new NotFoundException(`Note with ID ${dto.notesId} not found`);
      }

      const permission = parseNotePermissions(
        dto.permission || (dto as any).permissions,
        {
          canView: dto.canView,
          canEdit: dto.canEdit,
          canDelete: dto.canDelete,
          permissions: (dto as any).permissions,
        },
      );

      const hasDocument = dto.hasDocument !== undefined
        ? Boolean(dto.hasDocument)
        : (dto.includeFiles !== undefined ? Boolean(dto.includeFiles) : false);

      const hasDescription = dto.hasDescription !== undefined
        ? Boolean(dto.hasDescription)
        : (dto.includeDescription !== undefined ? Boolean(dto.includeDescription) : true);

      // Determine sender details
      const senderEmpId = user?.employeeId || user?.loginId || user?.aliasLoginName;
      let fromMail = user?.email || '';
      let senderName = user?.fullName || user?.aliasLoginName || user?.loginId || 'Colleague';

      if (!fromMail && senderEmpId) {
        const senderEmp = await this.employeeRepo.findOne({
          where: [{ employeeId: senderEmpId }, { email: senderEmpId }],
        });
        if (senderEmp) {
          fromMail = senderEmp.email || fromMail;
          senderName = senderEmp.fullName || senderName;
        }
      }

      if (!fromMail) {
        fromMail = 'noreply@timesheet.com';
      }

      const createdEntries: Inbox[] = [];
      const recipientList = Array.from(new Set(dto.recipients.map((r) => r.trim()).filter(Boolean)));

      if (recipientList.length === 0) {
        throw new BadRequestException('At least one valid recipient is required');
      }

      for (const recipient of recipientList) {
        // Resolve Employee ID from recipient (whether email, ID, or login was entered)
        const { employeeId: targetEmployeeId, email: targetEmail } =
          await this.resolveRecipientEmployee(recipient);

        // 1. Recipient record in INBOX folder
        const existingInbox = await this.inboxRepo.findOne({
          where: [
            { notesId: note.id, employeeId: targetEmployeeId, folder: 'INBOX' },
            { notesId: note.id, toMail: targetEmail, folder: 'INBOX' },
          ],
        });

        let saved: Inbox;
        if (existingInbox) {
          existingInbox.permission = permission;
          existingInbox.employeeId = targetEmployeeId;
          existingInbox.senderId = String(senderEmpId);
          existingInbox.receiverId = targetEmployeeId;
          existingInbox.folder = 'INBOX';
          existingInbox.fromMail = fromMail;
          existingInbox.toMail = targetEmail;
          existingInbox.isRead = false;
          existingInbox.hasDocument = hasDocument;
          existingInbox.hasDescription = hasDescription;
          saved = await this.inboxRepo.save(existingInbox);
        } else {
          const inboxItem = this.inboxRepo.create({
            employeeId: targetEmployeeId,
            senderId: String(senderEmpId),
            receiverId: targetEmployeeId,
            folder: 'INBOX',
            notesId: note.id,
            permission,
            fromMail,
            toMail: targetEmail,
            isRead: false,
            hasDocument,
            hasDescription,
          });
          saved = await this.inboxRepo.save(inboxItem);
        }
        createdEntries.push(saved);

        // 2. Sender record in SENT folder (independent copy for sender login, Gmail-style)
        // Storing senderId and receiverId; deleting in sender login does not affect recipient login
        const existingSent = await this.inboxRepo.findOne({
          where: {
            notesId: note.id,
            employeeId: String(senderEmpId),
            receiverId: targetEmployeeId,
            folder: 'SENT',
          },
        });

        if (existingSent) {
          existingSent.permission = permission;
          existingSent.senderId = String(senderEmpId);
          existingSent.receiverId = targetEmployeeId;
          existingSent.fromMail = fromMail;
          existingSent.toMail = targetEmail;
          existingSent.isRead = true;
          existingSent.hasDocument = hasDocument;
          existingSent.hasDescription = hasDescription;
          await this.inboxRepo.save(existingSent);
        } else {
          const sentItem = this.inboxRepo.create({
            employeeId: String(senderEmpId),
            senderId: String(senderEmpId),
            receiverId: targetEmployeeId,
            folder: 'SENT',
            notesId: note.id,
            permission,
            fromMail,
            toMail: targetEmail,
            isRead: true,
            hasDocument,
            hasDescription,
          });
          await this.inboxRepo.save(sentItem);
        }

        // 3. Fetch note attachments for email template display AND direct Outlook file attachments
        let noteAttachments: Array<{ name: string; downloadUrl: string }> = [];
        let emailAttachments: Array<{ filename: string; content: string; encoding: string; contentType?: string }> = [];

        if (hasDocument) {
          try {
            const docs = await this.documentUploaderService.getAllDocs(
              EntityType.NOTE,
              note.id,
              ReferenceType.NOTE_ATTACHMENT,
              note.id,
            );
            if (docs && docs.length > 0) {
              const selectedKeys = dto.attachmentKeys && dto.attachmentKeys.length > 0 ? dto.attachmentKeys : null;
              for (const d of docs) {
                const fileKey = (d as any).key || (d as any).s3Key || (d as any).id;
                const fileName = (d as any).name || (d as any).fileName || 'Attachment';
                if (fileKey) {
                  if (!selectedKeys || selectedKeys.includes(fileKey) || selectedKeys.includes(String((d as any).id))) {
                    noteAttachments.push({
                      name: fileName,
                      downloadUrl: `https://worksphere.inventech-developer.in/api/notes/attachments/${fileKey}/download`,
                    });

                    // Download attachment stream to attach directly into email for Outlook
                    try {
                      const dataStream = await this.documentUploaderService.downloadFile(fileKey);
                      if (dataStream && dataStream.Body) {
                        let buf: Buffer;
                        if (dataStream.Body instanceof Readable) {
                          const chunks: any[] = [];
                          for await (const chunk of dataStream.Body) {
                            chunks.push(chunk);
                          }
                          buf = Buffer.concat(chunks);
                        } else if (typeof (dataStream.Body as any).transformToByteArray === 'function') {
                          const bytes = await (dataStream.Body as any).transformToByteArray();
                          buf = Buffer.from(bytes);
                        } else {
                          buf = Buffer.from(dataStream.Body as any);
                        }
                        if (buf && buf.length > 0) {
                          emailAttachments.push({
                            filename: fileName,
                            content: buf.toString('base64'),
                            encoding: 'base64',
                            contentType: (d as any).mimetype || (d as any).mimeType || 'application/octet-stream',
                          });
                        }
                      }
                    } catch (readErr: any) {
                      this.logger.warn(`Could not read attachment ${fileKey} for direct email attach: ${readErr.message}`);
                    }
                  }
                }
              }
            }
          } catch (e: any) {
            this.logger.warn(`Could not fetch attachments for email: ${e.message}`);
          }
        }

        // 4. Send email for BOTH CanView and CanEdit permissions
        const subject = dto.subject?.trim() || (
          permission === NotePermission.CanEdit
            ? `${senderName} gave you edit access to: "${note.title || 'WorkSphere Note'}"`
            : `${senderName} shared a note with you: "${note.title || 'WorkSphere Note'}"`
        );
        const previewText = hasDescription && note.description
          ? note.description.replace(/<[^>]*>?/gm, '').substring(0, 300)
          : permission === NotePermission.CanEdit
            ? 'You have been given edit access to a note in WorkSphere.'
            : 'You have received a note in your WorkSphere Inbox.';

        const emailHtml = getNoteEmailTemplate(
          note.title || 'WorkSphere Note',
          hasDescription ? (note.description || '') : '',
          senderName,
          fromMail,
          permission,
          dto.customMessage,
          noteAttachments,
          { hasDescription, hasDocument },
        );

        try {
          // Send with physical file attachments so Outlook users can open/download directly
          this.mailService.sendMailAsync(
            targetEmail,
            subject,
            previewText,
            emailHtml,
            undefined,
            undefined,
            emailAttachments.length > 0 ? emailAttachments : undefined,
          );
          this.logger.log(`Email dispatched to ${targetEmail} (employeeId: ${targetEmployeeId}) with ${permission} permission (hasDocument: ${hasDocument}, hasDescription: ${hasDescription}, attachments: ${emailAttachments.length})`);
        } catch (err: any) {
          this.logger.warn(`Could not dispatch email to ${targetEmail}: ${err.message}`);
        }
      }

      return {
        success: true,
        count: createdEntries.length,
        message: `Note successfully sent with ${permission} permission to ${createdEntries.length} recipient(s)`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send note: ${error.message}`, error.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message || 'Failed to send note');
    }
  }

  /**
   * Get inbox messages for the currently logged-in user, joined with note_recipients permissions.
   */
  async getInbox(user: any, query?: QueryInboxDto): Promise<any[]> {
    try {
      const { employeeId, email } = this.resolveUserIdentifiers(user);
      const folder = (query?.folder || 'INBOX').toUpperCase();

      const qb = this.inboxRepo.createQueryBuilder('inbox');

      if (folder === 'SENT') {
        qb.where('inbox.folder = :folder', { folder: 'SENT' })
          .andWhere(
            '(inbox.employeeId = :employeeId OR inbox.senderId = :employeeId OR inbox.fromMail = :email)',
            { employeeId, email },
          );
      } else {
        // Default: INBOX (received mail)
        qb.where('(inbox.folder = :folder OR inbox.folder IS NULL)', { folder: 'INBOX' })
          .andWhere(
            '(inbox.employeeId = :employeeId OR inbox.receiverId = :employeeId OR inbox.toMail = :email)',
            { employeeId, email },
          );
      }

      if (query?.isRead !== undefined) {
        qb.andWhere('inbox.isRead = :isRead', { isRead: query.isRead });
      }

      qb.orderBy('inbox.createdAt', 'DESC');

      const inboxItems = await qb.getMany();
      if (inboxItems.length === 0) {
        return [];
      }

      // Fetch related notes
      const noteIds = Array.from(new Set(inboxItems.map((item) => item.notesId)));
      const notes = noteIds.length > 0 ? await this.noteRepo.findBy({ id: In(noteIds) }) : [];
      const notesMap = new Map<number, Note>();
      notes.forEach((n) => notesMap.set(n.id, n));

      // Fetch sender employee details by fromMail or senderId
      const senderEmails = Array.from(new Set(inboxItems.map((item) => item.fromMail).filter(Boolean)));
      const senderIds = Array.from(new Set(inboxItems.map((item) => item.senderId).filter(Boolean))) as string[];
      const senderWhere: any[] = [];
      if (senderEmails.length > 0) senderWhere.push({ email: In(senderEmails) });
      if (senderIds.length > 0) senderWhere.push({ employeeId: In(senderIds) });
      const senders = senderWhere.length > 0 ? await this.employeeRepo.find({ where: senderWhere }) : [];
      const sendersMap = new Map<string, EmployeeDetails>();
      senders.forEach((s) => {
        if (s.email) sendersMap.set(s.email.toLowerCase(), s);
        if (s.employeeId) sendersMap.set(s.employeeId.toLowerCase(), s);
      });

      // Fetch receiver employee details by toMail or receiverId
      const receiverEmails = Array.from(new Set(inboxItems.map((item) => item.toMail).filter(Boolean)));
      const receiverIds = Array.from(new Set(inboxItems.map((item) => item.receiverId).filter(Boolean))) as string[];
      const receiverWhere: any[] = [];
      if (receiverEmails.length > 0) receiverWhere.push({ email: In(receiverEmails) });
      if (receiverIds.length > 0) receiverWhere.push({ employeeId: In(receiverIds) });
      const receivers = receiverWhere.length > 0 ? await this.employeeRepo.find({ where: receiverWhere }) : [];
      const receiversMap = new Map<string, EmployeeDetails>();
      receivers.forEach((r) => {
        if (r.email) receiversMap.set(r.email.toLowerCase(), r);
        if (r.employeeId) receiversMap.set(r.employeeId.toLowerCase(), r);
      });

      // Assemble enriched response
      const results: any[] = [];

      for (const item of inboxItems) {
        const note = notesMap.get(item.notesId);
        const sender =
          sendersMap.get(item.fromMail?.toLowerCase()) ||
          sendersMap.get(item.senderId?.toLowerCase() || '');
        const senderDisplayName =
          sender?.fullName || item.fromMail?.split('@')[0] || item.senderId || 'Unknown Sender';

        const receiver =
          receiversMap.get(item.toMail?.toLowerCase()) ||
          receiversMap.get(item.receiverId?.toLowerCase() || '');
        const receiverDisplayName =
          receiver?.fullName || item.toMail?.split('@')[0] || item.receiverId || 'Recipient';

        const permission = item.permission || 'CanView';

        // Fetch attachments for this note
        let attachments: any[] = [];
        if (note) {
          try {
            attachments = await this.documentUploaderService.getAllDocs(
              EntityType.NOTE,
              note.id,
              ReferenceType.NOTE_ATTACHMENT,
              note.id,
            );
          } catch (e: any) {
            this.logger.warn(`Could not fetch attachments for note ${note.id}: ${e.message}`);
          }
        }

        // Apply search filter if specified
        if (query?.search && query.search.trim()) {
          const s = query.search.trim().toLowerCase();
          const matchesTitle = note?.title?.toLowerCase().includes(s);
          const matchesDesc = note?.description?.toLowerCase().includes(s);
          const matchesSender =
            senderDisplayName.toLowerCase().includes(s) || item.fromMail?.toLowerCase().includes(s);
          const matchesReceiver =
            receiverDisplayName.toLowerCase().includes(s) || item.toMail?.toLowerCase().includes(s);
          if (!matchesTitle && !matchesDesc && !matchesSender && !matchesReceiver) {
            continue;
          }
        }

        results.push({
          inboxId: Number(item.inboxId),
          employeeId: item.employeeId,
          senderId: item.senderId,
          receiverId: item.receiverId,
          folder: item.folder || 'INBOX',
          notesId: item.notesId,
          fromMail: item.fromMail,
          toMail: item.toMail,
          permission,
          isRead: Boolean(item.isRead),
          hasDocument: Boolean(item.hasDocument),
          hasDescription: item.hasDescription !== undefined ? Boolean(item.hasDescription) : true,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          senderName: senderDisplayName,
          senderDesignation: sender?.designation || '',
          senderDepartment: sender?.department || '',
          receiverName: receiverDisplayName,
          receiverDesignation: receiver?.designation || '',
          receiverDepartment: receiver?.department || '',
          note: note
            ? {
              id: note.id,
              title: note.title,
              description: item.hasDescription !== false ? note.description : '',
              type: note.type,
              projectName: note.projectName,
              color: note.color,
              isPinned: note.isPinned,
              createdAt: note.createdAt,
              attachments: item.hasDocument ? (attachments || []) : [],
            }
            : null,
        });
      }

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to get user inbox: ${error.message}`, error.stack);
      throw new InternalServerErrorException(error.message || 'Failed to get inbox');
    }
  }

  /**
   * Get inbox messages explicitly by employee ID.
   */
  async getInboxByEmployeeId(employeeId: string, query?: QueryInboxDto): Promise<any[]> {
    return await this.getInbox({ employeeId }, query);
  }

  /**
   * Get unread message count for user sidebar badge (INBOX only).
   */
  async getUnreadCount(user: any): Promise<{ count: number }> {
    try {
      const { employeeId, email } = this.resolveUserIdentifiers(user);

      const count = await this.inboxRepo
        .createQueryBuilder('inbox')
        .where('(inbox.employeeId = :employeeId OR inbox.receiverId = :employeeId OR inbox.toMail = :email)', {
          employeeId,
          email,
        })
        .andWhere('(inbox.folder = :folder OR inbox.folder IS NULL)', { folder: 'INBOX' })
        .andWhere('inbox.isRead = false')
        .getCount();

      return { count };
    } catch (error: any) {
      this.logger.error(`Failed to get unread count: ${error.message}`, error.stack);
      return { count: 0 };
    }
  }

  /**
   * Get single inbox item and optionally mark it as read.
   */
  async getInboxItem(inboxId: number, user: any): Promise<any> {
    const item = await this.inboxRepo.findOne({ where: { inboxId } });
    if (!item) {
      throw new NotFoundException(`Inbox message with ID ${inboxId} not found`);
    }

    // Auto mark as read on view
    if (!item.isRead) {
      item.isRead = true;
      await this.inboxRepo.save(item);
    }

    const note = await this.noteRepo.findOne({ where: { id: item.notesId } });
    const sender = await this.employeeRepo.findOne({
      where: [{ email: item.fromMail }, { employeeId: item.senderId || '' }],
    });
    const receiver = await this.employeeRepo.findOne({
      where: [{ email: item.toMail }, { employeeId: item.receiverId || '' }],
    });

    let attachments: any[] = [];
    if (note) {
      try {
        attachments = await this.documentUploaderService.getAllDocs(
          EntityType.NOTE,
          note.id,
          ReferenceType.NOTE_ATTACHMENT,
          note.id,
        );
      } catch (e: any) {
        this.logger.warn(`Could not load attachments for note ${note.id}: ${e.message}`);
      }
    }

    return {
      inboxId: Number(item.inboxId),
      employeeId: item.employeeId,
      senderId: item.senderId,
      receiverId: item.receiverId,
      folder: item.folder || 'INBOX',
      notesId: item.notesId,
      fromMail: item.fromMail,
      toMail: item.toMail,
      permission: item.permission || 'CanView',
      isRead: Boolean(item.isRead),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      senderName: sender?.fullName || item.fromMail?.split('@')[0] || item.senderId || 'Unknown Sender',
      senderDesignation: sender?.designation || '',
      receiverName: receiver?.fullName || item.toMail?.split('@')[0] || item.receiverId || 'Recipient',
      receiverDesignation: receiver?.designation || '',
      note: note
        ? {
          id: note.id,
          title: note.title,
          description: note.description,
          type: note.type,
          projectName: note.projectName,
          color: note.color,
          isPinned: note.isPinned,
          createdAt: note.createdAt,
          attachments: attachments || [],
        }
        : null,
    };
  }

  /**
   * Mark a specific inbox message as read.
   */
  async markAsRead(inboxId: number, user: any): Promise<{ success: boolean; inboxId: number; isRead: boolean }> {
    const item = await this.inboxRepo.findOne({ where: { inboxId } });
    if (!item) {
      throw new NotFoundException(`Inbox message with ID ${inboxId} not found`);
    }

    item.isRead = true;
    await this.inboxRepo.save(item);

    return {
      success: true,
      inboxId,
      isRead: true,
    };
  }

  /**
   * Mark all unread messages for the user as read.
   */
  async markAllAsRead(user: any): Promise<{ success: boolean; message: string }> {
    const { employeeId, email } = this.resolveUserIdentifiers(user);

    await this.inboxRepo
      .createQueryBuilder()
      .update(Inbox)
      .set({ isRead: true })
      .where('(employee_id = :employeeId OR to_mail = :email)', { employeeId, email })
      .andWhere('is_read = false')
      .execute();

    return {
      success: true,
      message: 'All messages marked as read',
    };
  }

  /**
   * Delete an inbox message.
   */
  async deleteInboxItem(inboxId: number, user: any): Promise<{ success: boolean; message: string }> {
    const item = await this.inboxRepo.findOne({ where: { inboxId } });
    if (!item) {
      throw new NotFoundException(`Inbox message with ID ${inboxId} not found`);
    }

    await this.inboxRepo.delete(inboxId);
    return {
      success: true,
      message: 'Inbox message deleted successfully',
    };
  }

  /**
   * Helper to extract standardized user identifiers.
   */
  private resolveUserIdentifiers(user: any): { employeeId: string; email: string } {
    const employeeId = user?.employeeId
      ? String(user.employeeId)
      : user?.loginId || user?.aliasLoginName || '';
    const email = user?.email || user?.loginId || '';
    return { employeeId, email };
  }

  /**
   * Resolve any recipient input (Employee ID, email, loginId, or username)
   * into a guaranteed Employee ID and their associated email address.
   */
  async resolveRecipientEmployee(recipient: string): Promise<{ employeeId: string; email: string }> {
    const trimmed = (recipient || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Recipient cannot be empty');
    }

    // 1. Direct match by employeeId in employee_details (exact or case-insensitive)
    const empById = await this.employeeRepo
      .createQueryBuilder('emp')
      .where('LOWER(emp.employeeId) = LOWER(:id)', { id: trimmed })
      .getOne();

    if (empById && empById.employeeId) {
      return {
        employeeId: empById.employeeId,
        email: empById.email || (trimmed.includes('@') ? trimmed : ''),
      };
    }

    // 2. Direct match by email in employee_details
    const empByEmail = await this.employeeRepo
      .createQueryBuilder('emp')
      .where('LOWER(emp.email) = LOWER(:email)', { email: trimmed })
      .getOne();

    if (empByEmail && empByEmail.employeeId) {
      return {
        employeeId: empByEmail.employeeId,
        email: trimmed,
      };
    }

    // 3. Match in users table by loginId
    const userByLogin = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.loginId) = LOWER(:login)', { login: trimmed })
      .getOne();

    if (userByLogin && userByLogin.loginId) {
      const linkedEmp = await this.employeeRepo.findOne({
        where: { employeeId: userByLogin.loginId },
      });
      return {
        employeeId: userByLogin.loginId,
        email: linkedEmp?.email || (trimmed.includes('@') ? trimmed : ''),
      };
    }

    // 4. If an email address was passed, perform intelligent match by name or prefix
    if (trimmed.includes('@')) {
      const userPart = trimmed.split('@')[0];
      const cleanParts = userPart.split(/[._\-\s]+/).filter((p) => p.length >= 3);

      for (const part of cleanParts) {
        const fuzzyEmp = await this.employeeRepo
          .createQueryBuilder('emp')
          .where('LOWER(emp.fullName) LIKE LOWER(:part)', { part: `%${part}%` })
          .orWhere('LOWER(emp.employeeId) LIKE LOWER(:part)', { part: `%${part}%` })
          .getOne();

        if (fuzzyEmp && fuzzyEmp.employeeId) {
          return {
            employeeId: fuzzyEmp.employeeId,
            email: trimmed,
          };
        }

        const fuzzyUser = await this.userRepo
          .createQueryBuilder('u')
          .where('LOWER(u.aliasLoginName) LIKE LOWER(:part)', { part: `%${part}%` })
          .orWhere('LOWER(u.loginId) LIKE LOWER(:part)', { part: `%${part}%` })
          .getOne();

        if (fuzzyUser && fuzzyUser.loginId) {
          return {
            employeeId: fuzzyUser.loginId,
            email: trimmed,
          };
        }
      }
    }

    // 5. If it does not contain '@', it is already an employee ID format:
    if (!trimmed.includes('@')) {
      return {
        employeeId: trimmed,
        email: '',
      };
    }

    // 6. Fallback: match by alphabetical first name from email
    const firstName = trimmed.split('@')[0].replace(/[^a-zA-Z]/g, '');
    if (firstName.length >= 3) {
      const nameEmp = await this.employeeRepo
        .createQueryBuilder('emp')
        .where('LOWER(emp.fullName) LIKE LOWER(:name)', { name: `%${firstName}%` })
        .getOne();
      if (nameEmp && nameEmp.employeeId) {
        return {
          employeeId: nameEmp.employeeId,
          email: trimmed,
        };
      }
    }

    // If still cannot resolve, fallback to trimmed
    this.logger.warn(`Could not resolve Employee ID for recipient: ${trimmed}`);
    return {
      employeeId: trimmed,
      email: trimmed,
    };
  }

  /**
   * Update permission for an inbox record
   */
  async updatePermission(inboxId: number, permission: string, user: any): Promise<Inbox> {
    const item = await this.inboxRepo.findOne({ where: { inboxId } });
    if (!item) {
      throw new NotFoundException(`Inbox record with ID ${inboxId} not found`);
    }
    item.permission = parseNotePermissions(permission);
    return await this.inboxRepo.save(item);
  }
}
