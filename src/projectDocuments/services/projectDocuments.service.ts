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
import { ProjectDocument } from '../entities/projectDocument.entity';
import { CreateProjectDocumentDto } from '../dto/create-project-document.dto';
import { UpdateProjectDocumentDto } from '../dto/update-project-document.dto';
import { ProjectDocumentResponseDto } from '../dto/project-document-response.dto';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class ProjectDocumentsService {
  private readonly logger = new Logger(ProjectDocumentsService.name);

  constructor(
    @InjectRepository(ProjectDocument)
    private readonly projectDocumentRepository: Repository<ProjectDocument>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  async create(
    createDto: CreateProjectDocumentDto,
    loginId: string,
  ): Promise<ProjectDocumentResponseDto> {
    try {
      this.logger.log(`Creating new project document: ${createDto.projectName}`);
      
      const project = this.projectDocumentRepository.create({
        ...createDto,
        createdBy: loginId,
      });
      
      const savedProject = await this.projectDocumentRepository.save(project);
      this.logger.log(`Project document created with ID: ${savedProject.id}`);
      
      return this.mapToResponseDto(savedProject);
    } catch (error) {
      this.logger.error(`Error creating project document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error creating project document');
    }
  }

  async findAll(userLoginId: string, userRole?: UserType, userType?: UserType): Promise<ProjectDocumentResponseDto[]> {
    try {
      this.logger.log(`Fetching all project documents for user: ${userLoginId}`);
      
      let query = this.projectDocumentRepository.createQueryBuilder('project');
      
      // Check if user is ADMIN (check both role and userType)
      const isAdmin = userType === UserType.ADMIN || userRole === UserType.ADMIN;
      
      // If user is not ADMIN, filter by department
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
          // If employee not found or no department, return empty array
          this.logger.warn(`Employee not found or no department for user: ${userLoginId}`);
          return [];
        }
      }
      
      const projects = await query.orderBy('project.createdAt', 'DESC').getMany();
      this.logger.log(`Found ${projects.length} project(s)`);
      
      // Get files for each project
      const projectsWithFiles = await Promise.all(
        projects.map(async (project) => {
          const files = await this.documentUploaderService.getAllDocs(
            EntityType.PROJECT_DOCUMENT,
            project.id,
            ReferenceType.PROJECT_DOCUMENT,
          );
          return { ...this.mapToResponseDto(project), files };
        }),
      );
      
      return projectsWithFiles;
    } catch (error) {
      this.logger.error(`Error fetching project documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching project documents');
    }
  }

  async findOne(id: number, userLoginId: string, userRole?: UserType, userType?: UserType): Promise<ProjectDocumentResponseDto> {
    try {
      this.logger.log(`Fetching project document with ID: ${id}`);
      
      const project = await this.projectDocumentRepository.findOne({ where: { id } });
      
      if (!project) {
        throw new NotFoundException(`Project document with ID ${id} not found`);
      }
      
      // Check if user is ADMIN (check both role and userType)
      const isAdmin = userType === UserType.ADMIN || userRole === UserType.ADMIN;
      
      // Check if user has access to this project
      if (!isAdmin) {
        const employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: userLoginId },
        });
        
        if (!employee || employee.department !== project.department) {
          throw new HttpException('Access denied to this project', HttpStatus.FORBIDDEN);
        }
      }
      
      // Get files for the project
      const files = await this.documentUploaderService.getAllDocs(
        EntityType.PROJECT_DOCUMENT,
        project.id,
        ReferenceType.PROJECT_DOCUMENT,
      );
      
      return { ...this.mapToResponseDto(project), files };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error fetching project document ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching project document');
    }
  }

  async update(
    id: number,
    updateDto: UpdateProjectDocumentDto,
    loginId: string,
  ): Promise<ProjectDocumentResponseDto> {
    try {
      this.logger.log(`Updating project document ${id}`);
      
      const project = await this.projectDocumentRepository.findOne({ where: { id } });
      
      if (!project) {
        throw new NotFoundException(`Project document with ID ${id} not found`);
      }
      
      Object.assign(project, updateDto);
      project.updatedBy = loginId;
      
      const updatedProject = await this.projectDocumentRepository.save(project);
      this.logger.log(`Project document ${id} updated successfully`);
      
      return this.mapToResponseDto(updatedProject);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error updating project document ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error updating project document');
    }
  }

  async delete(id: number): Promise<void> {
    try {
      this.logger.log(`Deleting project document ${id}`);
      
      const project = await this.projectDocumentRepository.findOne({ where: { id } });
      
      if (!project) {
        throw new NotFoundException(`Project document with ID ${id} not found`);
      }
      
      // Delete project photo if exists
      if (project.projectPhotoKey) {
        try {
          await this.documentUploaderService.deleteMinioDoc(project.projectPhotoKey);
        } catch (error) {
          this.logger.warn(`Failed to delete project photo: ${error.message}`);
        }
      }
      
      // Delete all associated files
      const files = await this.documentUploaderService.getAllDocs(
        EntityType.PROJECT_DOCUMENT,
        project.id,
        ReferenceType.PROJECT_DOCUMENT,
      );
      
      for (const file of files) {
        try {
          await this.documentUploaderService.deleteDoc(file.key);
        } catch (error) {
          this.logger.warn(`Failed to delete file ${file.key}: ${error.message}`);
        }
      }
      
      await this.projectDocumentRepository.remove(project);
      this.logger.log(`Project document ${id} deleted successfully`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error deleting project document ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error deleting project document');
    }
  }

  async uploadProjectPhoto(
    projectId: number,
    photo: Express.Multer.File,
  ): Promise<{ image_url: string; key: string; fileName: string }> {
    try {
      this.logger.log(`Uploading project photo for project ${projectId}`);
      
      const project = await this.projectDocumentRepository.findOne({ where: { id: projectId } });
      
      if (!project) {
        throw new NotFoundException(`Project document with ID ${projectId} not found`);
      }
      
      // Delete old photo if exists
      if (project.projectPhotoKey) {
        try {
          await this.documentUploaderService.deleteMinioDoc(project.projectPhotoKey);
        } catch (error) {
          this.logger.warn(`Failed to delete old photo: ${error.message}`);
        }
      }
      
      const details = new DocumentMetaInfo();
      details.refId = projectId;
      details.refType = ReferenceType.PROJECT_PHOTO;
      details.entityId = projectId;
      details.entityType = EntityType.PROJECT_DOCUMENT;
      
      const result = await this.documentUploaderService.uploadImage(photo, details);
      
      // Update project with photo URL and key
      project.projectPhotoUrl = result.image_url;
      project.projectPhotoKey = result.key;
      await this.projectDocumentRepository.save(project);
      
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
  ): Promise<{ success: boolean; message: string; data: any[] }> {
    try {
      this.logger.log(`Uploading ${documents.length} document(s) for project ${projectId}`);
      
      const project = await this.projectDocumentRepository.findOne({ where: { id: projectId } });
      
      if (!project) {
        throw new NotFoundException(`Project document with ID ${projectId} not found`);
      }
      
      const uploadPromises = documents.map(async (doc) => {
        const details = new DocumentMetaInfo();
        details.refId = projectId;
        details.refType = ReferenceType.PROJECT_DOCUMENT;
        details.entityId = projectId;
        details.entityType = EntityType.PROJECT_DOCUMENT;
        
        return await this.documentUploaderService.uploadImage(doc, details);
      });
      
      const results = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${results.length} document(s) for project ${projectId}`);
      
      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error uploading documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error uploading documents');
    }
  }

  async deleteDocument(projectId: number, key: string): Promise<void> {
    try {
      this.logger.log(`Deleting document with key ${key} for project ${projectId}`);
      
      const project = await this.projectDocumentRepository.findOne({ where: { id: projectId } });
      
      if (!project) {
        throw new NotFoundException(`Project document with ID ${projectId} not found`);
      }
      
      await this.documentUploaderService.deleteDoc(key);
      this.logger.log(`Document ${key} deleted successfully`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error deleting document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error deleting document');
    }
  }

  private mapToResponseDto(project: ProjectDocument): ProjectDocumentResponseDto {
    return {
      id: project.id,
      projectName: project.projectName,
      description: project.description,
      department: project.department,
      projectPhotoUrl: project.projectPhotoUrl,
      projectPhotoKey: project.projectPhotoKey,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      createdBy: project.createdBy,
      updatedBy: project.updatedBy,
    };
  }
}

