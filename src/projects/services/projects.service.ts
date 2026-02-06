import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Project } from '../entities/project.entity';
import { ProjectAttachment } from '../entities/project-attachment.entity';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { ProjectResponseDto, ProjectAttachmentDto } from '../dto/project-response.dto';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectAttachment)
    private readonly projectAttachmentRepository: Repository<ProjectAttachment>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  async create(
    createDto: CreateProjectDto,
    loginId: string,
    userRole?: UserType,
    userType?: UserType,
  ): Promise<ProjectResponseDto> {
    try {
      this.logger.log(`Creating new project: ${createDto.projectName}`);
      
      const isAdmin = userType === UserType.ADMIN || userRole === UserType.ADMIN;
      
      // Auto-fill department for employees
      let department = createDto.department;
      if (!isAdmin) {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: loginId },
        });
        
        if (!employee || !employee.department) {
          throw new HttpException('Employee department not found', HttpStatus.BAD_REQUEST);
        }
        
        department = employee.department;
        this.logger.log(`Auto-filled department for employee ${loginId}: ${department}`);
      } else if (!department) {
        throw new HttpException('Department is required for admin', HttpStatus.BAD_REQUEST);
      }
      
      const project = this.projectRepository.create({
        ...createDto,
        department,
        createdBy: loginId,
      });
      
      const savedProject = await this.projectRepository.save(project);
      this.logger.log(`Project created with ID: ${savedProject.id}`);
      
      return this.mapToResponseDto(savedProject);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error creating project: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error creating project');
    }
  }

  async findAll(userLoginId: string, userRole?: UserType, userType?: UserType): Promise<ProjectResponseDto[]> {
    try {
      this.logger.log(`Fetching all projects for user: ${userLoginId}`);
      
      let query = this.projectRepository.createQueryBuilder('project')
        .leftJoinAndSelect('project.models', 'models')
        .leftJoinAndSelect('project.attachments', 'attachments')
        .leftJoinAndSelect('models.attachments', 'modelAttachments');
      
      const isAdmin = userType === UserType.ADMIN || userRole === UserType.ADMIN;
      
      if (!isAdmin) {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: userLoginId },
        });
        
        if (employee && employee.department) {
          query = query.where('project.department = :department', {
            department: employee.department,
          });
          this.logger.log(`Filtering projects by department: ${employee.department}`);
        } else {
          this.logger.warn(`Employee not found or no department for user: ${userLoginId}`);
          return [];
        }
      }
      
      const projects = await query.orderBy('project.createdAt', 'DESC').getMany();
      this.logger.log(`Found ${projects.length} project(s)`);
      
      return projects.map(project => this.mapToResponseDto(project));
    } catch (error) {
      this.logger.error(`Error fetching projects: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching projects');
    }
  }

  async findOne(id: number, userLoginId: string, userRole?: UserType, userType?: UserType): Promise<ProjectResponseDto> {
    try {
      this.logger.log(`Fetching project with ID: ${id}`);
      
      const project = await this.projectRepository.findOne({
        where: { id },
        relations: ['models', 'attachments', 'models.attachments'],
      });
      
      if (!project) {
        throw new NotFoundException(`Project with ID ${id} not found`);
      }
      
      const isAdmin = userType === UserType.ADMIN || userRole === UserType.ADMIN;
      
      if (!isAdmin) {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: userLoginId },
        });
        
        if (!employee || employee.department !== project.department) {
          throw new ForbiddenException('Access denied to this project');
        }
      }
      
      return this.mapToResponseDto(project);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error fetching project ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching project');
    }
  }

  async update(
    id: number,
    updateDto: UpdateProjectDto,
    loginId: string,
  ): Promise<ProjectResponseDto> {
    try {
      this.logger.log(`Updating project ${id}`);
      
      const project = await this.projectRepository.findOne({ where: { id } });
      
      if (!project) {
        throw new NotFoundException(`Project with ID ${id} not found`);
      }
      
      Object.assign(project, updateDto);
      project.updatedBy = loginId;
      
      const updatedProject = await this.projectRepository.save(project);
      this.logger.log(`Project ${id} updated successfully`);
      
      return this.mapToResponseDto(updatedProject);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error updating project ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error updating project');
    }
  }

  async delete(id: number): Promise<void> {
    try {
      this.logger.log(`Deleting project ${id}`);
      
      const project = await this.projectRepository.findOne({
        where: { id },
        relations: ['models', 'attachments', 'models.attachments'],
      });
      
      if (!project) {
        throw new NotFoundException(`Project with ID ${id} not found`);
      }
      
      // Delete project photo if exists
      if (project.photoKey) {
        try {
          await this.documentUploaderService.deleteMinioDoc(project.photoKey);
        } catch (error) {
          this.logger.warn(`Failed to delete project photo: ${error.message}`);
        }
      }
      
      // Delete all project-level attachments
      if (project.attachments) {
        for (const attachment of project.attachments) {
          if (!attachment.modelId) {
            try {
              await this.documentUploaderService.deleteDoc(attachment.fileKey);
            } catch (error) {
              this.logger.warn(`Failed to delete file ${attachment.fileKey}: ${error.message}`);
            }
          }
        }
      }
      
      // Delete all model attachments
      if (project.models) {
        for (const model of project.models) {
          if (model.attachments) {
            for (const attachment of model.attachments) {
              try {
                await this.documentUploaderService.deleteDoc(attachment.fileKey);
              } catch (error) {
                this.logger.warn(`Failed to delete file ${attachment.fileKey}: ${error.message}`);
              }
            }
          }
        }
      }
      
      await this.projectRepository.remove(project);
      this.logger.log(`Project ${id} deleted successfully`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error deleting project ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error deleting project');
    }
  }

  async uploadPhoto(
    projectId: number,
    photo: Express.Multer.File,
  ): Promise<{ image_url: string; key: string; fileName: string }> {
    try {
      this.logger.log(`Uploading project photo for project ${projectId}`);
      
      const project = await this.projectRepository.findOne({ where: { id: projectId } });
      
      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }
      
      // Delete old photo if exists
      if (project.photoKey) {
        try {
          await this.documentUploaderService.deleteMinioDoc(project.photoKey);
        } catch (error) {
          this.logger.warn(`Failed to delete old photo: ${error.message}`);
        }
      }
      
      const details = new DocumentMetaInfo();
      details.refId = projectId;
      details.refType = ReferenceType.PROJECT_PHOTO;
      details.entityId = projectId;
      details.entityType = EntityType.PROJECT;
      
      const result = await this.documentUploaderService.uploadImage(photo, details);
      
      project.photoUrl = result.image_url;
      project.photoKey = result.key;
      await this.projectRepository.save(project);
      
      this.logger.log(`Project photo uploaded successfully for project ${projectId}`);
      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error uploading project photo: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error uploading project photo');
    }
  }

  async uploadDocuments(
    projectId: number,
    documents: Express.Multer.File[],
  ): Promise<{ success: boolean; message: string; data: ProjectAttachmentDto[] }> {
    try {
      this.logger.log(`Uploading ${documents.length} document(s) for project ${projectId}`);
      
      const project = await this.projectRepository.findOne({ where: { id: projectId } });
      
      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }
      
      if (project.hasModels) {
        throw new HttpException(
          'Cannot upload documents directly to project with models. Upload to specific model instead.',
          HttpStatus.BAD_REQUEST,
        );
      }
      
      const uploadedAttachments: ProjectAttachmentDto[] = [];
      
      for (const doc of documents) {
        const details = new DocumentMetaInfo();
        details.refId = projectId;
        details.refType = ReferenceType.PROJECT_DOCUMENT;
        details.entityId = projectId;
        details.entityType = EntityType.PROJECT;
        
        const uploadResult = await this.documentUploaderService.uploadImage(doc, details);
        
        const attachment = this.projectAttachmentRepository.create({
          projectId,
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
          createdAt: savedAttachment.createdAt,
        });
      }
      
      this.logger.log(`Successfully uploaded ${uploadedAttachments.length} document(s) for project ${projectId}`);
      
      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: uploadedAttachments,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error uploading documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error uploading documents');
    }
  }

  async deleteAttachment(projectId: number, attachmentId: number): Promise<void> {
    try {
      this.logger.log(`Deleting attachment ${attachmentId} from project ${projectId}`);
      
      const attachment = await this.projectAttachmentRepository.findOne({
        where: { id: attachmentId, projectId, modelId: IsNull() },
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

  private mapToResponseDto(project: Project): ProjectResponseDto {
    return {
      id: project.id,
      projectName: project.projectName,
      department: project.department,
      description: project.description,
      photoUrl: project.photoUrl,
      photoKey: project.photoKey,
      hasModels: project.hasModels,
      models: project.models?.map(model => ({
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
      })),
      attachments: project.attachments?.filter(att => !att.modelId).map(att => ({
        id: att.id,
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        fileKey: att.fileKey,
        createdAt: att.createdAt,
      })),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      createdBy: project.createdBy,
      updatedBy: project.updatedBy,
    };
  }
}
