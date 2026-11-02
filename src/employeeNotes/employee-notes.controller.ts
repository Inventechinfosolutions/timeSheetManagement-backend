import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, Res, Logger, HttpCode, HttpStatus, HttpException,
  UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { EmployeeNotesService } from './employee-notes.service';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto } from './dto/update-employee-note.dto';
import { ExportNoteDescriptionDto } from './dto/export-employee-note.dto';
import { FileService } from '../common/core/utils/fileType.utils';
import { DocumentUploaderService } from '../common/document-uploader/services/document-uploader.service';
import { EntityType, ReferenceType } from '../common/document-uploader/models/documentmetainfo.model';
import { NO_CACHE_HEADERS } from '../common/utils/no-cache-headers';
import { Readable } from 'stream';

const NOTE_FILE_MAX_BYTES = 5 * 1024 * 1024;
const NOTE_FILE_EXT = /\.(pdf|doc|docx|xls|xlsx|png|jpe?g|webp|gif)$/i;

@ApiTags('Employee Notes')
@Controller('employee-notes')
export class EmployeeNotesController {
  private readonly logger = new Logger(EmployeeNotesController.name);

  constructor(
    private readonly employeeNotesService: EmployeeNotesService,
    private readonly fileService: FileService,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  // ---------------------------------------------------------------------------
  // Static routes first so they are never captured by :employeeId
  // ---------------------------------------------------------------------------

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export note description as PDF, Word (.doc), or text' })
  async exportDescription(
    @Body() dto: ExportNoteDescriptionDto,
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Exporting note description in format=${dto.format}, title=${dto.title || 'untitled'}`);
      const { buffer, filename, contentType } = await this.employeeNotesService.exportDescription(dto);
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    } catch (err: any) {
      this.logger.error(`Export failed: ${err.message}`, err.stack);
      if (err instanceof HttpException) throw err;
      throw new HttpException(err.message || 'Failed to export document', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('upload-file/entityId/:entityId/refId/:refId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 10 }]))
  @ApiOperation({ summary: 'Upload note documents to MinIO (Leave Management pattern)' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID (Note ID)' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID (Note ID)' })
  @ApiQuery({ name: 'refType', enum: ReferenceType, required: true })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Documents uploaded successfully' })
  async uploadDocument(
    @UploadedFiles() docs: { file?: Express.Multer.File[] },
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('refType') refType: ReferenceType,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Uploading document for entity: ${entityId}, refId: ${refId}`);
      if (entityId === 'NaN' || isNaN(Number(entityId))) {
        throw new HttpException('Invalid entityId: must be a numeric string.', HttpStatus.BAD_REQUEST);
      }
      if (refId === 'NaN' || isNaN(Number(refId))) {
        throw new HttpException('Invalid refId: must be a numeric string.', HttpStatus.BAD_REQUEST);
      }

      const documents = docs?.file || [];
      if (!refType) {
        throw new HttpException('Reference type is required', HttpStatus.BAD_REQUEST);
      }
      if (documents.length === 0) {
        throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
      }

      for (const file of documents) {
        if (!NOTE_FILE_EXT.test(file.originalname || '')) {
          throw new HttpException(
            'Only PDF, Word, Excel, and images are allowed',
            HttpStatus.BAD_REQUEST,
          );
        }
        await this.fileService.validateFileType(file, NOTE_FILE_MAX_BYTES);
      }

      return await this.employeeNotesService.uploadDocument(documents, refType, +refId, entityType, +entityId);
    } catch (error: any) {
      this.logger.error(`Error uploading document: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/get-files')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all files for an employee note from MinIO / object_store' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID (Note ID)' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID (Note ID)' })
  @ApiQuery({ name: 'refType', enum: ReferenceType, required: false })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @ApiResponse({ status: 200, description: 'Files retrieved successfully' })
  async getFilesStandard(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('refType') referenceType: ReferenceType,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Fetching files for entity: ${entityId}, refId: ${refId}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      return await this.employeeNotesService.getAllFiles(entityType, +entityId, +refId, referenceType);
    } catch (error: any) {
      this.logger.error(`Error fetching files: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/download-file')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Download an employee note file from MinIO' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID (Note ID)' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID (Note ID)' })
  @ApiQuery({ name: 'key', type: String, required: true })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @ApiResponse({ status: 200, description: 'File binary stream download' })
  async downloadFileStandard(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Downloading file with key: ${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      await this.employeeNotesService.validateEntity(entityType, +entityId, +refId);

      const metaData = await this.documentUploaderService.getMetaData(key);
      const dataStream = await this.documentUploaderService.downloadFile(key);

      res.set({
        ...NO_CACHE_HEADERS,
        'Content-Type': metaData.mimetype,
        'Content-Disposition': `attachment; filename="${metaData.filename}"`,
        'Content-Length': dataStream.ContentLength || undefined,
      });

      if (dataStream.Body instanceof Readable) {
        dataStream.Body.pipe(res);
      } else if (dataStream.Body) {
        const buffer = await dataStream.Body.transformToByteArray();
        res.send(Buffer.from(buffer));
      } else {
        throw new HttpException('File content not found', HttpStatus.NOT_FOUND);
      }
    } catch (error: any) {
      this.logger.error(`Error downloading file: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'View an employee note file inline from MinIO' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID (Note ID)' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID (Note ID)' })
  @ApiQuery({ name: 'key', type: String, required: true })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @ApiResponse({ status: 200, description: 'File binary stream inline' })
  async viewFileStandard(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Viewing file with key: ${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      await this.employeeNotesService.validateEntity(entityType, +entityId, +refId);

      const metaData = await this.documentUploaderService.getMetaData(key);
      const dataStream = await this.documentUploaderService.downloadFile(key);

      res.set({
        ...NO_CACHE_HEADERS,
        'Content-Type': metaData.mimetype,
        'Content-Disposition': `inline; filename="${metaData.filename}"`,
        'Content-Length': dataStream.ContentLength || undefined,
      });

      if (dataStream.Body instanceof Readable) {
        dataStream.Body.pipe(res);
      } else if (dataStream.Body) {
        const buffer = await dataStream.Body.transformToByteArray();
        res.send(Buffer.from(buffer));
      } else {
        throw new HttpException('File content not found', HttpStatus.NOT_FOUND);
      }
    } catch (error: any) {
      this.logger.error(`Error viewing file: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete('entityId/:entityId/refId/:refId/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an employee note file from MinIO and object_store' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID (Note ID)' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID (Note ID)' })
  @ApiQuery({ name: 'key', type: String, required: true })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  async deleteFileStandard(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Deleting file with key: ${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      return await this.employeeNotesService.deleteDocument(entityType, +entityId, +refId, key);
    } catch (error: any) {
      this.logger.error(`Error deleting file: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Notes CRUD
  // ---------------------------------------------------------------------------

  @Post()
  @ApiOperation({ summary: 'Create a new employee note' })
  async create(@Body() dto: CreateEmployeeNoteDto) {
    return this.employeeNotesService.create(dto);
  }

  @Get(':employeeId/:id/download')
  @ApiOperation({ summary: 'Download a note by id as PDF or Word (.doc)' })
  async downloadNote(
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Query('format') format: string = 'pdf',
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Downloading note id=${id} for employee=${employeeId} in format=${format}`);
      const { buffer, filename, contentType } = await this.employeeNotesService.exportNoteById(employeeId, id, format);
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    } catch (err: any) {
      this.logger.error(`Download failed: ${err.message}`, err.stack);
      if (err instanceof HttpException) throw err;
      throw new HttpException(err.message || 'Failed to download document', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':employeeId/:id')
  @ApiOperation({ summary: 'Get a single note by id for an employee' })
  async findOne(
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.employeeNotesService.findOne(employeeId, id);
  }

  @Put(':employeeId/:id')
  @ApiOperation({ summary: 'Update an employee note' })
  async update(
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeNoteDto,
  ) {
    return this.employeeNotesService.update(employeeId, id, dto);
  }

  @Delete(':employeeId/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an employee note' })
  async remove(
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    await this.employeeNotesService.remove(employeeId, id);
    return { message: 'Note deleted successfully' };
  }

  @Get(':employeeId')
  @ApiOperation({ summary: 'Get all notes for an employee' })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by project name or title' })
  async findAll(
    @Param('employeeId') employeeId: string,
    @Query('search') search?: string,
  ) {
    return this.employeeNotesService.findAllForEmployee(employeeId, search);
  }
}
