import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from '../entities/note.entity';
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
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
    private readonly documentUploaderService: DocumentUploaderService,
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
      const { createdBy } = this.extractUserInfo(user);
      const note = await this.noteRepo.findOne({ where: { id } });

      if (!note) {
        throw new NotFoundException(`Note with ID ${id} not found`);
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
      if (updateDto.orderIndex !== undefined) note.orderIndex = updateDto.orderIndex;

      note.updatedBy = createdBy;

      await this.noteRepo.save(note);
      return await this.findOne(id, user);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to update note ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update note');
    }
  }

  /**
   * Delete a note along with its sub-notes and cleanup all associated attachments in object_store.
   */
  async removeNote(id: number, user: any): Promise<{ message: string }> {
    try {
      const note = await this.noteRepo.findOne({
        where: { id },
        relations: ['subNotes'],
      });

      if (!note) {
        throw new NotFoundException(`Note with ID ${id} not found`);
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
      if (error instanceof NotFoundException) throw error;
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
        .andWhere("note.projectName != ''");

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
   * Retrieve overall note statistics (counts for total, personal, project, pinned).
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
        personalNotes: allNotes.filter((n) => n.type === NoteType.PERSONAL).length,
        projectNotes: allNotes.filter((n) => n.type === NoteType.PROJECT).length,
        pinnedNotes: allNotes.filter((n) => n.isPinned).length,
        totalAttachments: 0,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch note stats: ${error.message}`, error.stack);
      return {
        totalNotes: 0,
        personalNotes: 0,
        projectNotes: 0,
        pinnedNotes: 0,
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
   * Extract text content from a single file.
   */
  async extractFileText(file: Express.Multer.File): Promise<string> {
    return '';
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
   */
  async deleteAttachment(key: string): Promise<{ message: string }> {
    try {
      this.logger.log(`Deleting attachment: ${key}`);
      const doc = await this.documentRepo.findOne({
        where: [{ id: key }, { s3Key: key }],
      });

      if (doc) {
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
      }

      await this.documentUploaderService.deleteDoc(key);
      return { message: 'Document deleted successfully' };
    } catch (error: any) {
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
