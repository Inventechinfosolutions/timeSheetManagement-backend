import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  HttpCode,
  HttpStatus,
  HttpException,
  ParseIntPipe,
  Req,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ProjectDocumentsService } from '../services/projectDocuments.service';
import { CreateProjectDocumentDto } from '../dto/create-project-document.dto';
import { UpdateProjectDocumentDto } from '../dto/update-project-document.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FileService } from '../../common/core/utils/fileType.utils';
import { UserType } from '../../users/enums/user-type.enum';

@ApiTags('Project Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('project-documents')
export class ProjectDocumentsController {
  private readonly logger = new Logger(ProjectDocumentsController.name);

  constructor(
    private readonly projectDocumentsService: ProjectDocumentsService,
    private readonly fileService: FileService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new project document' })
  @ApiResponse({ status: 201, description: 'Project document created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(
    @Body() createDto: CreateProjectDocumentDto,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    this.logger.log(`User ${loginId} creating project document: ${createDto.projectName}`);
    return await this.projectDocumentsService.create(createDto, loginId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all project documents (filtered by department for employees)' })
  @ApiResponse({ status: 200, description: 'List of project documents' })
  async findAll(@Req() req: any) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    const userRole = userContext?.role;
    const userType = userContext?.userType;
    this.logger.log(`User ${loginId} fetching all project documents`);
    return await this.projectDocumentsService.findAll(loginId, userRole, userType);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a project document by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Project document ID' })
  @ApiResponse({ status: 200, description: 'Project document found' })
  @ApiResponse({ status: 404, description: 'Project document not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    const userRole = userContext?.role;
    const userType = userContext?.userType;
    this.logger.log(`User ${loginId} fetching project document ${id}`);
    return await this.projectDocumentsService.findOne(id, loginId, userRole, userType);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a project document' })
  @ApiParam({ name: 'id', type: Number, description: 'Project document ID' })
  @ApiResponse({ status: 200, description: 'Project document updated successfully' })
  @ApiResponse({ status: 404, description: 'Project document not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateProjectDocumentDto,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    this.logger.log(`User ${loginId} updating project document ${id}`);
    return await this.projectDocumentsService.update(id, updateDto, loginId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project document' })
  @ApiParam({ name: 'id', type: Number, description: 'Project document ID' })
  @ApiResponse({ status: 204, description: 'Project document deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project document not found' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Deleting project document ${id}`);
    await this.projectDocumentsService.delete(id);
    return { message: 'Project document deleted successfully' };
  }

  @Post(':id/upload-photo')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload project photo' })
  @ApiParam({ name: 'id', type: Number, description: 'Project document ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photo: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('photo'))
  @ApiResponse({ status: 201, description: 'Project photo uploaded successfully' })
  @ApiResponse({ status: 404, description: 'Project document not found' })
  async uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() photo: Express.Multer.File,
  ) {
    if (!photo) {
      throw new HttpException('Photo file is required', HttpStatus.BAD_REQUEST);
    }

    await this.fileService.validateFileType(photo);
    
    // Check if it's an image
    const isImage = photo.mimetype.startsWith('image/');
    if (!isImage) {
      throw new HttpException('File must be an image', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`Uploading photo for project ${id}`);
    return await this.projectDocumentsService.uploadProjectPhoto(id, photo);
  }

  @Post(':id/upload-documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload multiple documents for a project' })
  @ApiParam({ name: 'id', type: Number, description: 'Project document ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'files', maxCount: 10 }]))
  @ApiResponse({ status: 201, description: 'Documents uploaded successfully' })
  @ApiResponse({ status: 404, description: 'Project document not found' })
  async uploadDocuments(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: { files?: Express.Multer.File[] },
  ) {
    const documents = files.files || [];

    if (documents.length === 0) {
      throw new HttpException('At least one file is required', HttpStatus.BAD_REQUEST);
    }

    // Validate all files
    for (const file of documents) {
      await this.fileService.validateFileType(file);
    }

    this.logger.log(`Uploading ${documents.length} document(s) for project ${id}`);
    return await this.projectDocumentsService.uploadDocuments(id, documents);
  }

  @Get(':id/files')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all files for a project' })
  @ApiParam({ name: 'id', type: Number, description: 'Project document ID' })
  @ApiResponse({ status: 200, description: 'List of project files' })
  @ApiResponse({ status: 404, description: 'Project document not found' })
  async getFiles(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    const userRole = userContext?.role;
    const userType = userContext?.userType;
    
    // Get project with files (includes access check)
    const project = await this.projectDocumentsService.findOne(id, loginId, userRole, userType);
    return project.files || [];
  }

  @Delete(':id/files/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file from a project' })
  @ApiParam({ name: 'id', type: Number, description: 'Project document ID' })
  @ApiParam({ name: 'key', type: String, description: 'File key' })
  @ApiResponse({ status: 204, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project document or file not found' })
  async deleteFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('key') key: string,
  ) {
    this.logger.log(`Deleting file ${key} from project ${id}`);
    await this.projectDocumentsService.deleteDocument(id, key);
    return { message: 'File deleted successfully' };
  }
}

