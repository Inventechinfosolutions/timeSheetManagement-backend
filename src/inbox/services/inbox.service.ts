import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Inbox } from '../entities/inbox.entity';
import { Note } from '../../notes/entities/note.entity';
import { NoteRecipient, NotePermission } from '../../notes/entities/note-recipient.entity';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { CreateInboxDto } from '../dto/create-inbox.dto';
import { SendNoteDto } from '../dto/send-note.dto';
import { QueryInboxDto } from '../dto/query-inbox.dto';
import { MailService } from '../../common/mail/mail.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { getNoteEmailTemplate } from '../../common/mail/email-templates';

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Note)
    private readonly noteRepo: Repository<Note>,
    @InjectRepository(NoteRecipient)
    private readonly noteRecipientRepo: Repository<NoteRecipient>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    private readonly mailService: MailService,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  /**
   * Create a single inbox record.
   */
  async createInboxEntry(dto: CreateInboxDto): Promise<Inbox> {
    const item = this.inboxRepo.create({
      employeeId: String(dto.employeeId),
      notesId: dto.notesId,
      fromMail: dto.fromMail,
      toMail: dto.toMail,
      isRead: dto.isRead || false,
    });
    return await this.inboxRepo.save(item);
  }

  /**
   * Share / Send a note to one or more recipient employees with granular VIEW / EDIT permissions.
   * Creates / Updates NoteRecipient records and Inbox delivery ledger entries.
   */
  async sendNote(dto: SendNoteDto, user: any): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const note = await this.noteRepo.findOne({ where: { id: dto.notesId } });
      if (!note) {
        throw new NotFoundException(`Note with ID ${dto.notesId} not found`);
      }

      const permission = dto.permission === 'CanEdit' ? NotePermission.CanEdit : NotePermission.CanView;

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
        // Match recipient by email or employeeId
        let targetEmployeeId = recipient;
        let targetEmail = recipient;

        const emp = await this.employeeRepo.findOne({
          where: [{ email: recipient }, { employeeId: recipient }],
        });

        if (emp) {
          targetEmployeeId = emp.employeeId || emp.email;
          targetEmail = emp.email || recipient;
        }

        // 1. Store / Update Note Recipient Permission
        try {
          const existingRecipient = await this.noteRecipientRepo.findOne({
            where: { noteId: note.id, employeeId: targetEmployeeId },
          });

          if (existingRecipient) {
            existingRecipient.permission = permission;
            await this.noteRecipientRepo.save(existingRecipient);
          } else {
            const newRecipient = this.noteRecipientRepo.create({
              noteId: note.id,
              employeeId: targetEmployeeId,
              permission,
            });
            await this.noteRecipientRepo.save(newRecipient);
          }
        } catch (nrErr: any) {
          this.logger.warn(`Could not save note_permission: ${nrErr.message}`);
        }

        // 2. Create Inbox record
        const inboxItem = this.inboxRepo.create({
          employeeId: targetEmployeeId,
          notesId: note.id,
          fromMail,
          toMail: targetEmail,
          isRead: false,
        });

        const saved = await this.inboxRepo.save(inboxItem);
        createdEntries.push(saved);

        // 3. Fetch note attachments for email
        let noteAttachments: Array<{ name: string; downloadUrl: string }> = [];
        try {
          const docs = await this.documentUploaderService.getAllDocs(
            EntityType.NOTE,
            note.id,
            ReferenceType.NOTE_ATTACHMENT,
            note.id,
          );
          if (docs && docs.length > 0) {
            noteAttachments = docs.map((d: any) => ({
              name: d.fileName || d.name || d.s3Key || 'Attachment',
              downloadUrl: `https://worksphere.inventech-developer.in/api/notes/attachments/${d.s3Key || d.id}/download`,
            }));
          }
        } catch (e: any) {
          this.logger.warn(`Could not fetch attachments for email: ${e.message}`);
        }

        // 4. Send email for BOTH CanView and CanEdit permissions
        //    CanView → "Open in Inbox" CTA
        //    CanEdit → "Open Portal to Edit" CTA
        const subject = dto.subject?.trim() || (
          permission === NotePermission.CanEdit
            ? `${senderName} gave you edit access to: "${note.title || 'WorkSphere Note'}"`
            : `${senderName} shared a note with you: "${note.title || 'WorkSphere Note'}"`
        );
        const previewText = note.description
          ? note.description.replace(/<[^>]*>?/gm, '').substring(0, 300)
          : permission === NotePermission.CanEdit
            ? 'You have been given edit access to a note in WorkSphere.'
            : 'You have received a note in your WorkSphere Inbox.';

        const emailHtml = getNoteEmailTemplate(
          note.title || 'WorkSphere Note',
          note.description || '',
          senderName,
          fromMail,
          permission,
          dto.customMessage,
          noteAttachments,
        );

        try {
          this.mailService.sendMailAsync(
            targetEmail,
            subject,
            previewText,
            emailHtml,
          );
          this.logger.log(`Email dispatched to ${targetEmail} with ${permission} permission`);
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

      const qb = this.inboxRepo
        .createQueryBuilder('inbox')
        .where('(inbox.employeeId = :employeeId OR inbox.toMail = :email)', {
          employeeId,
          email,
        });

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

      // Fetch permissions from note_recipients for this user
      const targetIds = Array.from(new Set([employeeId, email].filter(Boolean)));
      const recipientRecords = noteIds.length > 0 && targetIds.length > 0
        ? await this.noteRecipientRepo.find({
            where: {
              noteId: In(noteIds),
              employeeId: In(targetIds),
            },
          })
        : [];
      const permissionMap = new Map<number, string>();
      recipientRecords.forEach((r) => permissionMap.set(r.noteId, r.permission));

      // Fetch sender employee details by fromMail
      const senderEmails = Array.from(new Set(inboxItems.map((item) => item.fromMail).filter(Boolean)));
      const senders = senderEmails.length > 0 ? await this.employeeRepo.findBy({ email: In(senderEmails) }) : [];
      const sendersMap = new Map<string, EmployeeDetails>();
      senders.forEach((s) => sendersMap.set(s.email, s));

      // Assemble enriched response
      const results: any[] = [];

      for (const item of inboxItems) {
        const note = notesMap.get(item.notesId);
        const sender = sendersMap.get(item.fromMail);
        const permission = permissionMap.get(item.notesId) || 'CanView';

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

        const senderDisplayName = sender?.fullName || item.fromMail.split('@')[0] || 'Unknown Sender';

        // Apply search filter if specified
        if (query?.search && query.search.trim()) {
          const s = query.search.trim().toLowerCase();
          const matchesTitle = note?.title?.toLowerCase().includes(s);
          const matchesDesc = note?.description?.toLowerCase().includes(s);
          const matchesSender = senderDisplayName.toLowerCase().includes(s) || item.fromMail.toLowerCase().includes(s);
          if (!matchesTitle && !matchesDesc && !matchesSender) {
            continue;
          }
        }

        results.push({
          inboxId: Number(item.inboxId),
          employeeId: item.employeeId,
          notesId: item.notesId,
          fromMail: item.fromMail,
          toMail: item.toMail,
          permission,
          isRead: Boolean(item.isRead),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          senderName: senderDisplayName,
          senderDesignation: sender?.designation || '',
          senderDepartment: sender?.department || '',
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
   * Get unread message count for user sidebar badge.
   */
  async getUnreadCount(user: any): Promise<{ count: number }> {
    try {
      const { employeeId, email } = this.resolveUserIdentifiers(user);

      const count = await this.inboxRepo
        .createQueryBuilder('inbox')
        .where('(inbox.employeeId = :employeeId OR inbox.toMail = :email)', {
          employeeId,
          email,
        })
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
    const sender = await this.employeeRepo.findOne({ where: { email: item.fromMail } });

    // Lookup recipient permission
    const { employeeId, email } = this.resolveUserIdentifiers(user);
    const recipient = await this.noteRecipientRepo.findOne({
      where: [
        { noteId: item.notesId, employeeId: item.employeeId },
        { noteId: item.notesId, employeeId: employeeId },
        { noteId: item.notesId, employeeId: email },
      ],
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
      notesId: item.notesId,
      fromMail: item.fromMail,
      toMail: item.toMail,
      permission: recipient?.permission || 'CanView',
      isRead: Boolean(item.isRead),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      senderName: sender?.fullName || item.fromMail.split('@')[0] || 'Unknown Sender',
      senderDesignation: sender?.designation || '',
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
}
