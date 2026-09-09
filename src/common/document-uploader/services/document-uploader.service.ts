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
    ) { }

    async uploadImage(
        image: BufferedFile,
        details: DocumentMetaInfo,
    ) {
        const mimeType = image.mimetype || 'application/octet-stream';
        const fileType = this.detectFileType(mimeType, image.originalname);
        const fileTypeLabel = fileType.charAt(0).toUpperCase() + fileType.slice(1);

        this.logger.log(
            `Uploading ${fileType} file for entity ${details.entityType} with ID ${details.entityId}`,
        );
        const uploaded = await this.s3ClientService.upload(image, details);
        this.logger.debug(
            `${fileTypeLabel} uploaded successfully with URL: ${uploaded.url}`,
        );

        const result: Record<string, any> = {
            url: uploaded.url,
            file_url: uploaded.url,
            key: uploaded.key,
            fileName: uploaded.fileName,
            fileType,
            mimeType,
            message: `${fileTypeLabel} upload successful`,
        };

        // Only include image_url for actual image files
        if (fileType === 'image') {
            result.image_url = uploaded.url;
        }

        return result;
    }

    private detectFileType(mimeType: string, fileName?: string): string {
        if (mimeType === 'application/pdf') return 'pdf';
        if (mimeType.startsWith('image/')) return 'image';
        if (
            mimeType === 'application/msword' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) return 'document';
        if (
            mimeType === 'application/vnd.ms-excel' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) return 'spreadsheet';
        if (mimeType === 'text/plain') return 'text';

        // Fallback: check file extension
        if (fileName) {
            const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
            if (ext === '.pdf') return 'pdf';
            if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
            if (['.doc', '.docx'].includes(ext)) return 'document';
            if (['.xls', '.xlsx'].includes(ext)) return 'spreadsheet';
            if (ext === '.txt') return 'text';
        }

        return 'file';
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
            let isImageExists = false;
            try {
                const metadata = await this.s3ClientService.getMetaData(key);
                isImageExists = !!metadata;
            } catch (error) {
                // If metadata fetch fails (likely 404), it means image is already gone
                this.logger.warn(`Image already missing from storage for key: ${key}. Proceeding with database cleanup.`);
                return { message: 'Image already missing, cleaning up record' };
            }

            if (!isImageExists) {
                return { message: 'Image already missing, cleaning up record' };
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
                    docDetails.name = metadata.filename && metadata.filename !== 'unknown' ? metadata.filename : (metadata.id || e.id);
                    docDetails.key = metadata.id || s3Key;
                    docDetails.createdAt = e.createdAt;
                    docs.push(docDetails);
                } catch (error: any) {
                    const isNotFound =
                        error?.status === HttpStatus.NOT_FOUND ||
                        error?.name === 'NotFound' ||
                        error?.name === 'NoSuchKey' ||
                        error?.message?.includes('not found') ||
                        error?.response?.statusCode === HttpStatus.NOT_FOUND;

                    if (isNotFound) {
                        this.logger.warn(`Removing orphaned object_store record ${e.id} because file is missing from storage`);
                        await this.documentRepo.delete(e.id).catch(() => null);
                        continue;
                    }

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
                where: [{ id: key }, { s3Key: key }],
            });

            if (!doc) {
                this.logger.warn(`Document not found with key: ${key}`);
                return { message: 'Document not found or already deleted' };
            }

            const docId = doc.id;
            const actualS3Key = doc.s3Key || doc.id || key;

            try {
                await this.deleteMinioDoc(actualS3Key);
            } catch (storageErr: any) {
                this.logger.warn(`Storage deletion note for key ${actualS3Key}: ${storageErr.message}`);
            }

            await this.documentRepo.delete({ id: docId });

            this.logger.debug(`Successfully deleted document with key: ${key}`);
            return { message: 'Document deleted successfully' };
        } catch (error: any) {
            this.logger.error(
                `Failed to delete document with key ${key}: ${error.message}`,
            );
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to delete document',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
