import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from '../quarterlyReview/entities/quarterly-review.entity';
import { ReviewAssignment } from '../quarterlyReview/entities/review-assignment.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { User } from '../../users/entities/user.entity';
import { ManagerQuarterlyReviewController } from './controllers/manager-quarterly-review.controller';
import { ManagerQuarterlyReviewService } from './services/manager-quarterly-review.service';
import { EmailModule } from '../../email/email.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuarterlyReview, ReviewAssignment, ManagerMapping, EmployeeDetails, User]),
    EmailModule,
    NotificationsModule,
  ],
  controllers: [ManagerQuarterlyReviewController],
  providers: [ManagerQuarterlyReviewService],
  exports: [ManagerQuarterlyReviewService],
})
export class ManagerQuarterlyReviewModule {}
