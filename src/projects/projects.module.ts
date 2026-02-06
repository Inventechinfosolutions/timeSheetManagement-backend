import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './controllers/projects.controller';
import { ProjectModelsController } from './controllers/project-models.controller';
import { ProjectsService } from './services/projects.service';
import { ProjectModelsService } from './services/project-models.service';
import { Project } from './entities/project.entity';
import { ProjectModel } from './entities/project-model.entity';
import { ProjectAttachment } from './entities/project-attachment.entity';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { FileService } from '../common/core/utils/fileType.utils';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectModel, ProjectAttachment, EmployeeDetails, User]),
    DocumentUploaderModule,
  ],
  controllers: [ProjectsController, ProjectModelsController],
  providers: [ProjectsService, ProjectModelsService, FileService],
  exports: [ProjectsService, ProjectModelsService],
})
export class ProjectsModule {}

