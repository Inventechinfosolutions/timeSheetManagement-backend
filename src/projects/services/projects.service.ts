import { Injectable, Logger, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Project } from '../entities/project.entity';
import { CreateProjectDto } from '../dto/create-project.dto';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { BufferedFile } from '../../common/s3-client/file.model';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  async create(createProjectDto: CreateProjectDto, file?: BufferedFile): Promise<Project> {
    try {
      this.logger.log(`Creating project: ${createProjectDto.projectName}`);
      const project = this.projectRepository.create(createProjectDto);
      const savedProject = await this.projectRepository.save(project);

      if (file) {
        this.logger.log(`Uploading cover image for project: ${savedProject.id}`);
        const docMeta = new DocumentMetaInfo();
        docMeta.entityId = savedProject.id;
        docMeta.entityType = EntityType.PROJECT;
        docMeta.refId = savedProject.id;
        docMeta.refType = ReferenceType.PROJECT_PHOTO;
        
        const uploadResult = await this.documentUploaderService.uploadImage(file, docMeta);
        savedProject.image_url = uploadResult.image_url;
        await this.projectRepository.save(savedProject);
      }

      return savedProject;
    } catch (error) {
      this.logger.error(`Error creating project: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findAll(): Promise<Project[]> {
    try {
      return await this.projectRepository.find({ order: { createdAt: 'DESC' } });
    } catch (error) {
      this.logger.error(`Error fetching projects: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch projects', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log(`Deleting project: ${id}`);
      // Also delete associated documents from S3 and metadata
      const docs = await this.documentRepo.find({
        where: { entityType: EntityType.PROJECT, entityId: id },
      });

      for (const doc of docs) {
        try {
          await this.documentUploaderService.deleteMinioDoc(doc.s3Key);
          await this.documentRepo.remove(doc);
        } catch (err) {
          this.logger.error(`Failed to delete background file ${doc.s3Key}: ${err.message}`);
        }
      }

      await this.projectRepository.delete(id);
    } catch (error) {
      this.logger.error(`Error deleting project ${id}: ${error.message}`, error.stack);
      throw new HttpException('Failed to delete project', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async uploadDocument(
    files: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    try {
      this.logger.log(`Uploading ${files.length} documents for Project ${entityId}`);
      const results: any[] = [];
      for (const file of files) {
        const docMeta = new DocumentMetaInfo();
        docMeta.entityId = entityId;
        docMeta.entityType = entityType;
        docMeta.refId = refId;
        docMeta.refType = refType;

        const result = await this.documentUploaderService.uploadImage(file as any, docMeta);
        results.push(result);
      }
      return { success: true, data: results };
    } catch (error) {
      this.logger.error(`Error uploading documents: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAllFiles(entityType: EntityType, entityId: number, refId: number, refType?: ReferenceType) {
    try {
      const where: any = { entityType, entityId, refId };
      if (refType) where.refType = refType;

      const docs = await this.documentRepo.find({ where, order: { createdAt: 'DESC' } });
      return docs.map((doc) => ({
        id: doc.id,
        filename: doc.s3Key.split('/').pop(),
        key: doc.s3Key,
        createdAt: doc.createdAt,
      }));
    } catch (error) {
      this.logger.error(`Error fetching files: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch files', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteDocument(entityType: EntityType, entityId: number, refId: number, key: string) {
    try {
      const doc = await this.documentRepo.findOne({
        where: { entityType, entityId, refId, s3Key: key },
      });

      if (!doc) throw new NotFoundException('Document metadata not found');

      await this.documentUploaderService.deleteMinioDoc(key);
      await this.documentRepo.remove(doc);
      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting document: ${error.message}`, error.stack);
      throw new HttpException('Failed to delete document', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async validateProject(id: number) {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
