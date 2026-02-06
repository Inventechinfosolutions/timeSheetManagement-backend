import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectModel } from '../entities/project-model.entity';
import { Project } from '../entities/project.entity';
import { ProjectAttachment } from '../entities/project-attachment.entity';
import { CreateModelDto } from '../dto/create-model.dto';
import { UpdateModelDto } from '../dto/update-model.dto';
import { ProjectModelDto, ProjectAttachmentDto } from '../dto/project-response.dto';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';

@Injectable()
export class ProjectModelsService {
  private readonly logger = new Logger(ProjectModelsService.name);

  constructor(
    @InjectRepository(ProjectModel)
    private readonly projectModelRepository: Repository<ProjectModel>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectAttachment)
    private readonly projectAttachmentRepository: Repository<ProjectAttachment>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  async create(createDto: CreateModelDto, loginId: string): Promise<ProjectModelDto> {
    try {
      this.logger.log(`Creating new model: ${createDto.modelName} for project ${createDto.projectId}`);
      
      const project = await this.projectRepository.findOne({
        where: { id: createDto.projectId },
      });
      
      if (!project) {
        throw new NotFoundException(`Project with ID ${createDto.projectId} not found`);
      }
      
      if (!project.hasModels) {
        project.hasModels = true;
        await this.projectRepository.save(project);
      }
      
      const model = this.projectModelRepository.create({
        modelName: createDto.modelName,
        projectId: createDto.projectId,
        createdBy: loginId,
      });
      
      const savedModel = await this.projectModelRepository.save(model);
      this.logger.log(`Model created with ID: ${savedModel.id}`);
      
      return this.mapToDto(savedModel);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error creating model: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error creating model');
    }
  }

  async findByProject(projectId: number): Promise<ProjectModelDto[]> {
    try {
      this.logger.log(`Fetching models for project ${projectId}`);
      
      const models = await this.projectModelRepository.find({
        where: { projectId },
        relations: ['attachments'],
        order: { createdAt: 'ASC' },
      });
      
      this.logger.log(`Found ${models.length} model(s) for project ${projectId}`);
      return models.map(model => this.mapToDto(model));
    } catch (error) {
      this.logger.error(`Error fetching models: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching models');
    }
  }

  async findOne(id: number): Promise<ProjectModelDto> {
    try {
      this.logger.log(`Fetching model with ID: ${id}`);
      
      const model = await this.projectModelRepository.findOne({
        where: { id },
        relations: ['attachments'],
      });
      
      if (!model) {
        throw new NotFoundException(`Model with ID ${id} not found`);
      }
      
      return this.mapToDto(model);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error fetching model ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching model');
    }
  }

  async update(id: number, updateDto: UpdateModelDto, loginId: string): Promise<ProjectModelDto> {
    try {
      this.logger.log(`Updating model ${id}`);
      
      const model = await this.projectModelRepository.findOne({ where: { id } });
      
      if (!model) {
        throw new NotFoundException(`Model with ID ${id} not found`);
      }
      
      Object.assign(model, updateDto);
      model.updatedBy = loginId;
      
      const updatedModel = await this.projectModelRepository.save(model);
      this.logger.log(`Model ${id} updated successfully`);
      
      return this.mapToDto(updatedModel);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error updating model ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error updating model');
    }
  }

  async delete(id: number): Promise<void> {
    try {
      this.logger.log(`Deleting model ${id}`);
      
      const model = await this.projectModelRepository.findOne({
        where: { id },
        relations: ['attachments'],
      });
      
      if (!model) {
        throw new NotFoundException(`Model with ID ${id} not found`);
      }
      
      // Delete all model attachments from MinIO
      if (model.attachments) {
        for (const attachment of model.attachments) {
          try {
            await this.documentUploaderService.deleteDoc(attachment.fileKey);
          } catch (error) {
            this.logger.warn(`Failed to delete file ${attachment.fileKey}: ${error.message}`);
          }
        }
      }
      
      await this.projectModelRepository.remove(model);
      this.logger.log(`Model ${id} deleted successfully`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error deleting model ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error deleting model');
    }
  }

  async uploadDocuments(
    modelId: number,
    documents: Express.Multer.File[],
  ): Promise<{ success: boolean; message: string; data: ProjectAttachmentDto[] }> {
    try {
      this.logger.log(`Uploading ${documents.length} document(s) for model ${modelId}`);
      
      const model = await this.projectModelRepository.findOne({
        where: { id: modelId },
        relations: ['project'],
      });
      
      if (!model) {
        throw new NotFoundException(`Model with ID ${modelId} not found`);
      }
      
      const uploadedAttachments: ProjectAttachmentDto[] = [];
      
      for (const doc of documents) {
        const details = new DocumentMetaInfo();
        details.refId = modelId;
        details.refType = ReferenceType.PROJECT_MODEL_DOCUMENT;
        details.entityId = modelId;
        details.entityType = EntityType.PROJECT_MODEL;
        
        const uploadResult = await this.documentUploaderService.uploadImage(doc, details);
        
        const attachment = this.projectAttachmentRepository.create({
          projectId: model.projectId,
          modelId: modelId,
          fileName: doc.originalname,
          fileUrl: uploadResult.image_url,
          fileKey: uploadResult.key,
        });
        
        const savedAttachment = await this.projectAttachmentRepository.save(attachment);
        uploadedAttachments.push({
          id: savedAttachment.id,
          fileName: savedAttachment.fileName,
          fileUrl: savedAttachment.fileUrl,
          fileKey: savedAttachment.fileKey,
          modelId: savedAttachment.modelId,
          createdAt: savedAttachment.createdAt,
        });
      }
      
      this.logger.log(`Successfully uploaded ${uploadedAttachments.length} document(s) for model ${modelId}`);
      
      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: uploadedAttachments,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error uploading documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error uploading documents');
    }
  }

  async deleteAttachment(modelId: number, attachmentId: number): Promise<void> {
    try {
      this.logger.log(`Deleting attachment ${attachmentId} from model ${modelId}`);
      
      const attachment = await this.projectAttachmentRepository.findOne({
        where: { id: attachmentId, modelId },
      });
      
      if (!attachment) {
        throw new NotFoundException(`Attachment not found`);
      }
      
      await this.documentUploaderService.deleteDoc(attachment.fileKey);
      await this.projectAttachmentRepository.remove(attachment);
      
      this.logger.log(`Attachment ${attachmentId} deleted successfully`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error deleting attachment: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error deleting attachment');
    }
  }

  private mapToDto(model: ProjectModel): ProjectModelDto {
    return {
      id: model.id,
      modelName: model.modelName,
      projectId: model.projectId,
      attachments: model.attachments?.map(att => ({
        id: att.id,
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        fileKey: att.fileKey,
        modelId: att.modelId,
        createdAt: att.createdAt,
      })),
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }
}
