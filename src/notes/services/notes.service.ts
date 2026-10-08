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
import {
  hasNotePermission,
  resolveInboxPermissionsForUser,
} from '../../inbox/services/inbox.service';
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
        isVertical: createDto.isVertical !== undefined ? createDto.isVertical : true,
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
        .select([
          'note.id',
          'note.title',
          'note.description',
          'note.type',
          'note.projectName',
          'note.parentId',
          'note.userId',
          'note.employeeId',
          'note.color',
          'note.isPinned',
          'note.isArchived',
          'note.autoSave',
          'note.isVertical',
          'note.orderIndex',
          'note.createdAt',
          'note.updatedAt',
          'note.createdBy',
          'note.updatedBy',
          'subNote.id',
          'subNote.title',
          'subNote.description',
          'subNote.type',
          'subNote.projectName',
          'subNote.parentId',
          'subNote.userId',
          'subNote.employeeId',
          'subNote.color',
          'subNote.isPinned',
          'subNote.isArchived',
          'subNote.autoSave',
          'subNote.isVertical',
          'subNote.orderIndex',
          'subNote.createdAt',
          'subNote.updatedAt',
          'subNote.createdBy',
          'subNote.updatedBy',
          'nestedSubNote.id',
          'nestedSubNote.title',
          'nestedSubNote.description',
          'nestedSubNote.type',
          'nestedSubNote.projectName',
          'nestedSubNote.parentId',
          'nestedSubNote.userId',
          'nestedSubNote.employeeId',
          'nestedSubNote.color',
          'nestedSubNote.isPinned',
          'nestedSubNote.isArchived',
          'nestedSubNote.autoSave',
          'nestedSubNote.isVertical',
          'nestedSubNote.orderIndex',
          'nestedSubNote.createdAt',
          'nestedSubNote.updatedAt',
          'nestedSubNote.createdBy',
          'nestedSubNote.updatedBy',
        ])
        .where('note.parentId IS NULL');

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

      if (query.type) {
        qb.andWhere('note.type = :type', { type: query.type });
      }

      if (query.projectName && query.projectName.trim()) {
        qb.andWhere('LOWER(note.projectName) = LOWER(:projectName)', {
          projectName: query.projectName.trim(),
        });
      }

      if (query.isPinned !== undefined) {
        qb.andWhere('note.isPinned = :isPinned', { isPinned: query.isPinned });
      }

      if (query.isArchived !== undefined) {
        qb.andWhere('note.isArchived = :isArchived', { isArchived: query.isArchived });
      } else {
        qb.andWhere('note.isArchived = false');
      }

      if (query.search && query.search.trim()) {
        const searchVal = `%${query.search.trim().toLowerCase()}%`;
        qb.andWhere(
          '(LOWER(note.title) LIKE :searchVal OR LOWER(note.projectName) LIKE :searchVal OR LOWER(subNote.title) LIKE :searchVal)',
          { searchVal },
        );
      }

      qb.orderBy('note.isPinned', 'DESC')
        .addOrderBy('note.updatedAt', 'DESC')
        .addOrderBy('subNote.orderIndex', 'ASC')
        .addOrderBy('subNote.createdAt', 'ASC');

      const data = await qb.getMany();
      const total = data.length;

      await this.attachStoredFiles(data);

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
          const perms =
            (await resolveInboxPermissionsForUser(this.inboxRepo, note.id, {
              employeeId,
              email: user.email || '',
            })) || NotePermission.CanView;
          (note as any).permission = perms;
          (note as any).userPermission = perms;
          (note as any).isOwner = false;
          (note as any).canView = true;
          (note as any).canEdit = hasNotePermission(perms, NotePermission.CanEdit);
          (note as any).canDelete = hasNotePermission(perms, NotePermission.CanDelete);
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
        const perms = await resolveInboxPermissionsForUser(this.inboxRepo, id, {
          employeeId,
          email: user?.email || '',
        });

        if (!perms) {
          throw new ForbiddenException('You do not have access to edit this note');
        }

        if (!hasNotePermission(perms, NotePermission.CanEdit)) {
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
      if (updateDto.isVertical !== undefined) note.isVertical = updateDto.isVertical;
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
      const perms = await resolveInboxPermissionsForUser(this.inboxRepo, id, {
        employeeId,
        email: user?.email || '',
      });

      if (!perms || !hasNotePermission(perms, NotePermission.CanEdit)) {
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
        const perms = await resolveInboxPermissionsForUser(this.inboxRepo, id, {
          employeeId,
          email: user?.email || '',
        });

        if (!perms) {
          throw new ForbiddenException('You do not have access to delete this note');
        }

        if (!hasNotePermission(perms, NotePermission.CanDelete)) {
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

      const row = await qb
        .select('COUNT(*)', 'totalNotes')
        .addSelect(
          `SUM(CASE WHEN note.type = :personal AND note.isArchived = false THEN 1 ELSE 0 END)`,
          'personalNotes',
        )
        .addSelect(
          `SUM(CASE WHEN note.type = :project AND note.isArchived = false THEN 1 ELSE 0 END)`,
          'projectNotes',
        )
        .addSelect(
          `SUM(CASE WHEN note.isPinned = true AND note.isArchived = false THEN 1 ELSE 0 END)`,
          'pinnedNotes',
        )
        .addSelect(
          `SUM(CASE WHEN note.isArchived = true THEN 1 ELSE 0 END)`,
          'archivedNotes',
        )
        .setParameter('personal', NoteType.PERSONAL)
        .setParameter('project', NoteType.PROJECT)
        .getRawOne();
      const count = (value: unknown) => Number(value || 0);
      return {
        totalNotes: count(row?.totalNotes),
        personalNotes: count(row?.personalNotes),
        projectNotes: count(row?.projectNotes),
        pinnedNotes: count(row?.pinnedNotes),
        archivedNotes: count(row?.archivedNotes),
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

  private getExtractMaxPages(): number {
    const raw =
      this.configService.get<string>('DOCLING_MAX_PAGES') ||
      this.configService.get<string>('NOTES_IMPORT_MAX_PAGES') ||
      '50';
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 50;
  }

  private async countPdfPages(buffer: Buffer): Promise<number | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(buffer);
      const pages = Number(parsed?.numpages);
      return Number.isFinite(pages) && pages > 0 ? pages : null;
    } catch {
      return null;
    }
  }

  private tooLongResult(
    filename: string,
    pageCount: number,
    maxPages: number,
  ): {
    filename: string;
    html: string;
    markdown: string;
    json: any;
    text: string;
    pages: any[];
    tooLong: boolean;
    pageCount: number;
    maxPages: number;
  } {
    return {
      filename,
      html: '',
      text: '',
      markdown: '',
      json: null,
      pages: [],
      tooLong: true,
      pageCount,
      maxPages,
    };
  }

  /**
   * Extract styled HTML and text content from a single file via Docling Python service.
   */
  async extractFileContent(
    file: Express.Multer.File,
    options?: { useOcr?: boolean; bodyOnly?: boolean },
  ): Promise<{
    filename: string;
    html: string;
    markdown: string;
    json: any;
    text: string;
    pages?: any[];
    tooLong?: boolean;
    pageCount?: number;
    maxPages?: number;
  }> {
    if (!file) {
      throw new BadRequestException('File is required for extraction');
    }

    const filename = file.originalname || 'document.pdf';
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    const maxPages = this.getExtractMaxPages();

    // Reject oversized PDFs before calling Docling (avoids long parse jobs).
    if (ext === '.pdf') {
      const pageCount = await this.countPdfPages(file.buffer);
      if (pageCount != null && pageCount > maxPages) {
        this.logger.warn(
          `Rejecting Description import for ${filename}: ${pageCount} pages exceeds max ${maxPages}`,
        );
        return this.tooLongResult(filename, pageCount, maxPages);
      }
    }

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

    // 2a. If it's an Excel / CSV file -> Parse with xlsx (SheetJS)
    const excelExtensions = ['.xlsx', '.xls', '.csv'];
    if (excelExtensions.includes(ext)) {
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new BadRequestException('No sheets found in the workbook');
        }
        
        let html = `
          <style>
            .excel-import-wrapper table {
              border-collapse: collapse;
              width: max-content;
              min-width: 100%;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              font-size: 13px;
              margin-bottom: 16px;
            }
            .excel-import-wrapper th, .excel-import-wrapper td {
              border: 1px solid #d0d7de;
              padding: 6px 8px;
              text-align: left;
              min-width: 80px;
            }
            .excel-import-wrapper th, .excel-import-wrapper tr:first-child td {
              background-color: #f6f8fa;
              font-weight: 600;
              color: #24292f;
            }
            .excel-import-wrapper tr:nth-child(even) {
              background-color: #fcfcfc;
            }
          </style>
          <div class="excel-import-wrapper" style="width:100%;overflow-x:auto;">
        `;
        
        workbook.SheetNames.forEach((sheetName, index) => {
          const ws = workbook.Sheets[sheetName];
          const sheetHtml = XLSX.utils.sheet_to_html(ws, { editable: false });
          
          html += `<h3 style="color:#2B3674;margin:${index > 0 ? '24px' : '0'} 0 8px 0;font-size:14px;font-weight:700;border-bottom:2px solid #4318FF;padding-bottom:4px;font-family:sans-serif;">📊 ${sheetName}</h3>`;
          html += sheetHtml;
        });
        
        html += `</div>`;
        
        return {
          filename,
          html,
          text: html,
          markdown: '',
          json: null,
        };
      } catch (err: any) {
        this.logger.error(`Failed to parse Excel file: ${err.message}`);
        throw new BadRequestException(`Failed to parse Excel file: ${err.message}`);
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
        timeout: Number(this.configService.get<string>('DOCLING_TIMEOUT_MS')),
      });

      const markdown = response.data?.markdown || '';
      let html = response.data?.html || '';
      if (!this.htmlHasVisibleText(html) && markdown.trim()) {
        html = this.markdownToHtml(markdown);
      }
      const extractPages = Array.isArray(response.data?.pages) ? response.data.pages : [];

      // Drop blank Docling pages so the frontend does not render an empty leading sheet
      const pagesWithContent = extractPages.filter((page: any) => {
        const pageHtml = String(page?.html || '');
        const text = pageHtml.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim();
        return Boolean(text) || /<(img|table|svg|canvas)\b/i.test(pageHtml);
      });

      const jsonPages =
        response.data?.json?.pages && typeof response.data.json.pages === 'object'
          ? Object.keys(response.data.json.pages).length
          : 0;
      const pageCount = pagesWithContent.length || jsonPages || 0;

      // Too long for Description — return a flag so the client can attach as a file instead
      if (maxPages > 0 && pageCount > maxPages) {
        this.logger.warn(
          `Rejecting Description import for ${filename}: ${pageCount} pages exceeds max ${maxPages}`,
        );
        return this.tooLongResult(
          response.data?.filename || filename,
          pageCount,
          maxPages,
        );
      }

      return {
        filename: response.data?.filename || filename,
        html,
        text: html,
        markdown,
        json: response.data?.json || null,
        pages: pagesWithContent,
        pageCount,
        maxPages,
      };
    } catch (err: any) {
      const data = err.response?.data;
      const code = data?.code || data?.detail?.code;
      if (
        err.response?.status === 413 ||
        code === 'DOCUMENT_TOO_LONG' ||
        data?.attach_as_file ||
        data?.attachAsFile
      ) {
        const pageCount = Number(data?.page_count || data?.pageCount || 0);
        const limit = Number(data?.max_pages || data?.maxPages || maxPages);
        return this.tooLongResult(
          data?.filename || filename,
          pageCount > 0 ? pageCount : maxPages + 1,
          limit,
        );
      }

      const detail =
        (typeof data?.detail === 'string' && data.detail) ||
        data?.message ||
        err.message;
      this.logger.error(`Failed to connect to Docling service at ${doclingUrl}: ${detail}`);
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        throw new BadRequestException(
          `Docling Python service is not running on ${doclingUrl}. Please ensure python service is started on port 8000.`,
        );
      }
      throw new BadRequestException(
        detail || 'Failed to extract content from document',
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

  private htmlHasVisibleText(html: string): boolean {
    const text = (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    return Boolean(text) || /<(img|table|svg|canvas)\b/i.test(html || '');
  }

  /** Word extracts often come back with markdown and an empty html field. */
  private markdownToHtml(markdown: string): string {
    const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
    const out: string[] = [];
    let list: string[] = [];
    let index = 0;

    const inline = (value: string) => {
      let text = value
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      text = text.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_match, label, href) => `<a href="${href}">${label}</a>`,
      );
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      return text;
    };
    const flushList = () => {
      if (!list.length) return;
      out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      list = [];
    };
    const isRule = (line: string) =>
      /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
    const splitRow = (line: string) =>
      line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

    while (index < lines.length) {
      const line = lines[index].trim();
      if (!line || line.startsWith('<!--')) {
        flushList();
        index += 1;
        continue;
      }
      if (line.startsWith('|')) {
        flushList();
        const rows: string[][] = [];
        while (index < lines.length && lines[index].trim().startsWith('|')) {
          const current = lines[index].trim();
          if (!isRule(current)) rows.push(splitRow(current));
          index += 1;
        }
        if (rows.length) {
          const [head, ...body] = rows;
          const header = `<tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr>`;
          const bodyHtml = body
            .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
            .join('');
          out.push(`<table><thead>${header}</thead><tbody>${bodyHtml}</tbody></table>`);
        }
        continue;
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        flushList();
        out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
        index += 1;
        continue;
      }
      const bullet = /^[-*]\s+(.+)$/.exec(line);
      if (bullet) {
        list.push(bullet[1]);
        index += 1;
        continue;
      }
      flushList();
      out.push(`<p>${inline(line)}</p>`);
      index += 1;
    }
    flushList();
    return out.join('');
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
        const oClass = item.orientation ? ` docling-${item.orientation}` : '';
        html.push(`<div class=\"table-container${oClass}\"><table>`);
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
        if (text) {
          const oClass = item.orientation ? ` class=\"docling-${item.orientation}\"` : '';
          html.push(`<p${oClass}>${text}</p>`);
        }
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

    const isHorizontal = (note as any).isVertical === false;
    const firstRowMatch = (note.description || "").match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    let colCount = 0;
    if (firstRowMatch) {
      const cells = firstRowMatch[1].match(/<t[dh][^>]*>/gi);
      colCount = cells ? cells.length : 0;
    }
    const isWide = isHorizontal || colCount > 3;
    let pageWidthPt = isWide ? 841.9 : 595.3;
    let pageHeightPt = isWide ? 595.3 : 841.9;
    if (colCount > 5) {
      pageWidthPt = Math.max(841.9, colCount * 135 + 72);
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
            size: ${pageWidthPt}pt ${pageHeightPt}pt;
            mso-page-orientation: ${isWide ? "landscape" : "portrait"};
            margin: 0.4in 0.4in 0.4in 0.4in;
            mso-header-margin: 28pt;
            mso-footer-margin: 28pt;
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
          table.structured-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 18pt;
            border: 1.5pt solid #CBD5E1;
          }
          table.structured-table td {
            padding: 9pt 14pt;
            border: 1pt solid #CBD5E1;
            vertical-align: middle;
          }
          .label-cell {
            width: 110pt;
            background-color: #F8FAFC;
            font-size: 9.5pt;
            font-weight: bold;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5pt;
          }
          .val-cell {
            background-color: #FFFFFF;
            font-size: 11pt;
            font-weight: bold;
            color: #1E293B;
          }
          .desc-container {
            border: 1.5pt solid #CBD5E1;
            margin-bottom: 18pt;
          }
          .desc-header {
            padding: 9pt 14pt;
            background-color: #F8FAFC;
            border-bottom: 1.5pt solid #CBD5E1;
            font-size: 9.5pt;
            font-weight: bold;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5pt;
          }
          .desc-body {
            padding: 16pt 18pt;
            font-size: 11pt;
            line-height: 1.65;
            color: #1E293B;
            background-color: #FFFFFF;
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
            mso-table-layout-alt: auto;
          }
          table th, table td {
            border: 1pt solid #CBD5E1;
            padding: 7pt 10pt;
            text-align: left;
            font-size: 10pt;
            word-break: break-word;
          }
          table th {
            background-color: #F1F5F9;
            font-weight: bold;
            color: #1E293B;
          }
          .table-file-badge {
            display: inline-block;
            background-color: #F1F5F9;
            border: 1pt solid #CBD5E1;
            padding: 3pt 6pt;
            border-radius: 4pt;
            font-size: 9pt;
            color: #334155;
            margin: 2pt 0;
          }
          .table-file-btn {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          <table class="structured-table">
            <tr>
              <td class="label-cell">PROJECT:</td>
              <td class="val-cell">${isProject ? this.escapeXml(projectLabel) : "Personal Note"}</td>
            </tr>
            <tr>
              <td class="label-cell">TITLE:</td>
              <td class="val-cell">${this.escapeXml(note.title || "Untitled Note")}</td>
            </tr>
          </table>

          <div class="desc-container">
            <div class="desc-header">DESCRIPTION</div>
            <div class="desc-body">
              ${note.description && note.description.trim() ? note.description : '<p style="color: #94A3B8; font-style: italic; margin: 0;">No description provided.</p>'}
            </div>
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

  private async generatePdfDoc(
    note: Note,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const safeTitle = (note.title || "Note").replace(/[/\\?%*:|"<>]/g, "_");
    const isProject = note.type === NoteType.PROJECT;
    const projectLabel = note.projectName || "Worksphere Project";

    return new Promise<{ buffer: Buffer; contentType: string; filename: string }>((resolve, reject) => {
      try {
        const isHorizontal = (note as any).isVertical === false;
        let pageWidth = isHorizontal ? 841.89 : 595.28;
        let pageHeight = isHorizontal ? 595.28 : 841.89;

        // Auto-detect wide tables to expand page width if necessary
        const firstRowMatch = (note.description || "").match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
        if (firstRowMatch) {
          const cells = firstRowMatch[1].match(/<t[dh][^>]*>/gi);
          const colCount = cells ? cells.length : 0;
          if (colCount > 5) {
            const tableNeededWidth = colCount * 115 + 80;
            if (tableNeededWidth > pageWidth) {
              pageWidth = tableNeededWidth;
            }
          }
        }

        const doc = new (PDFDocument as any)({
          size: [pageWidth, pageHeight],
          margin: 40,
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

        const margin = 40;
        const contentWidth = pageWidth - margin * 2;

        let currentY = 40;

        // Structured Table for Project and Title
        const labelWidth = 110;
        const valueWidth = contentWidth - labelWidth;
        const rowHeight = 32;

        // Project Row
        doc.rect(margin, currentY, labelWidth, rowHeight).fillAndStroke("#F8FAFC", "#CBD5E1");
        doc.rect(margin + labelWidth, currentY, valueWidth, rowHeight).fillAndStroke("#FFFFFF", "#CBD5E1");
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#475569").text("PROJECT", margin + 12, currentY + 10);
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#1E293B").text(isProject ? projectLabel : "Personal Note", margin + labelWidth + 12, currentY + 10, { width: valueWidth - 24, ellipsis: true });

        currentY += rowHeight;

        // Title Row
        doc.rect(margin, currentY, labelWidth, rowHeight).fillAndStroke("#F8FAFC", "#CBD5E1");
        doc.rect(margin + labelWidth, currentY, valueWidth, rowHeight).fillAndStroke("#FFFFFF", "#CBD5E1");
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#475569").text("TITLE", margin + 12, currentY + 10);
        doc.font("Helvetica-Bold").fontSize(11.5).fillColor("#1E293B").text(note.title || "Untitled Note", margin + labelWidth + 12, currentY + 9, { width: valueWidth - 24, ellipsis: true });

        currentY += rowHeight + 20;

        // Description Section Box
        const descHeaderHeight = 28;
        doc.rect(margin, currentY, contentWidth, descHeaderHeight).fillAndStroke("#F8FAFC", "#CBD5E1");
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#475569").text("DESCRIPTION", margin + 12, currentY + 9);

        currentY += descHeaderHeight;
        doc.y = currentY + 12;

        const descHtml = note.description || "";
        this.renderHtmlToPdf(doc, descHtml, margin, contentWidth, pageHeight);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

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
  async getAttachmentMetaAndStream(key: string, fileName?: string) {
    const storedKey = await this.resolveStoredAttachmentKey(key, fileName);
    const metaData = await this.documentUploaderService.getMetaData(storedKey);
    const dataStream = await this.documentUploaderService.downloadFile(storedKey);
    return { metaData, dataStream };
  }

  /**
   * Table chips keep the key from the moment of upload. If that object was
   * replaced by a later upload of the same file, serve the stored copy.
   */
  private async resolveStoredAttachmentKey(key: string, fileName?: string): Promise<string> {
    if (await this.attachmentObjectExists(key)) {
      return key;
    }

    const wanted = this.normalizeAttachmentName(fileName);
    if (!wanted) {
      throw new NotFoundException('File not found in storage');
    }

    const docs = await this.documentRepo.find({
      where: { refType: ReferenceType.NOTE_ATTACHMENT },
      order: { createdAt: 'DESC' },
    });

    for (const doc of docs) {
      const storedKey = doc.s3Key || doc.id;
      if (!storedKey || storedKey === key) continue;
      try {
        const meta = await this.documentUploaderService.getMetaData(storedKey);
        if (this.normalizeAttachmentName(meta?.filename) === wanted) {
          this.logger.warn(
            `Attachment ${key} is missing. Serving stored file ${storedKey} for "${fileName}".`,
          );
          return storedKey;
        }
      } catch {
        continue;
      }
    }

    throw new NotFoundException('File not found in storage');
  }

  private async attachmentObjectExists(key: string): Promise<boolean> {
    try {
      await this.documentUploaderService.getMetaData(key);
      return true;
    } catch (error: any) {
      const status = typeof error?.getStatus === 'function' ? error.getStatus() : error?.status;
      const detail = `${error?.name || ''} ${error?.message || ''}`;
      if (status === 404 || /NotFound|NoSuchKey|File not found in storage|Unknown/.test(detail)) {
        return false;
      }
      throw error;
    }
  }

  private normalizeAttachmentName(name?: string): string {
    return (name || '').replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
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
            const perms = await resolveInboxPermissionsForUser(this.inboxRepo, note.id, {
              employeeId,
              email: user?.email || '',
            });

            if (!perms) {
              throw new ForbiddenException('You do not have access to delete this attachment');
            }

            if (
              !hasNotePermission(perms, NotePermission.CanDelete) &&
              !hasNotePermission(perms, NotePermission.CanEdit)
            ) {
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
   * Attach stored file keys for a list without one storage lookup per note.
   * Opening a single note still loads full file names through populateAttachments.
   */
  private async attachStoredFiles(notes: Note[]): Promise<void> {
    const ids: number[] = [];
    const walkIds = (note: Note) => {
      if (note?.id) ids.push(note.id);
      note.subNotes?.forEach(walkIds);
    };
    notes.forEach(walkIds);
    const grouped = await this.documentUploaderService.getDocsForEntities(
      EntityType.NOTE,
      ids,
      ReferenceType.NOTE_ATTACHMENT,
    );
    const apply = (note: Note) => {
      note.attachments = grouped.get(note.id) || [];
      note.subNotes?.forEach(apply);
    };
    notes.forEach(apply);
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
