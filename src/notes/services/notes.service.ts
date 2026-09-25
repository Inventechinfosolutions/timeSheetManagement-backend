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
import { DocumentDetailsDto } from '../../common/document-uploader/dto/documentdetails.dto';

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    @InjectRepository(Note)
    private readonly noteRepo: Repository<Note>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  private extractUserInfo(user: any) {
    const userId = user?.id || user?.userId || null;
    const employeeId = user?.employeeId || user?.loginId || user?.aliasLoginName || null;
    const createdBy = user?.aliasLoginName || user?.fullName || user?.loginId || 'User';
    return { userId, employeeId, createdBy };
  }

  async createNote(
    createDto: CreateNoteDto,
    files: Express.Multer.File[] = [],
    user: any,
  ): Promise<Note> {
    try {
      const { userId, employeeId, createdBy } = this.extractUserInfo(user);

      const type = createDto.type || NoteType.PERSONAL;
      const projectName = type === NoteType.PROJECT ? (createDto.projectName || 'General Project') : null;

      const note = this.noteRepo.create({
        title: createDto.title,
        description: createDto.description || '',
        type,
        projectName,
        parentId: createDto.parentId || null,
        color: createDto.color || '#4318FF',
        isPinned: createDto.isPinned || false,
        userId,
        employeeId,
        createdBy,
        updatedBy: createdBy,
      });

      const savedNote = await this.noteRepo.save(note);

      // Handle sub-notes if provided initially in payload
      if (createDto.subNotes && Array.isArray(createDto.subNotes) && createDto.subNotes.length > 0) {
        let index = 0;
        for (const sub of createDto.subNotes) {
          if (sub && sub.title && sub.title.trim()) {
            const subNote = this.noteRepo.create({
              title: sub.title.trim(),
              description: sub.description || '',
              type,
              projectName,
              parentId: savedNote.id,
              color: createDto.color || '#4318FF',
              orderIndex: index++,
              userId,
              employeeId,
              createdBy,
              updatedBy: createdBy,
            });
            await this.noteRepo.save(subNote);
          }
        }
      }

      // Handle file attachments if any -> Upload directly to object_store
      if (files && files.length > 0) {
        await this.uploadFilesToObjectStore(savedNote.id, files);
      }

      return await this.findOne(savedNote.id, user);
    } catch (error) {
      this.logger.error(`Failed to create note: ${error.message}`, error.stack);
      throw new InternalServerErrorException(error.message || 'Failed to create note');
    }
  }

  async findAll(query: QueryNotesDto, user: any): Promise<{ data: Note[]; total: number }> {
    try {
      const { userId, employeeId } = this.extractUserInfo(user);

      const qb = this.noteRepo
        .createQueryBuilder('note')
        .leftJoinAndSelect('note.subNotes', 'subNote')
        .leftJoinAndSelect('subNote.subNotes', 'nestedSubNote')
        .where('note.parentId IS NULL'); // Only root notes at the top level

      // User scoping: users see their own notes
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

      // Search keyword across title, description, projectName, and sub-notes
      if (query.search && query.search.trim()) {
        const searchVal = `%${query.search.trim().toLowerCase()}%`;
        qb.andWhere(
          '(LOWER(note.title) LIKE :searchVal OR LOWER(note.description) LIKE :searchVal OR LOWER(note.projectName) LIKE :searchVal OR LOWER(subNote.title) LIKE :searchVal OR LOWER(subNote.description) LIKE :searchVal)',
          { searchVal },
        );
      }

      // Sort: pinned notes first, then newest updated
      qb.orderBy('note.isPinned', 'DESC')
        .addOrderBy('note.updatedAt', 'DESC')
        .addOrderBy('subNote.orderIndex', 'ASC')
        .addOrderBy('subNote.createdAt', 'ASC');

      const [data, total] = await qb.getManyAndCount();

      // Attach documents from object_store for each note and its sub-notes
      for (const note of data) {
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

      return { data, total };
    } catch (error) {
      this.logger.error(`Failed to fetch notes: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch notes');
    }
  }

  async findOne(id: number, user: any): Promise<Note> {
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

      return note;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to find note ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve note');
    }
  }

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

  async removeNote(id: number, user: any): Promise<{ message: string }> {
    try {
      const note = await this.noteRepo.findOne({
        where: { id },
        relations: ['subNotes'],
      });

      if (!note) {
        throw new NotFoundException(`Note with ID ${id} not found`);
      }

      // Delete attachments from object_store for root note
      const rootDocs = await this.documentUploaderService.getAllDocs(
        EntityType.NOTE,
        note.id,
        ReferenceType.NOTE_ATTACHMENT,
        note.id,
      );
      for (const doc of rootDocs) {
        if (doc.key) {
          try {
            await this.documentUploaderService.deleteDoc(doc.key);
          } catch (e) {
            this.logger.warn(`Could not delete doc ${doc.key}: ${e.message}`);
          }
        }
      }

      // Delete attachments from object_store for sub-notes
      if (note.subNotes) {
        for (const sub of note.subNotes) {
          const subDocs = await this.documentUploaderService.getAllDocs(
            EntityType.NOTE,
            sub.id,
            ReferenceType.NOTE_ATTACHMENT,
            sub.id,
          );
          for (const doc of subDocs) {
            if (doc.key) {
              try {
                await this.documentUploaderService.deleteDoc(doc.key);
              } catch (e) {
                this.logger.warn(`Could not delete doc ${doc.key}: ${e.message}`);
              }
            }
          }
        }
      }

      await this.noteRepo.remove(note);
      return { message: 'Note deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to delete note ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete note');
    }
  }

  async createSubNote(
    parentId: number,
    createSubNoteDto: CreateSubNoteDto,
    files: Express.Multer.File[] = [],
    user: any,
  ): Promise<Note> {
    try {
      const { userId, employeeId, createdBy } = this.extractUserInfo(user);

      const parentNote = await this.noteRepo.findOne({ where: { id: parentId } });
      if (!parentNote) {
        throw new NotFoundException(`Parent note with ID ${parentId} not found`);
      }

      const count = await this.noteRepo.count({ where: { parentId } });

      const subNote = this.noteRepo.create({
        title: createSubNoteDto.title,
        description: createSubNoteDto.description || '',
        type: parentNote.type,
        projectName: parentNote.projectName,
        parentId: parentNote.id,
        color: createSubNoteDto.color || parentNote.color || '#4318FF',
        orderIndex: createSubNoteDto.orderIndex !== undefined ? createSubNoteDto.orderIndex : count,
        userId,
        employeeId,
        createdBy,
        updatedBy: createdBy,
      });

      const savedSubNote = await this.noteRepo.save(subNote);

      if (files && files.length > 0) {
        await this.uploadFilesToObjectStore(savedSubNote.id, files);
      }

      return await this.findOne(savedSubNote.id, user);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to create sub-note for parent ${parentId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create sub-note');
    }
  }

  async togglePin(id: number, user: any): Promise<Note> {
    const note = await this.noteRepo.findOne({ where: { id } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found`);
    }
    note.isPinned = !note.isPinned;
    await this.noteRepo.save(note);
    return await this.findOne(id, user);
  }

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

  async getStats(user: any) {
    try {
      const { userId, employeeId } = this.extractUserInfo(user);

      const qb = this.noteRepo
        .createQueryBuilder('note')
        .where('note.parentId IS NULL');

      if (userId || employeeId) {
        qb.andWhere('(note.userId = :userId OR note.employeeId = :employeeId)', {
          userId,
          employeeId,
        });
      }

      const allNotes = await qb.getMany();
      const totalNotes = allNotes.length;
      const personalNotes = allNotes.filter((n) => n.type === NoteType.PERSONAL).length;
      const projectNotes = allNotes.filter((n) => n.type === NoteType.PROJECT).length;
      const pinnedNotes = allNotes.filter((n) => n.isPinned).length;

      return {
        totalNotes,
        personalNotes,
        projectNotes,
        pinnedNotes,
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

  // --- Attachments in object_store ---

  async uploadAttachments(
    noteId: number,
    files: Express.Multer.File[],
  ): Promise<any[]> {
    const note = await this.noteRepo.findOne({ where: { id: noteId } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${noteId} not found`);
    }

    return await this.uploadFilesToObjectStore(noteId, files);
  }

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
      } catch (err) {
        this.logger.error(`Failed to upload file ${file.originalname} to object_store: ${err.message}`);
      }
    }
    return results;
  }

  async getAttachmentMetaAndStream(key: string) {
    const metaData = await this.documentUploaderService.getMetaData(key);
    const dataStream = await this.documentUploaderService.downloadFile(key);
    return { metaData, dataStream };
  }

  async deleteAttachment(key: string): Promise<{ message: string }> {
    await this.documentUploaderService.deleteDoc(key);
    return { message: 'Document deleted successfully' };
  }
}
