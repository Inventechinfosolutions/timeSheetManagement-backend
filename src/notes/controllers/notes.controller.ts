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

@ApiTags('Notes')
@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  private readonly logger = new Logger(NotesController.name);

  constructor(private readonly notesService: NotesService) {}

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
  @ApiOperation({ summary: 'Extract text contents from uploaded files' })
  async extractText(
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    const file = files[0];
    const extractedText = await this.notesService.extractFileText(file);
    return {
      filename: file.originalname,
      description: extractedText,
      extractedText,
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

  @Post(':id/attachments')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Upload attachments to existing note' })
  async uploadAttachments(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return await this.notesService.uploadAttachments(id, files);
  }
}
