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

function parseNotePermission(val?: any): NotePermission {
  if (!val) return NotePermission.CanView;
  const s = String(val).trim().toLowerCase();
  if (
    s === 'canedit' ||
    s === 'edit' ||
    s === '2' ||
    s === 'can_edit' ||
    s === 'write' ||
    s === 'canwrite'
  ) {
    return NotePermission.CanEdit;
  }
  return NotePermission.CanView;
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
  ) {}

  /**
   * Create a single inbox record.
   */
  async createInboxEntry(dto: CreateInboxDto): Promise<Inbox> {
    const item = this.inboxRepo.create({
      employeeId: String(dto.employeeId),
      notesId: dto.notesId,
      permission: parseNotePermission(dto.permission),
      fromMail: dto.fromMail,
      toMail: dto.toMail,
      isRead: dto.isRead || false,
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

      const permission = parseNotePermission(
        dto.permission || (dto as any).canEdit || (dto as any).accessPermission || (dto as any).permissionType,
      );

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

        // Check if an inbox record already exists for this note and employee
        const existingInbox = await this.inboxRepo.findOne({
          where: [
            { notesId: note.id, employeeId: targetEmployeeId },
            { notesId: note.id, toMail: targetEmail },
          ],
        });

        let saved: Inbox;
        if (existingInbox) {
          existingInbox.permission = permission;
          existingInbox.employeeId = targetEmployeeId;
          existingInbox.fromMail = fromMail;
          existingInbox.toMail = targetEmail;
          existingInbox.isRead = false;
          saved = await this.inboxRepo.save(existingInbox);
        } else {
          const inboxItem = this.inboxRepo.create({
            employeeId: targetEmployeeId,
            notesId: note.id,
            permission,
            fromMail,
            toMail: targetEmail,
            isRead: false,
          });
          saved = await this.inboxRepo.save(inboxItem);
        }
        createdEntries.push(saved);

        // 3. Fetch note attachments for email and nodemailer attachment payload
        let noteAttachments: Array<{ name: string; downloadUrl: string }> = [];
        let emailAttachments: Array<{ filename: string; content: string; encoding: string }> = [];
        try {
          const docs = await this.documentUploaderService.getAllDocs(
            EntityType.NOTE,
            note.id,
            ReferenceType.NOTE_ATTACHMENT,
            note.id,
          );
          if (docs && docs.length > 0) {
            for (const d of docs) {
              const fileKey = (d as any).key || (d as any).s3Key || (d as any).id;
              const fileName = (d as any).name || (d as any).fileName || 'Attachment';
              if (fileKey) {
                noteAttachments.push({
                  name: fileName,
                  downloadUrl: `https://worksphere.inventech-developer.in/api/notes/attachments/${fileKey}/download`,
                });
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
                      });
                    }
                  }
                } catch (readErr: any) {
                  this.logger.warn(`Could not read attachment ${fileKey} for direct email attach: ${readErr.message}`);
                }
              }
            }
          }
        } catch (e: any) {
          this.logger.warn(`Could not fetch attachments for email: ${e.message}`);
        }

        // 4. Send email for BOTH CanView and CanEdit permissions
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
            undefined,
            undefined,
            emailAttachments.length > 0 ? emailAttachments : undefined,
          );
          this.logger.log(`Email dispatched to ${targetEmail} (employeeId: ${targetEmployeeId}) with ${permission} permission`);
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
      permission: item.permission || 'CanView',
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
    item.permission = parseNotePermission(permission);
    return await this.inboxRepo.save(item);
  }
}
