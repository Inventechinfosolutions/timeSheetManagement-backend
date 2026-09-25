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
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotesService } from '../services/notes.service';
import { CreateNoteDto } from '../dto/create-note.dto';
import { UpdateNoteDto } from '../dto/update-note.dto';
import { CreateSubNoteDto } from '../dto/create-sub-note.dto';
import { QueryNotesDto } from '../dto/query-notes.dto';
import { NO_CACHE_HEADERS } from '../../common/utils/no-cache-headers';
import { Response } from 'express';
import { Readable } from 'stream';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  private readonly logger = new Logger(NotesController.name);

  constructor(private readonly notesService: NotesService) {}

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
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

    const createDto: CreateNoteDto = {
      title: body.title,
      description: body.description,
      type: body.type,
      projectName: body.projectName,
      parentId: body.parentId ? Number(body.parentId) : undefined,
      color: body.color,
      isPinned: body.isPinned === 'true' || body.isPinned === true,
      subNotes,
    };

    return await this.notesService.createNote(createDto, files, req.user);
  }

  @Get()
  async findAll(@Query() query: QueryNotesDto, @Req() req: any) {
    return await this.notesService.findAll(query, req.user);
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    return await this.notesService.getStats(req.user);
  }

  @Get('projects')
  async getProjects(@Req() req: any) {
    return await this.notesService.getDistinctProjects(req.user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.notesService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateNoteDto,
    @Req() req: any,
  ) {
    return await this.notesService.updateNote(id, updateDto, req.user);
  }

  @Patch(':id/pin')
  async togglePin(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.notesService.togglePin(id, req.user);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.notesService.removeNote(id, req.user);
  }

  @Post(':id/sub-notes')
  @UseInterceptors(AnyFilesInterceptor())
  async createSubNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    const createSubNoteDto: CreateSubNoteDto = {
      title: body.title,
      description: body.description,
      orderIndex: body.orderIndex ? Number(body.orderIndex) : undefined,
      color: body.color,
    };

    return await this.notesService.createSubNote(id, createSubNoteDto, files, req.user);
  }

  @Post(':id/attachments')
  @UseInterceptors(AnyFilesInterceptor())
  async uploadAttachments(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return await this.notesService.uploadAttachments(id, files);
  }

  @Get('attachments/:key/download')
  async downloadAttachment(
    @Param('key') key: string,
    @Res() res: Response,
  ) {
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
  async viewAttachment(
    @Param('key') key: string,
    @Res() res: Response,
  ) {
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
  async deleteAttachment(@Param('key') key: string) {
    return await this.notesService.deleteAttachment(key);
  }
}
