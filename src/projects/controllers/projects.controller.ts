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
import { ProjectsService } from '../services/projects.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FileService } from '../../common/core/utils/fileType.utils';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly fileService: FileService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(
    @Body() createDto: CreateProjectDto,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    const userRole = userContext?.role;
    const userType = userContext?.userType;
    
    this.logger.log(`User ${loginId} creating project: ${createDto.projectName}`);
    return await this.projectsService.create(createDto, loginId, userRole, userType);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all projects (filtered by department for employees)' })
  @ApiResponse({ status: 200, description: 'List of projects' })
  async findAll(@Req() req: any) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    const userRole = userContext?.role;
    const userType = userContext?.userType;
    
    this.logger.log(`User ${loginId} fetching all projects`);
    return await this.projectsService.findAll(loginId, userRole, userType);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a project by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project found' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    const userRole = userContext?.role;
    const userType = userContext?.userType;
    
    this.logger.log(`User ${loginId} fetching project ${id}`);
    return await this.projectsService.findOne(id, loginId, userRole, userType);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateProjectDto,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    
    this.logger.log(`User ${loginId} updating project ${id}`);
    return await this.projectsService.update(id, updateDto, loginId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project' })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID' })
  @ApiResponse({ status: 204, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Deleting project ${id}`);
    await this.projectsService.delete(id);
    return { message: 'Project deleted successfully' };
  }

  @Post(':id/upload-photo')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload project photo' })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID' })
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
  @ApiResponse({ status: 404, description: 'Project not found' })
  async uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() photo: Express.Multer.File,
  ) {
    if (!photo) {
      throw new HttpException('Photo file is required', HttpStatus.BAD_REQUEST);
    }

    await this.fileService.validateFileType(photo);
    
    const isImage = photo.mimetype.startsWith('image/');
    if (!isImage) {
      throw new HttpException('File must be an image', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`Uploading photo for project ${id}`);
    return await this.projectsService.uploadPhoto(id, photo);
  }

  @Post(':id/upload-documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload multiple documents for a project (only if project has no models)' })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID' })
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
  @UseInterceptors(FileFieldsInterceptor([{ name: 'files', maxCount: 20 }]))
  @ApiResponse({ status: 201, description: 'Documents uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - project has models' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async uploadDocuments(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: { files?: Express.Multer.File[] },
  ) {
    const documents = files.files || [];

    if (documents.length === 0) {
      throw new HttpException('At least one file is required', HttpStatus.BAD_REQUEST);
    }

    for (const file of documents) {
      await this.fileService.validateFileType(file);
    }

    this.logger.log(`Uploading ${documents.length} document(s) for project ${id}`);
    return await this.projectsService.uploadDocuments(id, documents);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attachment from a project' })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID' })
  @ApiParam({ name: 'attachmentId', type: Number, description: 'Attachment ID' })
  @ApiResponse({ status: 204, description: 'Attachment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async deleteAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    this.logger.log(`Deleting attachment ${attachmentId} from project ${id}`);
    await this.projectsService.deleteAttachment(id, attachmentId);
    return { message: 'Attachment deleted successfully' };
  }
}
