import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './controllers/projects.controller';
import { ProjectsService } from './services/projects.service';
import { Project } from './entities/project.entity';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { DocumentMetaInfo } from '../common/document-uploader/models/documentmetainfo.model';
import { FileService } from '../common/core/utils/fileType.utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, DocumentMetaInfo]),
    DocumentUploaderModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, FileService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
