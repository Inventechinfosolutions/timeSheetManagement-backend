import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectDocument } from './entities/projectDocument.entity';
import { ProjectDocumentsService } from './services/projectDocuments.service';
import { ProjectDocumentsController } from './controllers/projectDocuments.controller';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { FileService } from '../common/core/utils/fileType.utils';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectDocument, EmployeeDetails, User]),
    DocumentUploaderModule,
  ],
  controllers: [ProjectDocumentsController],
  providers: [
    ProjectDocumentsService,
    FileService,
  ],
  exports: [ProjectDocumentsService],
})
export class ProjectDocumentsModule {}


