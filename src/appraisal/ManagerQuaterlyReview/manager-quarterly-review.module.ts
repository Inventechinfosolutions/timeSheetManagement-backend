import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from '../quarterlyReview/entities/quarterly-review.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerQuarterlyReviewController } from './controllers/manager-quarterly-review.controller';
import { ManagerQuarterlyReviewService } from './services/manager-quarterly-review.service';
import { EmailModule } from '../../email/email.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuarterlyReview, ManagerMapping, EmployeeDetails]),
    EmailModule,
    NotificationsModule,
  ],
  controllers: [ManagerQuarterlyReviewController],
  providers: [ManagerQuarterlyReviewService],
  exports: [ManagerQuarterlyReviewService],
})
export class ManagerQuarterlyReviewModule {}

