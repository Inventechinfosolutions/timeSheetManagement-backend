import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from '../entities/note.entity';
import { NotePermission } from '../enums/note-permission.enum';
import { Inbox } from '../../inbox/entities/inbox.entity';
import { CreateNoteDto } from '../dto/create-note.dto';
import { UpdateNoteDto } from '../dto/update-note.dto';
import { CreateSubNoteDto } from '../dto/create-sub-note.dto';
import { QueryNotesDto } from '../dto/query-notes.dto';
import { NoteType } from '../enums/note-type.enum';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import {
  DocumentMetaInfo,
  EntityType,
  ReferenceType,
} from '../../common/document-uploader/models/documentmetainfo.model';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import dayjs from 'dayjs';
import PDFDocument from 'pdfkit';

interface UserContext {
  userId: string | null;
  employeeId: string | null;
  createdBy: string;
}

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    @InjectRepository(Note)
    private readonly noteRepo: Repository<Note>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly configService: ConfigService,
  ) {}

  // =========================================================================
  // Note CRUD Operations
  // =========================================================================

  /**
   * Create a new parent note with optional batch sub-notes and file attachments.
   */
  async createNote(
    createDto: CreateNoteDto,
    files: Express.Multer.File[] = [],
    user: any,
  ): Promise<Note> {
    try {
      const userInfo = this.extractUserInfo(user);
      const type = createDto.type || NoteType.PERSONAL;
      const projectName =
        type === NoteType.PROJECT ? createDto.projectName || 'General Project' : null;
      const note = this.noteRepo.create({
        title: createDto.title?.trim(),
        description: createDto.description?.trim() || '',
        type,
        projectName,
        parentId: createDto.parentId || null,
        color: createDto.color || '#4318FF',
        isPinned: createDto.isPinned || false,
        autoSave:
          createDto.autoSave !== undefined
            ? createDto.autoSave
            : ((createDto as any).isAutoSave !== undefined
              ? (createDto as any).isAutoSave
              : true),
        userId: userInfo.userId,
        employeeId: userInfo.employeeId,
        createdBy: userInfo.createdBy,
        updatedBy: userInfo.createdBy,
      });

      const savedNote = await this.noteRepo.save(note);

      // Handle sub-notes batch creation if provided
      if (createDto.subNotes && createDto.subNotes.length > 0) {
        await this.createSubNotesBatch(
          savedNote.id,
          createDto.subNotes,
          type,
          projectName,
          userInfo,
        );
      }

      // Link pre-uploaded attachments (e.g., from drag & drop)
      if (createDto.attachmentKeys && createDto.attachmentKeys.length > 0) {
        await this.linkAttachmentKeys(savedNote.id, createDto.attachmentKeys);
      }

      // Upload newly submitted file attachments directly to object_store
      if (files && files.length > 0) {
        await this.uploadFilesToObjectStore(savedNote.id, files);
      }

      return await this.findOne(savedNote.id, user);
    } catch (error) {
      this.logger.error(`Failed to create note: ${error.message}`, error.stack);
      throw new InternalServerErrorException(error.message || 'Failed to create note');
    }
  }

  /**
   * Retrieve all root notes with nested sub-notes and attachments according to query filters.
   */
  async findAll(query: QueryNotesDto, user: any): Promise<{ data: Note[]; total: number }> {
    try {
      const { userId, employeeId } = this.extractUserInfo(user);

      const qb = this.noteRepo
        .createQueryBuilder('note')
        .leftJoinAndSelect('note.subNotes', 'subNote')
        .leftJoinAndSelect('subNote.subNotes', 'nestedSubNote')
        .where('note.parentId IS NULL');

      // Scoping: users see their personal notes and project notes
      if (userId || employeeId) {
        qb.andWhere(
          '(note.userId = :userId OR note.employeeId = :employeeId OR (note.type = :projectType AND note.employeeId = :employeeId))',
          {
            userId,
            employeeId,
            projectType: NoteType.PROJECT,
          },
        );
      }

      // Filter by type (PERSONAL vs PROJECT)
      if (query.type) {
        qb.andWhere('note.type = :type', { type: query.type });
      }

      // Filter by project name
      if (query.projectName && query.projectName.trim()) {
        qb.andWhere('LOWER(note.projectName) = LOWER(:projectName)', {
          projectName: query.projectName.trim(),
        });
      }

      // Filter by pinned status
      if (query.isPinned !== undefined) {
        qb.andWhere('note.isPinned = :isPinned', { isPinned: query.isPinned });
      }

      // Filter by archived status
      if (query.isArchived !== undefined) {
        qb.andWhere('note.isArchived = :isArchived', { isArchived: query.isArchived });
      } else {
        qb.andWhere('note.isArchived = false');
      }

      // Keyword search across title, description, projectName, and sub-notes
      if (query.search && query.search.trim()) {
        const searchVal = `%${query.search.trim().toLowerCase()}%`;
        qb.andWhere(
          '(LOWER(note.title) LIKE :searchVal OR LOWER(note.description) LIKE :searchVal OR LOWER(note.projectName) LIKE :searchVal OR LOWER(subNote.title) LIKE :searchVal OR LOWER(subNote.description) LIKE :searchVal)',
          { searchVal },
        );
      }

      // Sort: pinned first, newest updated, and sub-notes in order
      qb.orderBy('note.isPinned', 'DESC')
        .addOrderBy('note.updatedAt', 'DESC')
        .addOrderBy('subNote.orderIndex', 'ASC')
        .addOrderBy('subNote.createdAt', 'ASC');

      const [data, total] = await qb.getManyAndCount();

      // Populate document attachments from object_store
      await this.populateAttachments(data);

      return { data, total };
    } catch (error) {
      this.logger.error(`Failed to fetch notes: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch notes');
    }
  }

  /**
   * Find a single note by ID with its sub-notes, parent relation, and attachments.
   */
  async findOne(id: number, user?: any): Promise<Note> {
    try {
      const note = await this.noteRepo
        .createQueryBuilder('note')
        .leftJoinAndSelect('note.subNotes', 'subNote')
        .leftJoinAndSelect('subNote.subNotes', 'nestedSubNote')
        .leftJoinAndSelect('note.parent', 'parent')
        .where('note.id = :id', { id })
        .orderBy('subNote.orderIndex', 'ASC')
        .addOrderBy('subNote.createdAt', 'ASC')
        .getOne();

      if (!note) {
        throw new NotFoundException(`Note with ID ${id} not found`);
      }

      await this.populateAttachments([note]);

      if (user) {
        const { userId, employeeId } = this.extractUserInfo(user);
        const isOwner =
          (userId && note.userId === userId) ||
          (employeeId && note.employeeId === employeeId);
        if (isOwner) {
          (note as any).permission = `${NotePermission.CanView},${NotePermission.CanEdit},${NotePermission.CanDelete}`;
          (note as any).userPermission = (note as any).permission;
          (note as any).isOwner = true;
          (note as any).canView = true;
          (note as any).canEdit = true;
          (note as any).canDelete = true;
        } else {
          const recipient = await this.inboxRepo.findOne({
            where: [
              { notesId: note.id, employeeId: employeeId || '' },
              { notesId: note.id, toMail: user.email || '' },
              { notesId: note.id, employeeId: user.email || '' },
            ],
          });
          const perms = recipient?.permission || NotePermission.CanView;
          const permsLower = perms.toLowerCase();
          (note as any).permission = perms;
          (note as any).userPermission = perms;
          (note as any).isOwner = false;
          (note as any).canView = true;
          (note as any).canEdit = permsLower.includes('edit');
          (note as any).canDelete = permsLower.includes('delete');
        }
      }

      return note;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to find note ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve note');
    }
  }

  /**
   * Update an existing note's metadata or properties.
   */
  async updateNote(id: number, updateDto: UpdateNoteDto, user: any): Promise<Note> {
    try {
      const { userId, employeeId, createdBy } = this.extractUserInfo(user);
      const note = await this.noteRepo.findOne({ where: { id } });

      if (!note) {
        throw new NotFoundException(`Note with ID ${id} not found`);
      }

      // Check permission: Owner or NoteRecipient with EDIT permission
      const isOwner =
        (userId && note.userId === userId) ||
        (employeeId && note.employeeId === employeeId);

      if (!isOwner) {
        const recipient = await this.inboxRepo.findOne({
          where: [
            { notesId: id, employeeId: employeeId || '' },
            { notesId: id, toMail: user?.email || '' },
            { notesId: id, employeeId: user?.email || '' },
          ],
        });

        if (!recipient) {
          throw new ForbiddenException('You do not have access to edit this note');
        }

        const perms = (recipient.permission || '').toLowerCase();
        if (!perms.includes('canedit') && !perms.includes('edit')) {
          throw new ForbiddenException('You do not have edit permission for this note');
        }
      }

      if (updateDto.title !== undefined) note.title = updateDto.title;
      if (updateDto.description !== undefined) note.description = updateDto.description;
      if (updateDto.type !== undefined) note.type = updateDto.type;
      if (updateDto.projectName !== undefined) {
        note.projectName = note.type === NoteType.PROJECT ? updateDto.projectName : null;
      }
      if (updateDto.color !== undefined) note.color = updateDto.color;
      if (updateDto.isPinned !== undefined) note.isPinned = updateDto.isPinned;
      if (updateDto.isArchived !== undefined) note.isArchived = updateDto.isArchived;
      if (updateDto.autoSave !== undefined) note.autoSave = updateDto.autoSave;
      else if (updateDto.isAutoSave !== undefined) note.autoSave = updateDto.isAutoSave;
      if (updateDto.orderIndex !== undefined) note.orderIndex = updateDto.orderIndex;

      note.updatedBy = createdBy;

      await this.noteRepo.save(note);
      return await this.findOne(id, user);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;
      this.logger.error(`Failed to update note ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update note');
    }
  }

  /**
   * Update auto-save setting for a note.
   */
  async updateAutoSave(id: number, autoSave: boolean, user: any): Promise<Note> {
    const { userId, employeeId, createdBy } = this.extractUserInfo(user);
    const note = await this.noteRepo.findOne({ where: { id } });

    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found`);
    }

    const isOwner =
      (userId && note.userId === userId) ||
      (employeeId && note.employeeId === employeeId);

    if (!isOwner) {
      const recipient = await this.inboxRepo.findOne({
        where: [
          { notesId: id, employeeId: employeeId || '' },
          { notesId: id, toMail: user?.email || '' },
          { notesId: id, employeeId: user?.email || '' },
        ],
      });

      if (!recipient || (recipient.permission !== NotePermission.CanEdit && (recipient.permission as any) !== 'CanEdit')) {
        throw new ForbiddenException('You need edit permission to change auto-save settings');
      }
    }

    note.autoSave = autoSave;
    note.updatedBy = createdBy;
    await this.noteRepo.save(note);
    return await this.findOne(id, user);
  }

  /**
   * Delete a note along with its sub-notes and cleanup all associated attachments in object_store.
   */
  async removeNote(id: number, user: any): Promise<{ message: string }> {
    try {
      const { userId, employeeId } = this.extractUserInfo(user);
      const note = await this.noteRepo.findOne({
        where: { id },
        relations: ['subNotes'],
      });

      if (!note) {
        throw new NotFoundException(`Note with ID ${id} not found`);
      }

      // Check permission: Owner or NoteRecipient with CanEdit permission
      const isOwner =
        (userId && note.userId === userId) ||
        (employeeId && note.employeeId === employeeId);

      if (!isOwner) {
        const recipient = await this.inboxRepo.findOne({
          where: [
            { notesId: id, employeeId: employeeId || '' },
            { notesId: id, toMail: user?.email || '' },
            { notesId: id, employeeId: user?.email || '' },
          ],
        });

        if (!recipient) {
          throw new ForbiddenException('You do not have access to delete this note');
        }

        const perms = (recipient.permission || '').toLowerCase();
        if (!perms.includes('candelete') && !perms.includes('delete')) {
          throw new ForbiddenException('You do not have delete permission for this note');
        }
      }

      const allNoteIds = [note.id, ...(note.subNotes || []).map((sub) => sub.id)];
      await this.cleanupNoteAttachments(allNoteIds);

      // Clean up sub-notes first to prevent foreign key constraints
      if (note.subNotes && note.subNotes.length > 0) {
        await this.noteRepo.remove(note.subNotes);
      }
      await this.noteRepo.remove(note);
      this.logger.log(`Note ${id} and related sub-notes/attachments deleted successfully`);
      return { message: 'Note deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;
      this.logger.error(`Failed to delete note ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete note');
    }
  }

  /**
   * Create a sub-note under a specified parent note.
   */
  async createSubNote(
    parentId: number,
    createSubNoteDto: CreateSubNoteDto,
    files: Express.Multer.File[] = [],
    user: any,
  ): Promise<Note> {
    try {
      const userInfo = this.extractUserInfo(user);

      const parentNote = await this.noteRepo.findOne({ where: { id: parentId } });
      if (!parentNote) {
        throw new NotFoundException(`Parent note with ID ${parentId} not found`);
      }

      const count = await this.noteRepo.count({ where: { parentId } });

      const subNote = this.noteRepo.create({
        title: createSubNoteDto.title?.trim(),
        description: createSubNoteDto.description?.trim() || '',
        type: parentNote.type,
        projectName: parentNote.projectName,
        parentId: parentNote.id,
        color: createSubNoteDto.color || parentNote.color || '#4318FF',
        orderIndex:
          createSubNoteDto.orderIndex !== undefined ? createSubNoteDto.orderIndex : count,
        userId: userInfo.userId,
        employeeId: userInfo.employeeId,
        createdBy: userInfo.createdBy,
        updatedBy: userInfo.createdBy,
      });

      const savedSubNote = await this.noteRepo.save(subNote);

      if (createSubNoteDto.attachmentKeys && createSubNoteDto.attachmentKeys.length > 0) {
        await this.linkAttachmentKeys(savedSubNote.id, createSubNoteDto.attachmentKeys);
      }

      if (files && files.length > 0) {
        await this.uploadFilesToObjectStore(savedSubNote.id, files);
      }

      return await this.findOne(savedSubNote.id, user);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to create sub-note for parent ${parentId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to create sub-note');
    }
  }

  /**
   * Toggle the pinned status of a note.
   */
  async togglePin(id: number, user: any): Promise<Note> {
    const note = await this.noteRepo.findOne({ where: { id } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found`);
    }
    note.isPinned = !note.isPinned;
    await this.noteRepo.save(note);
    return await this.findOne(id, user);
  }

  /**
   * Toggle the archived status of a note.
   */
  async toggleArchive(id: number, user: any): Promise<Note> {
    const note = await this.noteRepo.findOne({ where: { id } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found`);
    }
    note.isArchived = !note.isArchived;
    await this.noteRepo.save(note);
    return await this.findOne(id, user);
  }

  // =========================================================================
  // Analytics & Summary Queries
  // =========================================================================

  /**
   * Retrieve distinct project names associated with project notes.
   */
  async getDistinctProjects(user: any): Promise<string[]> {
    try {
      const { userId, employeeId } = this.extractUserInfo(user);

      const qb = this.noteRepo
        .createQueryBuilder('note')
        .select('DISTINCT note.projectName', 'projectName')
        .where('note.type = :type', { type: NoteType.PROJECT })
        .andWhere('note.projectName IS NOT NULL')
        .andWhere("note.projectName != ''")
        .andWhere('note.parentId IS NULL')
        .andWhere('note.isArchived = false');

      if (userId || employeeId) {
        qb.andWhere('(note.userId = :userId OR note.employeeId = :employeeId)', {
          userId,
          employeeId,
        });
      }

      const rows = await qb.getRawMany();
      return rows.map((r) => r.projectName).filter(Boolean);
    } catch (error) {
      this.logger.error(`Failed to fetch distinct projects: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Retrieve overall note statistics (counts for total, personal, project, pinned, archived).
   */
  async getStats(user: any) {
    try {
      const { userId, employeeId } = this.extractUserInfo(user);

      const qb = this.noteRepo.createQueryBuilder('note').where('note.parentId IS NULL');

      if (userId || employeeId) {
        qb.andWhere('(note.userId = :userId OR note.employeeId = :employeeId)', {
          userId,
          employeeId,
        });
      }

      const allNotes = await qb.getMany();
      return {
        totalNotes: allNotes.length,
        personalNotes: allNotes.filter((n) => n.type === NoteType.PERSONAL && !n.isArchived).length,
        projectNotes: allNotes.filter((n) => n.type === NoteType.PROJECT && !n.isArchived).length,
        pinnedNotes: allNotes.filter((n) => n.isPinned && !n.isArchived).length,
        archivedNotes: allNotes.filter((n) => n.isArchived).length,
        totalAttachments: 0,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch note stats: ${error.message}`, error.stack);
      return {
        totalNotes: 0,
        personalNotes: 0,
        projectNotes: 0,
        pinnedNotes: 0,
        archivedNotes: 0,
        totalAttachments: 0,
      };
    }
  }

  // =========================================================================
  // File & Attachment Handling (object_store)
  // =========================================================================

  /**
   * Direct upload endpoint handler for drag-and-dropped files with automatic text extraction.
   */
  async uploadDirectFiles(
    noteId: number,
    files: Express.Multer.File[],
    user: any,
  ): Promise<any[]> {
    const results: any[] = [];
    for (const file of files) {
      try {
        const details = new DocumentMetaInfo();
        details.refId = noteId || 0;
        details.refType = ReferenceType.NOTE_ATTACHMENT;
        details.entityId = noteId || 0;
        details.entityType = EntityType.NOTE;

        const uploadRes = await this.documentUploaderService.uploadImage(file as any, details);
        const fileKey =
          (uploadRes as any)?.key ||
          (uploadRes as any)?.fileKey ||
          (uploadRes as any)?.documentKey;

        results.push({
          id: (uploadRes as any)?.id || 0,
          key: fileKey,
          fileKey,
          fileName: file.originalname,
          name: file.originalname,
          fileSize: file.size,
          size: file.size,
          mimeType: file.mimetype,
          ...(typeof uploadRes === 'object' ? uploadRes : {}),
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to direct upload dropped file ${file.originalname}: ${err.message}`,
        );
      }
    }
    return results;
  }

  /**
   * Extract styled HTML and text content from a single file via Docling Python service.
   */
  async extractFileContent(
    file: Express.Multer.File,
    options?: { useOcr?: boolean; bodyOnly?: boolean },
  ): Promise<{ filename: string; html: string; markdown: string; json: any; text: string }> {
    if (!file) {
      throw new BadRequestException('File is required for extraction');
    }

    const filename = file.originalname || 'document.pdf';
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();

    // 1. If it's a JSON file, parse and convert directly
    if (ext === '.json') {
      try {
        const json = JSON.parse(file.buffer.toString('utf-8'));
        const html = this.convertDoclingJsonToHtml(json);
        return {
          filename,
          html,
          text: html,
          markdown: '',
          json,
        };
      } catch (err: any) {
        throw new BadRequestException('Invalid JSON file');
      }
    }

    // 2. If it's a PDF / DOCX / Image -> Forward to Docling Python Service
const doclingUrl = this.configService.get<string>('DOCLING_SERVICE_URL');

if (!doclingUrl) {
  throw new InternalServerErrorException('DOCLING_SERVICE_URL is not defined in environment variables');
}

    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype || 'application/pdf',
    });
    if (options?.useOcr) {
      formData.append('use_ocr', 'true');
    }
    formData.append('body_only', String(options?.bodyOnly !== false));

    try {
      this.logger.log(`Forwarding file ${file.originalname} to Docling service at ${doclingUrl}/extract`);
      const response = await axios.post(`${doclingUrl}/extract`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000,
      });

      const html = response.data?.html || '';
      return {
        filename: response.data?.filename || filename,
        html,
        text: html,
        markdown: response.data?.markdown || '',
        json: response.data?.json || null,
      };
    } catch (err: any) {
      this.logger.error(`Failed to connect to Docling service at ${doclingUrl}: ${err.message}`);
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        throw new BadRequestException(
          `Docling Python service is not running on ${doclingUrl}. Please ensure python service is started on port 8000.`,
        );
      }
      throw new BadRequestException(
        err.response?.data?.detail || err.message || 'Failed to extract content from document',
      );
    }
  }

  /**
   * Extract text content from a single file.
   */
  async extractFileText(file: Express.Multer.File): Promise<string> {
    const res = await this.extractFileContent(file);
    return res.html || res.text || '';
  }

  /**
   * Helper to convert Docling JSON to HTML if JSON is uploaded directly.
   */
  private convertDoclingJsonToHtml(document: any): string {
    if (!document) return '';
    const html: string[] = ['<div class="docling-document">'];
    const children = document.body?.children || [];
    let listOpen = false;

    for (const child of children) {
      const ref = child?.$ref;
      if (!ref) continue;
      const match = ref.match(/^#\/([^/]+)\/(\d+)$/);
      if (!match) continue;
      const collection = document[match[1]];
      const item = collection ? collection[Number(match[2])] : null;
      if (!item) continue;

      if (item.label === 'list_item') {
        if (!listOpen) {
          html.push('<ul>');
          listOpen = true;
        }
        html.push(`<li>${item.text || item.orig || ''}</li>`);
        continue;
      }

      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }

      if (item.label === 'title') {
        html.push(`<h1 class="resume-name">${item.text || item.orig || ''}</h1>`);
      } else if (item.label === 'section_header') {
        html.push(`<h2 class="section-title">${item.text || item.orig || ''}</h2>`);
      } else if (item.label === 'table') {
        const rows = item.data?.grid || item.data?.rows || [];
        html.push('<div class="table-container"><table>');
        rows.forEach((row: any[], rIdx: number) => {
          html.push('<tr>');
          row.forEach((cell: any) => {
            const cellText = typeof cell === 'string' ? cell : cell?.text || '';
            const tag = cell?.column_header || rIdx === 0 ? 'th' : 'td';
            html.push(`<${tag}>${cellText}</${tag}>`);
          });
          html.push('</tr>');
        });
        html.push('</table></div>');
      } else {
        const text = (item.text || item.orig || '').trim();
        if (text) html.push(`<p>${text}</p>`);
      }
    }

    if (listOpen) html.push('</ul>');
    html.push('</div>');
    return html.join('\n');
  }


  // =========================================================================
  // Note Export & Download (Word .doc & PDF)
  // =========================================================================

  /**
   * Export note document in requested format (Word or PDF) preserving all styling,
   * highlighters, font colors, sub-notes, attachments, and metadata.
   */
  async exportNoteDocument(
    id: number,
    format: string = "pdf",
    user: any,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const note = await this.findOne(id, user);
    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found`);
    }

    const normalizedFormat = (format || "pdf").toLowerCase().trim();
    if (normalizedFormat === "word" || normalizedFormat === "doc" || normalizedFormat === "docx") {
      return this.generateWordDoc(note);
    }

    return await this.generatePdfDoc(note);
  }

  /**
   * Generate high-fidelity Microsoft Word (.doc) document preserving all HTML formatting,
   * highlighters, font colors, boxes, callouts, tables, sub-notes, and attachments.
   */
  private generateWordDoc(note: Note): { buffer: Buffer; contentType: string; filename: string } {
    const safeTitle = (note.title || "Note").replace(/[/\\?%*:|"<>]/g, "_");
    const isProject = note.type === NoteType.PROJECT;
    const projectLabel = note.projectName || "Worksphere Project";
    const createdDate = dayjs(note.createdAt).format("MMMM DD, YYYY");
    const updatedDate = dayjs(note.updatedAt).format("MMMM DD, YYYY");
    const author = note.createdBy || "User";

    // Build Sub-notes HTML table if sub-notes exist
    let subNotesHtml = "";
    if (note.subNotes && note.subNotes.length > 0) {
      const subRows = note.subNotes
        .map((sub, idx) => {
          const subDate = dayjs(sub.createdAt).format("MMM DD, YYYY");
          return `
            <tr>
              <td style="padding: 8pt; border: 1pt solid #CBD5E1; text-align: center; font-weight: bold; width: 40pt; background-color: #F8FAFC;">${idx + 1}</td>
              <td style="padding: 8pt; border: 1pt solid #CBD5E1; font-weight: bold; color: #1E293B; width: 140pt;">${this.escapeXml(sub.title || "")}</td>
              <td style="padding: 8pt; border: 1pt solid #CBD5E1; color: #64748B; width: 80pt;">${this.escapeXml(sub.createdBy || "User")}</td>
              <td style="padding: 8pt; border: 1pt solid #CBD5E1; color: #64748B; width: 80pt;">${subDate}</td>
              <td style="padding: 8pt; border: 1pt solid #CBD5E1; color: #334155;">${sub.description || '<span style="color:#94A3B8; font-style:italic;">No description</span>'}</td>
            </tr>
          `;
        })
        .join("");

      subNotesHtml = `
        <div class="section-title">Sub-Notes (${note.subNotes.length})</div>
        <table class="subnotes-table" style="width: 100%; border-collapse: collapse; margin-top: 10pt; margin-bottom: 20pt;">
          <thead>
            <tr style="background-color: #4318FF; color: #FFFFFF;">
              <th style="padding: 8pt; border: 1pt solid #3730A3; text-align: center; width: 40pt;">#</th>
              <th style="padding: 8pt; border: 1pt solid #3730A3; text-align: left; width: 140pt;">Title</th>
              <th style="padding: 8pt; border: 1pt solid #3730A3; text-align: left; width: 80pt;">Author</th>
              <th style="padding: 8pt; border: 1pt solid #3730A3; text-align: left; width: 80pt;">Date</th>
              <th style="padding: 8pt; border: 1pt solid #3730A3; text-align: left;">Description</th>
            </tr>
          </thead>
          <tbody>
            ${subRows}
          </tbody>
        </table>
      `;
    }

    // Build Attachments HTML list if attachments exist
    let attachmentsHtml = "";
    if (note.attachments && note.attachments.length > 0) {
      const attRows = note.attachments
        .map((att, idx) => {
          const name = (att as any).name || (att as any).fileName || 'Attachment';
          const fileSize = (att as any).fileSize || (att as any).size;
          const size = fileSize ? `${Math.round(fileSize / 1024)} KB` : 'Attached file';
          return `
            <li style="margin-bottom: 6pt; color: #334155;">
              <strong>${idx + 1}. ${this.escapeXml(name)}</strong> <span style="color: #64748B; font-size: 9.5pt;">(${size})</span>
            </li>
          `;
        })
        .join("");

      attachmentsHtml = `
        <div class="section-title">Files & Attachments (${note.attachments.length})</div>
        <ul style="padding-left: 20pt; margin-top: 8pt; margin-bottom: 20pt;">
          ${attRows}
        </ul>
      `;
    }

    const wordHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <title>${this.escapeXml(note.title || "Note")}</title>
        <style>
          @page Section1 {
            size: 595.3pt 841.9pt;
            margin: 1.0in 1.0in 1.0in 1.0in;
            mso-header-margin: 35.4pt;
            mso-footer-margin: 35.4pt;
            mso-paper-source: 0;
          }
          div.Section1 { page: Section1; }
          body {
            font-family: 'Segoe UI', Calibri, Arial, Helvetica, sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #1E293B;
            background-color: #FFFFFF;
          }
          h1, h2, h3, h4, h5, h6 {
            color: #1E293B;
            font-family: 'Segoe UI', Calibri, Arial, sans-serif;
            margin-top: 14pt;
            margin-bottom: 6pt;
          }
          h1 {
            color: #4318FF;
            font-size: 22pt;
            font-weight: bold;
            margin-top: 0;
            margin-bottom: 12pt;
          }
          h2 { font-size: 16pt; color: #1E293B; }
          h3 { font-size: 13pt; color: #334155; }
          p { margin-top: 0; margin-bottom: 10pt; line-height: 1.6; }
          .header-box {
            background-color: #F8FAFC;
            border: 1.5pt solid #E2E8F0;
            padding: 14pt 18pt;
            border-radius: 8pt;
            margin-bottom: 18pt;
          }
          .badge {
            display: inline-block;
            padding: 3pt 10pt;
            font-size: 9.5pt;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5pt;
            border-radius: 4pt;
            background-color: #EEF2FF;
            color: #4318FF;
            border: 1pt solid #C7D2FE;
          }
          .badge-personal {
            background-color: #ECFDF5;
            color: #059669;
            border: 1pt solid #A7F3D0;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8pt;
          }
          .meta-table td {
            padding: 4pt 6pt;
            font-size: 9.5pt;
            color: #64748B;
            border: none;
          }
          .section-title {
            font-size: 12pt;
            font-weight: bold;
            color: #4318FF;
            text-transform: uppercase;
            letter-spacing: 0.8pt;
            border-bottom: 1.5pt solid #E2E8F0;
            padding-bottom: 4pt;
            margin-top: 18pt;
            margin-bottom: 10pt;
          }
          .content-container {
            font-size: 11pt;
            line-height: 1.65;
            color: #1E293B;
          }
          mark, span[style*="background-color"] {
            padding: 2pt 4pt;
            border-radius: 2pt;
          }
          blockquote {
            border-left: 3.5pt solid #4318FF;
            background-color: #F8FAFC;
            padding: 8pt 14pt;
            margin: 10pt 0;
            font-style: italic;
            color: #475569;
          }
          pre, code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #F1F5F9;
            padding: 3pt 6pt;
            border-radius: 3pt;
            font-size: 10pt;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 12pt 0;
          }
          table th, table td {
            border: 1pt solid #CBD5E1;
            padding: 7pt 10pt;
            text-align: left;
            font-size: 10pt;
          }
          table th {
            background-color: #F1F5F9;
            font-weight: bold;
            color: #1E293B;
          }
          .footer-note {
            margin-top: 30pt;
            padding-top: 10pt;
            border-top: 1pt solid #E2E8F0;
            font-size: 9pt;
            color: #94A3B8;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          <div class="header-box">
            <span class="${isProject ? "badge" : "badge badge-personal"}">
              ${isProject ? `PROJECT NOTE: ${this.escapeXml(projectLabel)}` : "PERSONAL NOTE"}
            </span>
            <h1 style="margin-top: 10pt; margin-bottom: 6pt;">${this.escapeXml(note.title || "Untitled Note")}</h1>
            <table class="meta-table">
              <tr>
                <td><strong>Author:</strong> ${this.escapeXml(author)}</td>
                <td><strong>Created:</strong> ${createdDate}</td>
                <td><strong>Last Modified:</strong> ${updatedDate}</td>
              </tr>
            </table>
          </div>

          <div class="section-title">Description & Content</div>
          <div class="content-container">
            ${note.description || '<p style="color: #94A3B8; font-style: italic;">No description provided.</p>'}
          </div>

          ${subNotesHtml}
          ${attachmentsHtml}

          <div class="footer-note">
            © ${new Date().getFullYear()} WorkSphere Powered by inventech &nbsp;|&nbsp; Exported on ${dayjs().format("MMMM DD, YYYY HH:mm")}
          </div>
        </div>
      </body>
      </html>
    `;

    const buffer = Buffer.from("\ufeff" + wordHtml, "utf-8");
    return {
      buffer,
      contentType: "application/msword; charset=utf-8",
      filename: `${safeTitle}.doc`,
    };
  }

  /**
   * Generate high-fidelity PDF document preserving metadata, formatted description,
   * highlights, sub-notes, attachments, and brand header/footer.
   */
  private async generatePdfDoc(
    note: Note,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const safeTitle = (note.title || "Note").replace(/[/\\?%*:|"<>]/g, "_");
    const isProject = note.type === NoteType.PROJECT;
    const projectLabel = note.projectName || "Worksphere Project";
    const createdDate = dayjs(note.createdAt).format("MMMM DD, YYYY");
    const author = note.createdBy || "User";

    return new Promise<{ buffer: Buffer; contentType: string; filename: string }>((resolve, reject) => {
      try {
        const doc = new (PDFDocument as any)({
          size: "A4",
          margin: 40,
          info: {
            Title: note.title || "Note",
            Author: author,
            Subject: isProject ? `Project: ${projectLabel}` : "Personal Note",
          },
        });

        const buffers: Buffer[] = [];
        doc.on("data", (chunk: any) => buffers.push(chunk));
        doc.on("end", () => {
          resolve({
            buffer: Buffer.concat(buffers),
            contentType: "application/pdf",
            filename: `${safeTitle}.pdf`,
          });
        });
        doc.on("error", (err: any) => reject(err));

        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const margin = 40;
        const contentWidth = pageWidth - margin * 2;

        // Top Accent Bar
        doc.rect(margin, 20, contentWidth, 4).fill("#4318FF");

        // Brand Sub-Header
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#4318FF")
          .text("WORKSPHERE NOTE DOCUMENT", margin, 32);

        // Note Title
        doc
          .font("Helvetica-Bold")
          .fontSize(18)
          .fillColor("#1B2559")
          .text(note.title || "Untitled Note", margin, 46, { width: contentWidth });

        let currentY = doc.y + 10;

        // Metadata Card Box
        const cardHeight = 44;
        doc
          .roundedRect(margin, currentY, contentWidth, cardHeight, 6)
          .fillAndStroke("#F8FAFC", "#E2E8F0");

        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(isProject ? "#4318FF" : "#059669")
          .text(
            isProject ? `PROJECT: ${projectLabel.toUpperCase()}` : "PERSONAL NOTE",
            margin + 12,
            currentY + 10,
          );

        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor("#64748B")
          .text(`Created by: ${author}  |  Date: ${createdDate}`, margin + 12, currentY + 24);

        if (note.attachments && note.attachments.length > 0) {
          doc
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .fillColor("#4318FF")
            .text(
              `${note.attachments.length} attachment${note.attachments.length > 1 ? "s" : ""}`,
              margin + contentWidth - 110,
              currentY + 16,
              { align: "right", width: 98 },
            );
        }

        currentY += cardHeight + 16;

        // Section Title: Description
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#4318FF")
          .text("DESCRIPTION & CONTENT", margin, currentY);

        currentY = doc.y + 4;
        doc.strokeColor("#E2E8F0").lineWidth(1).moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();
        currentY += 10;
        doc.y = currentY;

        // Render Description Content (Extract and render rich text chunks)
        const descHtml = note.description || "";
        this.renderHtmlToPdf(doc, descHtml, margin, contentWidth, pageHeight);

        // Render Sub-notes if any
        if (note.subNotes && note.subNotes.length > 0) {
          if (doc.y > pageHeight - 120) doc.addPage();

          doc.moveDown(1.5);
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .fillColor("#4318FF")
            .text(`SUB-NOTES (${note.subNotes.length})`, margin, doc.y);

          const divY = doc.y + 4;
          doc.strokeColor("#E2E8F0").lineWidth(1).moveTo(margin, divY).lineTo(pageWidth - margin, divY).stroke();
          doc.y = divY + 8;

          note.subNotes.forEach((sub, idx) => {
            if (doc.y > pageHeight - 90) doc.addPage();

            doc
              .font("Helvetica-Bold")
              .fontSize(10)
              .fillColor("#1E293B")
              .text(`${idx + 1}. ${sub.title || "Untitled Sub-note"}`, margin + 6, doc.y);

            const subDate = dayjs(sub.createdAt).format("MMM DD, YYYY");
            doc
              .font("Helvetica")
              .fontSize(8)
              .fillColor("#64748B")
              .text(`By ${sub.createdBy || "User"}  |  ${subDate}`, margin + 18, doc.y + 2);

            if (sub.description && sub.description.trim()) {
              const cleanSubText = this.stripHtml(sub.description);
              doc
                .font("Helvetica")
                .fontSize(9)
                .fillColor("#334155")
                .text(cleanSubText, margin + 18, doc.y + 4, { width: contentWidth - 24 });
            }
            doc.moveDown(0.8);
          });
        }

        // Render Attachments List if any
        if (note.attachments && note.attachments.length > 0) {
          if (doc.y > pageHeight - 100) doc.addPage();

          doc.moveDown(1.5);
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .fillColor("#4318FF")
            .text(`ATTACHMENTS (${note.attachments.length})`, margin, doc.y);

          const attDivY = doc.y + 4;
          doc.strokeColor("#E2E8F0").lineWidth(1).moveTo(margin, attDivY).lineTo(pageWidth - margin, attDivY).stroke();
          doc.y = attDivY + 8;

          note.attachments.forEach((att, idx) => {
            const name = (att as any).name || (att as any).fileName || 'Attachment';
            const fileSize = (att as any).fileSize || (att as any).size;
          const size = fileSize ? `${Math.round(fileSize / 1024)} KB` : 'Attached file';
            doc
              .font("Helvetica")
              .fontSize(9)
              .fillColor("#334155")
              .text(`• ${idx + 1}. ${name} (${size})`, margin + 6, doc.y);
            doc.moveDown(0.3);
          });
        }

        // Global Page Footers
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#94A3B8")
            .text(
              `© ${new Date().getFullYear()} WorkSphere Powered by inventech  |  Page ${i + 1} of ${range.count}`,
              margin,
              pageHeight - 25,
              { align: "center", width: contentWidth },
            );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Render HTML content to PDF preserving paragraphs, headings, blockquotes, lists,
   * highlights and text colors.
   */
  private renderHtmlToPdf(
    doc: any,
    html: string,
    margin: number,
    contentWidth: number,
    pageHeight: number,
  ): void {
    if (!html || !html.trim()) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(10)
        .fillColor("#94A3B8")
        .text("No description provided.", margin, doc.y);
      return;
    }

    // Split HTML into blocks (paragraphs, headers, blockquotes, lists, tables)
    const normalizedHtml = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, "</$1>\n");

    const lines = normalizedHtml.split("\n");

    for (let rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        doc.moveDown(0.4);
        continue;
      }

      if (doc.y > pageHeight - 60) {
        doc.addPage();
        doc.y = 40;
      }

      // 1. Heading 1-3
      if (/<h[1-3][^>]*>/i.test(trimmed)) {
        const headingText = this.stripHtml(trimmed);
        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#1B2559")
          .text(headingText, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.5);
        continue;
      }

      // 2. Heading 4-6
      if (/<h[4-6][^>]*>/i.test(trimmed)) {
        const headingText = this.stripHtml(trimmed);
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#334155")
          .text(headingText, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.4);
        continue;
      }

      // 3. Blockquote / Callout Box
      if (/<blockquote[^>]*>/i.test(trimmed)) {
        const quoteText = this.stripHtml(trimmed);
        const quoteY = doc.y;
        doc
          .strokeColor("#4318FF")
          .lineWidth(3)
          .moveTo(margin, quoteY)
          .lineTo(margin, quoteY + 20)
          .stroke();

        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor("#475569")
          .text(quoteText, margin + 12, quoteY + 2, { width: contentWidth - 16 });
        doc.moveDown(0.5);
        continue;
      }

      // 4. List item
      if (/<li[^>]*>/i.test(trimmed)) {
        const itemText = this.stripHtml(trimmed);
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#334155")
          .text(`• ${itemText}`, margin + 10, doc.y, { width: contentWidth - 10 });
        doc.moveDown(0.3);
        continue;
      }

      // 5. Check if line contains highlight (background-color or mark)
      const isHighlighted = /background-color:|mark>/i.test(trimmed);
      const text = this.stripHtml(trimmed);

      if (!text) continue;

      if (isHighlighted) {
        // Render highlighted card/pill
        const currentY = doc.y;
        const textHeight = doc.heightOfString(text, { width: contentWidth - 16, fontSize: 10 });
        doc
          .roundedRect(margin, currentY, contentWidth, textHeight + 8, 4)
          .fillAndStroke("#FEF9C3", "#FEF08A");

        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#713F12")
          .text(text, margin + 8, currentY + 4, { width: contentWidth - 16 });

        doc.y = currentY + textHeight + 12;
      } else {
        // Regular paragraph text
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#334155")
          .text(text, margin, doc.y, { width: contentWidth, lineGap: 3 });
        doc.moveDown(0.4);
      }
    }
  }

  private escapeXml(unsafe: string): string {
    return (unsafe || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private stripHtml(html: string): string {
    return (html || "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Upload attachments for an existing note.
   */
  async uploadAttachments(noteId: number, files: Express.Multer.File[]): Promise<any[]> {
    const note = await this.noteRepo.findOne({ where: { id: noteId } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${noteId} not found`);
    }

    await this.uploadFilesToObjectStore(noteId, files);

    return await this.documentUploaderService.getAllDocs(
      EntityType.NOTE,
      noteId,
      ReferenceType.NOTE_ATTACHMENT,
      noteId,
    );
  }

  /**
   * Retrieve attachment metadata and stream from storage.
   */
  async getAttachmentMetaAndStream(key: string) {
    const metaData = await this.documentUploaderService.getMetaData(key);
    const dataStream = await this.documentUploaderService.downloadFile(key);
    return { metaData, dataStream };
  }

  /**
   * Delete an attachment from storage and object_store database by key or ID.
   * Requires owner access or recipient with CanEdit permission.
   */
  async deleteAttachment(key: string, user?: any): Promise<{ message: string }> {
    try {
      this.logger.log(`Deleting attachment: ${key}`);
      const doc = await this.documentRepo.findOne({
        where: [{ id: key }, { s3Key: key }],
      });

      if (!doc) {
        throw new NotFoundException(`Attachment with key ${key} not found`);
      }

      // If user context is provided and attachment belongs to a note, verify CanEdit or owner permission
      if (user && doc.entityId && doc.entityType === EntityType.NOTE) {
        const { userId, employeeId } = this.extractUserInfo(user);
        const note = await this.noteRepo.findOne({ where: { id: doc.entityId } });
        if (note) {
          const isOwner =
            (userId && note.userId === userId) ||
            (employeeId && note.employeeId === employeeId);

          if (!isOwner) {
            const recipient = await this.inboxRepo.findOne({
              where: [
                { notesId: note.id, employeeId: employeeId || '' },
                { notesId: note.id, toMail: user?.email || '' },
                { notesId: note.id, employeeId: user?.email || '' },
              ],
            });

            if (!recipient) {
              throw new ForbiddenException('You do not have access to delete this attachment');
            }

            const perms = (recipient.permission || '').toLowerCase();
            if (!perms.includes('candelete') && !perms.includes('delete') && !perms.includes('canedit') && !perms.includes('edit')) {
              throw new ForbiddenException('You do not have delete permission for this note attachment');
            }
          }
        }
      }

      const s3KeyToDelete = doc.s3Key || doc.id;
      if (s3KeyToDelete) {
        try {
          await this.documentUploaderService.deleteMinioDoc(s3KeyToDelete);
        } catch (e: any) {
          this.logger.warn(`Could not delete file from MinIO: ${e.message}`);
        }
      }
      await this.documentRepo.delete(doc.id);
      this.logger.log(`Successfully deleted document ${doc.id} from DB`);
      return { message: 'Document deleted successfully' };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;
      this.logger.error(`Failed to delete attachment ${key}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(error.message || 'Failed to delete attachment');
    }
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Extract authenticated user information into a standardized context object.
   */
  private extractUserInfo(user: any): UserContext {
    const rawUserId = user?.id || user?.userId;
    const userId = rawUserId !== undefined && rawUserId !== null ? String(rawUserId) : null;
    const employeeId = user?.employeeId
      ? String(user.employeeId)
      : user?.loginId || user?.aliasLoginName || null;
    const createdBy = user?.aliasLoginName || user?.fullName || user?.loginId || 'User';
    return { userId, employeeId, createdBy };
  }

  /**
   * Batch create sub-notes for a parent note.
   */
  private async createSubNotesBatch(
    parentId: number,
    subNotes: CreateSubNoteDto[],
    type: NoteType,
    projectName: string | null,
    userInfo: UserContext,
  ): Promise<Note[]> {
    if (!subNotes || !Array.isArray(subNotes) || subNotes.length === 0) {
      return [];
    }

    const validSubNotes = subNotes.filter(
      (sub) => sub && typeof sub.title === 'string' && sub.title.trim().length > 0,
    );

    if (validSubNotes.length === 0) {
      return [];
    }

    const entities = validSubNotes.map((sub, index) =>
      this.noteRepo.create({
        title: sub.title.trim(),
        description: sub.description?.trim() || '',
        type,
        projectName,
        parentId,
        color: sub.color || '#4318FF',
        orderIndex: sub.orderIndex !== undefined ? sub.orderIndex : index,
        userId: userInfo.userId,
        employeeId: userInfo.employeeId,
        createdBy: userInfo.createdBy,
        updatedBy: userInfo.createdBy,
      }),
    );

    return await this.noteRepo.save(entities);
  }

  /**
   * Link pre-uploaded documents in object_store to their target note ID.
   */
  private async linkAttachmentKeys(noteId: number, keys?: string[]): Promise<void> {
    if (!keys || keys.length === 0) return;
    try {
      for (const key of keys) {
        if (!key) continue;
        await this.documentRepo
          .createQueryBuilder()
          .update(DocumentMetaInfo)
          .set({
            refId: noteId,
            entityId: noteId,
            refType: ReferenceType.NOTE_ATTACHMENT,
            entityType: EntityType.NOTE,
          })
          .where('(id = :key OR s3Key = :key)', { key })
          .execute();
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to link pre-uploaded attachments to note ${noteId}: ${err.message}`,
      );
    }
  }

  /**
   * Populate attachments from object_store for a list of notes and their sub-notes.
   */
  private async populateAttachments(notes: Note[]): Promise<void> {
    for (const note of notes) {
      note.attachments = await this.documentUploaderService.getAllDocs(
        EntityType.NOTE,
        note.id,
        ReferenceType.NOTE_ATTACHMENT,
        note.id,
      );

      if (note.subNotes && note.subNotes.length > 0) {
        for (const sub of note.subNotes) {
          sub.attachments = await this.documentUploaderService.getAllDocs(
            EntityType.NOTE,
            sub.id,
            ReferenceType.NOTE_ATTACHMENT,
            sub.id,
          );
        }
      }
    }
  }

  /**
   * Clean up all attachments associated with given note IDs from object_store and S3.
   */
  private async cleanupNoteAttachments(noteIds: number[]): Promise<void> {
    if (!noteIds || noteIds.length === 0) return;
    try {
      const docs = await this.documentRepo
        .createQueryBuilder('doc')
        .where('doc.entityType = :entityType', { entityType: EntityType.NOTE })
        .andWhere('(doc.entityId IN (:...noteIds) OR doc.refId IN (:...noteIds))', { noteIds })
        .getMany();

      this.logger.log(
        `Cleaning up ${docs.length} attachments for note IDs: ${noteIds.join(', ')}`,
      );

      for (const doc of docs) {
        const s3Key = doc.s3Key || doc.id;
        if (s3Key) {
          try {
            await this.documentUploaderService.deleteMinioDoc(s3Key);
          } catch (e: any) {
            this.logger.warn(
              `Could not delete file from MinIO for key ${s3Key}: ${e.message}`,
            );
          }
        }
        await this.documentRepo.delete(doc.id);
      }
    } catch (err: any) {
      this.logger.warn(`Failed cleanup attachments for noteIds ${noteIds}: ${err.message}`);
    }
  }

  /**
   * Upload multiple physical files to object_store for a note.
   */
  private async uploadFilesToObjectStore(
    noteId: number,
    files: Express.Multer.File[],
  ): Promise<any[]> {
    const results: any[] = [];
    for (const file of files) {
      try {
        const details = new DocumentMetaInfo();
        details.refId = noteId;
        details.refType = ReferenceType.NOTE_ATTACHMENT;
        details.entityId = noteId;
        details.entityType = EntityType.NOTE;

        const uploadRes = await this.documentUploaderService.uploadImage(file as any, details);
        results.push(uploadRes);
      } catch (err: any) {
        this.logger.error(
          `Failed to upload file ${file.originalname} to object_store: ${err.message}`,
        );
      }
    }
    return results;
  }
}
