import {
  BucketLocationConstraint,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BufferedFile } from './file.model';
import { DocumentMetaInfo } from '../document-uploader/models/documentmetainfo.model';
 
@Injectable()
export class S3ClientService implements OnModuleInit {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(S3ClientService.name);
  private readonly bucketName = process.env.MINIO_BUCKET_NAME;
 
  constructor(
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
  ) {
    this.logger.log('Initializing S3ClientService');
   
    const endpoint = process.env.MINIO_ENDPOINT;
    const accessKeyId = process.env.MINIO_ACCESS_KEY;
    const secretAccessKey = process.env.MINIO_SECRET_KEY;
 
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('MinIO configuration is missing. Please check MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY environment variables.');
    }
   
    this.s3Client = new S3Client({
      endpoint,
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
      requestHandler: {
        connectionTimeout: 5000,
        socketTimeout: 5000,
      },
      maxAttempts: 1,
      retryMode: 'standard',
    });
   
    this.logger.log('S3Client initialized successfully');
  }
 
  async onModuleInit() {
    this.logger.log('Initializing S3ClientService module');
    if (!this.bucketName) {
      throw new Error('MINIO_BUCKET_NAME environment variable is required');
    }
    try {
      await this.checkAndCreateBucket(this.bucketName);
      this.logger.log('S3ClientService module initialized successfully');
    } catch (error) {
      this.logger.warn(`S3ClientService initialization failed: ${error.message}. The application will continue to start, but file storage will be unavailable.`);
    }
  }
 
  private async checkAndCreateBucket(bucketName: string) {
    try {
      this.logger.log(`Checking if bucket ${bucketName} exists...`);
      const command = new HeadBucketCommand({ Bucket: bucketName });
      await this.s3Client.send(command);
      this.logger.log(`Bucket ${bucketName} exists`);
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
        this.logger.log(`Bucket ${bucketName} not found, creating...`);
        await this.createBucket(bucketName);
      } else {
        this.logger.error(`Error checking bucket: ${error.message}`);
        throw error;
      }
    }
  }
 
  async createBucket(bucketName: string): Promise<string> {
    this.logger.log(`Creating bucket: ${bucketName}`);
    const command = new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: (process.env.AWS_REGION || 'us-east-1') as BucketLocationConstraint,
      },
    });
 
    await this.s3Client.send(command);
    this.logger.log(`Bucket "${bucketName}" created successfully`);
    return `Bucket "${bucketName}" created successfully.`;
  }
 
  public async upload(file: BufferedFile, fileDetails: DocumentMetaInfo, bucketName?: string) {
    const targetBucket = bucketName || this.bucketName;
    if (!targetBucket) {
      throw new Error('Bucket name is required');
    }
    this.logger.log(`Starting upload for file: ${file.originalname}`);
    try {
      const timestamp = Date.now().toString();
      const hashedFileName = crypto.createHash('md5').update(timestamp).digest('hex');
      const extension = file.originalname.substring(file.originalname.lastIndexOf('.'));
      const unqId = uuidv4();
      const fileName = hashedFileName + extension;
      const unqurl = `${fileName}-${unqId}`;
 
      this.logger.debug('Creating document metadata');
      const newDocument = this.documentRepo.create({
        refId: fileDetails.refId,
        refType: fileDetails.refType,
        entityId: fileDetails.entityId,
        entityType: fileDetails.entityType,
      });
      const savedDoc = await this.documentRepo.save(newDocument);
      this.logger.debug(`Document metadata saved with ID: ${savedDoc.id}`);
 
      this.logger.debug('Uploading file to S3');
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: savedDoc.id,
          Body: file.buffer,
          Metadata: {
            'Content-Type': file.mimetype,
            'x-amz-meta-filename': file.originalname.replace(/[^a-zA-Z0-9.]/g, ''),
            'x-amz-meta-mimetype': file.mimetype,
            'x-amz-meta-referenceid': String(fileDetails.refId),
            'x-amz-meta-referencetype': fileDetails.refType,
            'x-amz-meta-entityid': String(fileDetails.entityId),
            'x-amz-meta-entitytype': fileDetails.entityType,
            'x-amz-meta-id': savedDoc.id,
          },
        }),
      );
      this.logger.log(`File uploaded successfully with ID: ${savedDoc.id}`);
 
      return {
        url: unqurl,
        fileName: file.originalname.replace(/[^a-zA-Z0-9.]/g, ''),
        key: savedDoc.id,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.stack}`);
      throw new HttpException(
        error.message || 'Failed to upload file',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
 
  async delete(objetName: string, bucketName?: string) {
    const targetBucket = bucketName || this.bucketName;
    if (!targetBucket) {
      throw new Error('Bucket name is required');
    }
    this.logger.log(`Deleting ${objetName} from ${bucketName}`);
    try {
      const documents = await this.documentRepo.findOne({
        where: { id: objetName },
      });
      if (!documents) {
        this.logger.warn(`Document not found: ${objetName}`);
        throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
      }
 
      this.logger.debug('Deleting document metadata');
      await this.documentRepo.delete({ id: objetName });
 
      this.logger.debug('Deleting file from S3');
      const result = await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: targetBucket,
          Key: objetName,
        }),
      );
      this.logger.log(`File deleted successfully: ${objetName}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete object: ${error.stack}`);
      throw new HttpException('Failed to delete object', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
 
  async getMetaData(objetName: string) {
    try {
      this.logger.log(`Getting metadata for object: ${objetName}`);
 
      const stat = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: objetName,
        }),
      );
 
      if (!stat.Metadata) {
        throw new HttpException('File metadata not found', HttpStatus.NOT_FOUND);
      }
 
      const metaData = {
        'Content-Type': stat.Metadata['content-type'] || 'application/octet-stream',
        'filename': stat.Metadata['x-amz-meta-filename'] || 'unknown',
        'mimetype': stat.Metadata['x-amz-meta-mimetype'] || 'application/octet-stream',
        'referenceId': stat.Metadata['x-amz-meta-referenceid'] || '',
        'referenceType': stat.Metadata['x-amz-meta-referencetype'] || '',
        'entityId': stat.Metadata['x-amz-meta-entityid'] || '',
        'entityType': stat.Metadata['x-amz-meta-entitytype'] || '',
        'id': stat.Metadata['x-amz-meta-id'] || '',
      };
 
      return metaData;
    } catch (error) {
      this.logger.error(`Failed to get metadata for object ${objetName}: ${error.stack}`);
      throw new HttpException(
        error.message || 'Failed to get metadata',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
 
  async downloadFile(objectName: string) {
    this.logger.log(`Downloading file: ${objectName}`);
    try {
      const result = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: objectName,
        }),
      );
      this.logger.log(`File downloaded successfully: ${objectName}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to download file ${objectName}: ${error.stack}`);
      throw error;
    }
  }
}
 
 