import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Logger,
  HttpException,
  BadRequestException,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotesService } from '../services/notes.service';
import { CreateNoteDto } from '../dto/create-note.dto';
import { UpdateNoteDto } from '../dto/update-note.dto';
import { CreateSubNoteDto } from '../dto/create-sub-note.dto';
import { QueryNotesDto } from '../dto/query-notes.dto';
import { NO_CACHE_HEADERS } from '../../common/utils/no-cache-headers';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Readable } from 'stream';

import { Inject, forwardRef } from '@nestjs/common';
import { InboxService } from '../../inbox/services/inbox.service';

@ApiTags('Notes')
@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  private readonly logger = new Logger(NotesController.name);

  constructor(
    private readonly notesService: NotesService,
    @Inject(forwardRef(() => InboxService))
    private readonly inboxService: InboxService,
  ) {}

  // =========================================================================
  // 1. Static & Special Sub-path Endpoints (MUST come before :id wildcard routes)
  // =========================================================================

  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Direct upload dropped desktop files or attachments' })
  async uploadDirect(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Req() req: any,
  ) {
    const noteId = body?.noteId ? Number(body.noteId) : 0;
    return await this.notesService.uploadDirectFiles(noteId, files, req.user);
  }

  @Post('extract')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Extract text contents and styled HTML from uploaded files via Docling' })
  async extractText(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body?: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    const file = files[0];
    const useOcr = body?.useOcr === 'true' || body?.useOcr === true;
    const bodyOnly = body?.bodyOnly !== 'false' && body?.bodyOnly !== false;

    const result = await this.notesService.extractFileContent(file, { useOcr, bodyOnly });
    return {
      filename: file.originalname,
      description: result.html || result.text || '',
      html: result.html || '',
      markdown: result.markdown || '',
      json: result.json || null,
      extractedText: result.html || result.text || '',
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get statistics of notes' })
  async getStats(@Req() req: any) {
    return await this.notesService.getStats(req.user);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Get distinct project names from project notes' })
  async getProjects(@Req() req: any) {
    return await this.notesService.getDistinctProjects(req.user);
  }

  @Get('attachments/:key/download')
  @ApiOperation({ summary: 'Download note attachment by file key' })
  async downloadAttachment(@Param('key') key: string, @Res() res: Response) {
    const { metaData, dataStream } = await this.notesService.getAttachmentMetaAndStream(key);

    res.set({
      ...NO_CACHE_HEADERS,
      'Content-Type': metaData.mimetype || metaData['content-type'] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${metaData.filename || 'download'}"`,
      'Content-Length': dataStream.ContentLength || undefined,
    });

    if (dataStream.Body instanceof Readable) {
      dataStream.Body.pipe(res);
    } else if (dataStream.Body) {
      const buffer = await (dataStream.Body as any).transformToByteArray();
      res.send(Buffer.from(buffer));
    } else {
      throw new HttpException('File content not found', HttpStatus.NOT_FOUND);
    }
  }

  @Get('attachments/:key/view')
  @ApiOperation({ summary: 'View/Preview note attachment by file key' })
  async viewAttachment(@Param('key') key: string, @Res() res: Response) {
    const { metaData, dataStream } = await this.notesService.getAttachmentMetaAndStream(key);

    res.set({
      ...NO_CACHE_HEADERS,
      'Content-Type': metaData.mimetype || metaData['content-type'] || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${metaData.filename || 'file'}"`,
      'Content-Length': dataStream.ContentLength || undefined,
    });

    if (dataStream.Body instanceof Readable) {
      dataStream.Body.pipe(res);
    } else if (dataStream.Body) {
      const buffer = await (dataStream.Body as any).transformToByteArray();
      res.send(Buffer.from(buffer));
    } else {
      throw new HttpException('File content not found', HttpStatus.NOT_FOUND);
    }
  }

  @Delete('attachments/:key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete attachment from object_store and storage' })
  async deleteAttachment(@Param('key') key: string) {
    this.logger.log(`Received request to delete attachment: ${key}`);
    return await this.notesService.deleteAttachment(key);
  }

  // =========================================================================
  // 2. Collection Level Endpoints
  // =========================================================================

  @Get()
  @ApiOperation({ summary: 'Get all notes matching filter query' })
  async findAll(@Query() query: QueryNotesDto, @Req() req: any) {
    return await this.notesService.findAll(query, req.user);
  }

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Create a new note with optional attachments and sub-notes' })
  async create(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    this.logger.log(`Creating new note by user: ${req.user?.aliasLoginName || req.user?.loginId}`);

    // In multipart form-data, subNotes may be a JSON string or array
    let subNotes = body.subNotes;
    if (typeof subNotes === 'string') {
      try {
        subNotes = JSON.parse(subNotes);
      } catch (e) {
        subNotes = [];
      }
    }

    // In multipart form-data, attachmentKeys may be a JSON string or array
    let attachmentKeys = body.attachmentKeys;
    if (typeof attachmentKeys === 'string') {
      try {
        attachmentKeys = JSON.parse(attachmentKeys);
      } catch (e) {
        attachmentKeys = [attachmentKeys];
      }
    }

    const createDto: CreateNoteDto = {
      title: body.title,
      description: body.description,
      type: body.type,
      projectName: body.projectName,
      parentId: body.parentId ? Number(body.parentId) : undefined,
      color: body.color,
      isPinned: body.isPinned === 'true' || body.isPinned === true,
      subNotes,
      attachmentKeys: Array.isArray(attachmentKeys) ? attachmentKeys : undefined,
    };

    return await this.notesService.createNote(createDto, files, req.user);
  }

  // =========================================================================
  // 3. Parameterized Item Endpoints (:id)
  // =========================================================================

  @Get(':id/download')
  @ApiOperation({ summary: 'Download or export note document (PDF or Word)' })
  async downloadNote(
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.notesService.exportNoteDocument(id, format || 'pdf', req.user);

    res.set({
      ...NO_CACHE_HEADERS,
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
      'Content-Length': result.buffer.length,
    });

    res.send(result.buffer);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export note document (alias for download)' })
  async exportNote(
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    return this.downloadNote(id, format, req.user, res);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single note by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.notesService.findOne(id, req.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update note details' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateNoteDto,
    @Req() req: any,
  ) {
    return await this.notesService.updateNote(id, updateDto, req.user);
  }

  @Patch(':id/pin')
  @ApiOperation({ summary: 'Toggle note pinned state' })
  async togglePin(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.notesService.togglePin(id, req.user);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Toggle note archived state' })
  async toggleArchive(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.notesService.toggleArchive(id, req.user);
  }

  @Patch(':id/auto-save')
  @ApiOperation({ summary: 'Update note auto-save setting' })
  async updateAutoSave(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    const autoSave = body.autoSave === true || body.autoSave === 'true';
    return await this.notesService.updateAutoSave(id, autoSave, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete note and all nested sub-notes and attachments' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.notesService.removeNote(id, req.user);
  }

  @Post(':id/sub-notes')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Create a sub-note under an existing note' })
  async createSubNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    let attachmentKeys = body.attachmentKeys;
    if (typeof attachmentKeys === 'string') {
      try {
        attachmentKeys = JSON.parse(attachmentKeys);
      } catch (e) {
        attachmentKeys = [attachmentKeys];
      }
    }

    const createSubNoteDto: CreateSubNoteDto = {
      title: body.title,
      description: body.description,
      orderIndex: body.orderIndex !== undefined && body.orderIndex !== '' ? Number(body.orderIndex) : undefined,
      color: body.color,
      attachmentKeys: Array.isArray(attachmentKeys) ? attachmentKeys : undefined,
    };

    return await this.notesService.createSubNote(id, createSubNoteDto, files, req.user);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send note to recipients, creating inbox entries and notifications' })
  async sendNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    let recipients = body.recipients;
    if (typeof recipients === 'string') {
      try {
        recipients = JSON.parse(recipients);
      } catch (e) {
        recipients = recipients.split(',').map((s: string) => s.trim());
      }
    }
    if (!recipients && (body.to || body.email)) {
      recipients = [body.to || body.email];
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new BadRequestException('At least one recipient email or employee ID is required');
    }

    return await this.inboxService.sendNote(
      {
        notesId: id,
        recipients,
        subject: body.subject,
        customMessage: body.customMessage || body.message,
        attachmentKeys: body.attachmentKeys,
      },
      req.user,
    );
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Alias for send note to recipients' })
  async shareNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    return await this.sendNote(id, body, req);
  }
}

