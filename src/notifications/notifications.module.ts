import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './Services/notifications.service';
import { AttendanceNotificationController } from './Controllers/attendance-notification.controller';
import { BirthdayNotificationController } from './Controllers/birthday-notification.controller';
import { BirthdayNotificationService } from './Services/birthday-notification.service';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from './entities/notification.entity';
import { MailModule } from '../common/mail/mail.module';
import { ManagerMapping } from '../managerMapping/entities/managerMapping.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeDetails, Notification, ManagerMapping]),
    MailModule,
  ],
  controllers: [AttendanceNotificationController, BirthdayNotificationController],
  providers: [NotificationsService, BirthdayNotificationService],
  exports: [NotificationsService, BirthdayNotificationService],
})
export class NotificationsModule {}
