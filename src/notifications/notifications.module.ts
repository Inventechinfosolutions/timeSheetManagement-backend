import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './Services/notifications.service';
import { WorkAnniversaryService } from './Services/work-anniversary.service';
import { AttendanceNotificationController } from './Controllers/attendance-notification.controller';
import { WorkAnniversaryController } from './Controllers/work-anniversary.controller';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from './entities/notification.entity';
import { MailModule } from '../common/mail/mail.module';
import { ManagerMapping } from '../managerMapping/entities/managerMapping.entity';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeDetails,
      Notification,
      ManagerMapping,
    ]),
    MailModule,
    DocumentUploaderModule,
  ],
  controllers: [AttendanceNotificationController, WorkAnniversaryController],
  providers: [NotificationsService, WorkAnniversaryService],
  exports: [NotificationsService, WorkAnniversaryService],
})
export class NotificationsModule {}
