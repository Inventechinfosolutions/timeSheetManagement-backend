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

import { MasterFinancialYearService } from './service/master-financial-year.service';
import { MasterFinancialYearController } from './controller/master-financial-year.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MasterHolidays, MasterDepartment]),
    DocumentUploaderModule,
  ],
  controllers: [
    MasterHolidayController,
    MasterDepartmentController,
    MasterFinancialYearController,
  ],
  providers: [
    MasterHolidayService,
    MasterDepartmentService,
    MasterFinancialYearService,
    FileService,
  ],
  exports: [
    MasterHolidayService,
    MasterDepartmentService,
    MasterFinancialYearService,
  ],
})
export class MasterModule {}
