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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ProjectModelsService } from '../services/project-models.service';
import { CreateModelDto } from '../dto/create-model.dto';
import { UpdateModelDto } from '../dto/update-model.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FileService } from '../../common/core/utils/fileType.utils';

@ApiTags('Project Models')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/models')
export class ProjectModelsController {
  private readonly logger = new Logger(ProjectModelsController.name);

  constructor(
    private readonly projectModelsService: ProjectModelsService,
    private readonly fileService: FileService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new model within a project' })
  @ApiParam({ name: 'projectId', type: Number, description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Model created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() createDto: Omit<CreateModelDto, 'projectId'>,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    
    const fullDto: CreateModelDto = {
      ...createDto,
      projectId,
    };
    
    this.logger.log(`User ${loginId} creating model in project ${projectId}`);
    return await this.projectModelsService.create(fullDto, loginId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all models for a project' })
  @ApiParam({ name: 'projectId', type: Number, description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'List of models' })
  async findByProject(@Param('projectId', ParseIntPipe) projectId: number) {
    this.logger.log(`Fetching models for project ${projectId}`);
    return await this.projectModelsService.findByProject(projectId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a model by ID' })
  @ApiParam({ name: 'projectId', type: Number, description: 'Project ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Model ID' })
  @ApiResponse({ status: 200, description: 'Model found' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Fetching model ${id}`);
    return await this.projectModelsService.findOne(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a model' })
  @ApiParam({ name: 'projectId', type: Number, description: 'Project ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Model ID' })
  @ApiResponse({ status: 200, description: 'Model updated successfully' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateModelDto,
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.loginId || userContext?.userId || 'system';
    
    this.logger.log(`User ${loginId} updating model ${id}`);
    return await this.projectModelsService.update(id, updateDto, loginId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a model' })
  @ApiParam({ name: 'projectId', type: Number, description: 'Project ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Model ID' })
  @ApiResponse({ status: 204, description: 'Model deleted successfully' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Deleting model ${id}`);
    await this.projectModelsService.delete(id);
    return { message: 'Model deleted successfully' };
  }

  @Post(':id/upload-documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload multiple documents for a model' })
  @ApiParam({ name: 'projectId', type: Number, description: 'Project ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Model ID' })
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
  @ApiResponse({ status: 404, description: 'Model not found' })
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

    this.logger.log(`Uploading ${documents.length} document(s) for model ${id}`);
    return await this.projectModelsService.uploadDocuments(id, documents);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attachment from a model' })
  @ApiParam({ name: 'projectId', type: Number, description: 'Project ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Model ID' })
  @ApiParam({ name: 'attachmentId', type: Number, description: 'Attachment ID' })
  @ApiResponse({ status: 204, description: 'Attachment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async deleteAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    this.logger.log(`Deleting attachment ${attachmentId} from model ${id}`);
    await this.projectModelsService.deleteAttachment(id, attachmentId);
    return { message: 'Attachment deleted successfully' };
  }
}
