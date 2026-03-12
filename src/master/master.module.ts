import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterHolidays } from './models/master-holidays.entity';
import { MasterDepartment } from './models/master-department.entity';
import { MasterHolidayService } from './service/master-holiday.service';
import { MasterDepartmentService } from './service/master-department.service';
import { MasterHolidayController } from './controller/masterHoliday.controller';
import { MasterDepartmentController } from './controller/master-department.controller';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { FileService } from '../common/core/utils/fileType.utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([MasterHolidays, MasterDepartment]),
    DocumentUploaderModule,
  ],
  controllers: [MasterHolidayController, MasterDepartmentController],
  providers: [
    MasterHolidayService,
    MasterDepartmentService,
    FileService,
  ],
  exports: [MasterHolidayService, MasterDepartmentService],
})
export class MasterModule {}
