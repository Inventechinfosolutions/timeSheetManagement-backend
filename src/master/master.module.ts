import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterHolidays } from './models/master-holidays.entity';
import { MasterDepartment } from './models/master-department.entity';
import { MasterQuaterly } from './models/master-quaterly.entity';
import { MasterFinancialYear } from './models/master-financialyear.entity';
import { MasterHolidayService } from './service/master-holiday.service';
import { MasterDepartmentService } from './service/master-department.service';
import { MasterQuaterlyService } from './service/master-quaterly.service';
import { MasterFinancialYearService } from './service/master-financialyear.service';
import { MasterHolidayController } from './controller/masterHoliday.controller';
import { MasterDepartmentController } from './controller/master-department.controller';
import { MasterQuaterlyController } from './controller/master-quaterly.controller';
import { MasterFinancialYearController } from './controller/master-financialyear.controller';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { FileService } from '../common/core/utils/fileType.utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MasterHolidays,
      MasterDepartment,
      MasterQuaterly,
      MasterFinancialYear,
    ]),
    DocumentUploaderModule,
  ],
  controllers: [
    MasterHolidayController,
    MasterDepartmentController,
    MasterQuaterlyController,
    MasterFinancialYearController,
  ],
  providers: [
    MasterHolidayService,
    MasterDepartmentService,
    MasterQuaterlyService,
    MasterFinancialYearService,
    FileService,
  ],
  exports: [
    MasterHolidayService,
    MasterDepartmentService,
    MasterQuaterlyService,
    MasterFinancialYearService,
  ],
})
export class MasterModule {}

