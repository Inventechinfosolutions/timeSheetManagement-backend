import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BufferedFile } from 'src/common/s3-client/file.model';
import { S3ClientService } from 'src/common/s3-client/s3-client.service';
import { Repository } from 'typeorm';
import { DocumentDetailsDto } from '../dto/documentdetails.dto';
import {
  DocumentMetaInfo,
  EntityType,
  ReferenceType,
} from '../models/documentmetainfo.model';

@Injectable()
export class DocumentUploaderService {
  private readonly logger = new Logger(DocumentUploaderService.name);

  constructor(
    private s3ClientService: S3ClientService,
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
  ) {}

  async uploadImage(
    image: BufferedFile,
    details: DocumentMetaInfo,
  ): Promise<{
    image_url: string;
    message: string;
    key: string;
    fileName: string;
  }> {
    this.logger.log(
      `Uploading image for entity ${details.entityType} with ID ${details.entityId}`,
    );
    const uploaded_image = await this.s3ClientService.upload(image, details);
    this.logger.debug(
      `Image uploaded successfully with URL: ${uploaded_image.url}`,
    );
    return {
      image_url: uploaded_image.url,
      key: uploaded_image.key,
      fileName: uploaded_image.fileName,
      message: 'Image upload successful',
    };
  }

  async downloadFile(key: string) {
    this.logger.log(`Downloading file with key: ${key}`);
    return await this.s3ClientService.downloadFile(key);
  }

  async getMetaData(key: string) {
    this.logger.debug(`Getting metadata for key: ${key}`);
    return await this.s3ClientService.getMetaData(key);
  }

  async deleteMinioDoc(key: string) {
    try {
      this.logger.log(`Attempting to delete document with key: ${key}`);
      const isImageExists = await this.s3ClientService.getMetaData(key);
      if (!isImageExists) {
        this.logger.warn(`Image not found for key: ${key}`);
        throw new HttpException('Image not found', HttpStatus.NOT_FOUND);
      }
      await this.s3ClientService.delete(key);
      this.logger.debug(`Successfully deleted image with key: ${key}`);

      return {
        message: 'Image deleted successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to delete image with key ${key}: ${error.message}`,
      );
      throw new HttpException(
        'Failed to delete image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllDocs(
    entityType: EntityType,
    entityId: number,
    referenceType?: ReferenceType,
    referenceId?: number,
  ) {
    try {
      this.logger.log(
        `Getting all documents for entity ${entityType} with ID ${entityId}, refId ${referenceId}`,
      );
      const query = this.documentRepo
        .createQueryBuilder('doc')
        .where('doc.entityType = :entityType', { entityType });

      // Strict Filtering Logic:
      // 1. Filter by entityId (Employee ID) to maintain security boundaries, allowing 0 as fallback for improperly linked docs.
      // 2. Filter by refId (Request ID) if it's explicitly provided (including 0).
      query.andWhere('doc.entityId = :entityId', {
        entityId,
      });

      if (referenceId != null) {
        query.andWhere('doc.refId = :referenceId', { referenceId });
      }

      if (referenceType) {
        query.andWhere('doc.refType = :referenceType', { referenceType });
      }

      const objects = await query.getMany();
      this.logger.debug(`Found ${objects.length} documents`);

      const docs: DocumentDetailsDto[] = [];
      for (const e of objects) {
        try {
          const s3Key = e.s3Key || e.id;
          const metadata = await this.getMetaData(s3Key);
          const docDetails = new DocumentDetailsDto();
          docDetails.entityType = e.entityType;
          docDetails.entityId = e.entityId;
          docDetails.refType = e.refType;
          docDetails.refId = e.refId;
          docDetails.name = metadata.filename;
          docDetails.key = metadata.id;
          docDetails.createdAt = e.createdAt;
          docs.push(docDetails);
        } catch (error) {
          if (
            error instanceof HttpException &&
            error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
          ) {
            throw error;
          }
          this.logger.error('Error processing document metadata:', {
            documentId: e.id,
            error: error.message,
          });
          // When S3 is unreachable (e.g. ETIMEDOUT), still add doc from DB so caller can try download and return 503 instead of 404
          const fallback = new DocumentDetailsDto();
          fallback.key = e.s3Key || e.id;
          fallback.name = e.id;
          fallback.entityType = e.entityType;
          fallback.entityId = e.entityId;
          fallback.refType = e.refType;
          fallback.refId = e.refId;
          fallback.createdAt = e.createdAt;
          docs.push(fallback);
        }
      }

      return docs;
    } catch (error) {
      this.logger.error('Error fetching documents:', {
        entityType,
        entityId,
        referenceType,
        referenceId,
        error: error.message,
      });
      return [];
    }
  }

  async deleteDoc(key: string) {
    try {
      this.logger.log(`Attempting to delete document with key: ${key}`);
      const doc = await this.documentRepo.findOne({
        where: { id: key },
      });

      if (!doc) {
        this.logger.warn(`Document not found with key: ${key}`);
        throw new HttpException(
          `Document with ID ${key} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      await this.deleteMinioDoc(key);
      await this.documentRepo.delete(key);

      this.logger.debug(`Successfully deleted document with key: ${key}`);
      return;
    } catch (error) {
      this.logger.error(
        `Failed to delete document with key ${key}: ${error.message}`,
      );
      throw new HttpException(
        `Document with ID ${key} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
