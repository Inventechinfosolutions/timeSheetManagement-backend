import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterHolidays } from './models/master-holidays.entity';
import { MasterHolidayService } from './service/master-holiday.service';
import { MasterHolidayController } from './controller/masterHoliday.controller';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { FileService } from '../common/core/utils/fileType.utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([MasterHolidays]),
    DocumentUploaderModule,
  ],
  controllers: [MasterHolidayController],
  providers: [
    MasterHolidayService,
    FileService,
  ],
  exports: [MasterHolidayService],
})
export class MasterModule {}
