import { Global, Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentMetaInfo } from './models/documentmetainfo.model';
import { DocumentUploaderService } from './services/document-uploader.service';
import { S3ClientModule } from '../s3-client/s3-client.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DocumentMetaInfo]), S3ClientModule],
  providers: [DocumentUploaderService, Logger],
  exports: [DocumentUploaderService],
})
export class DocumentUploaderModule {}
