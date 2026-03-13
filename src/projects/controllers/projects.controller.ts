import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Logger,
  UseGuards,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { ProjectsService } from '../services/projects.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { BufferedFile } from '../../common/s3-client/file.model';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { Response } from 'express';
import { Readable } from 'stream';
import { NO_CACHE_HEADERS } from '../../common/utils/no-cache-headers';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { FileService } from '../../common/core/utils/fileType.utils';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly fileService: FileService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project with optional image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['name'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @UploadedFile() file: BufferedFile,
  ) {
    this.logger.log(`Received request to create project: ${createProjectDto.projectName}`);
    return await this.projectsService.create(createProjectDto, file);
  }

  @Get()
  @ApiOperation({ summary: 'Get all projects' })
  async findAll() {
    this.logger.log('Received request to fetch all projects');
    return await this.projectsService.findAll();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  async remove(@Param('id') id: string) {
    this.logger.log(`Received request to delete project: ${id}`);
    return await this.projectsService.remove(+id);
  }

  @Post('upload-file/entityId/:entityId/refId/:refId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload project documents' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 10 }]))
  async uploadDocument(
    @UploadedFiles() docs: { file?: Express.Multer.File[] },
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('refType') refType: ReferenceType,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Uploading documents for Project ${entityId}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId', HttpStatus.BAD_REQUEST);
      }

      const documents = docs.file || [];
      if (documents.length === 0) throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);

      for (const file of documents) {
        await this.fileService.validateFileType(file);
      }

      return await this.projectsService.uploadDocument(documents, refType, +refId, entityType, +entityId);
    } catch (error) {
      this.logger.error(`Error uploading document: ${error.message}`);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/get-files')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get documents for a project' })
  async getFiles(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('refType') referenceType: ReferenceType,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId', HttpStatus.BAD_REQUEST);
      }
      return await this.projectsService.getAllFiles(entityType, +entityId, +refId, referenceType);
    } catch (error) {
      this.logger.error(`Error fetching files: ${error.message}`);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/download-file')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Download a project document' })
  async downloadFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Res() res: Response,
  ) {
    try {
      await this.projectsService.validateProject(+entityId);
      const metaData = await this.documentUploaderService.getMetaData(key);
      const dataStream = await this.documentUploaderService.downloadFile(key);

      res.set({
        ...NO_CACHE_HEADERS,
        'Content-Type': metaData.mimetype,
        'Content-Disposition': `attachment; filename="${metaData.filename}"`,
      });

      if (dataStream.Body instanceof Readable) {
        dataStream.Body.pipe(res);
      } else if (dataStream.Body) {
        const buffer = await (dataStream.Body as any).transformToByteArray();
        res.send(Buffer.from(buffer));
      }
    } catch (error) {
      this.logger.error(`Error downloading file: ${error.message}`);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'View/Preview a project document' })
  async viewFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Res() res: Response,
  ) {
    try {
      await this.projectsService.validateProject(+entityId);
      const metaData = await this.documentUploaderService.getMetaData(key);
      const dataStream = await this.documentUploaderService.downloadFile(key);

      res.set({
        ...NO_CACHE_HEADERS,
        'Content-Type': metaData.mimetype,
        'Content-Disposition': `inline; filename="${metaData.filename}"`,
      });

      if (dataStream.Body instanceof Readable) {
        dataStream.Body.pipe(res);
      } else if (dataStream.Body) {
        const buffer = await (dataStream.Body as any).transformToByteArray();
        res.send(Buffer.from(buffer));
      }
    } catch (error) {
      this.logger.error(`Error viewing file: ${error.message}`);
      throw error;
    }
  }

  @Delete('entityId/:entityId/refId/:refId/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a single project document' })
  async deleteFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      return await this.projectsService.deleteDocument(entityType, +entityId, +refId, key);
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`);
      throw error;
    }
  }
}
