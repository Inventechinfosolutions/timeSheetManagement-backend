import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './Services/notifications.service';
import { AttendanceNotificationController } from './Controllers/attendance-notification.controller';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { Notification } from './entities/notification.entity';
import { MailModule } from '../common/mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeDetails, Notification]),
    MailModule,
  ],
  controllers: [AttendanceNotificationController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
