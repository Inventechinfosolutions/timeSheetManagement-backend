import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeNote } from './entities/employee-note.entity';
import { EmployeeNotesService } from './employee-notes.service';
import { EmployeeNotesController } from './employee-notes.controller';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { DocumentMetaInfo } from '../common/document-uploader/models/documentmetainfo.model';
import { FileService } from '../common/core/utils/fileType.utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeNote, DocumentMetaInfo]),
    DocumentUploaderModule, // provides DocumentUploaderService (global, but explicit import for clarity)
  ],
  controllers: [EmployeeNotesController],
  providers: [EmployeeNotesService, FileService],
  exports: [EmployeeNotesService],
})
export class EmployeeNotesModule {}