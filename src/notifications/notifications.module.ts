import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './Services/notifications.service';
import { AttendanceNotificationController } from './Controllers/attendance-notification.controller';
import { BirthdayNotificationController } from './Controllers/birthday-notification.controller';
import { FestivalNotificationController } from './Controllers/festival-notification.controller';
import { BirthdayNotificationService } from './Services/birthday-notification.service';
import { FestivalNotificationService } from './Services/festival-notification.service';
import { CelebrationCronService } from './cron/celebration.cron.service';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from './entities/notification.entity';
import { MailModule } from '../common/mail/mail.module';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { ManagerMapping } from '../managerMapping/entities/managerMapping.entity';
import { User } from '../users/entities/user.entity';
import { MasterHolidays } from '../master/models/master-holidays.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeDetails,
      Notification,
      ManagerMapping,
      User,
      MasterHolidays,
    ]),
    MailModule,
    DocumentUploaderModule,
  ],
  controllers: [
    AttendanceNotificationController,
    BirthdayNotificationController,
    FestivalNotificationController,
  ],
  providers: [
    NotificationsService,
    BirthdayNotificationService,
    FestivalNotificationService,
    CelebrationCronService,
  ],
  exports: [
    NotificationsService,
    BirthdayNotificationService,
    FestivalNotificationService,
    CelebrationCronService,
  ],
})
export class NotificationsModule {}
