import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3ClientService } from './s3-client.service';
import { DocumentMetaInfo } from '../document-uploader/models/documentmetainfo.model';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DocumentMetaInfo])],
  providers: [S3ClientService],
  exports: [S3ClientService],
})
export class S3ClientModule {}
