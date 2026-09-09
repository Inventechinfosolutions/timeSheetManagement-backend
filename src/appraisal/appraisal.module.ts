import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from './quarterlyReview/entities/quarterly-review.entity';
import { QuarterlyReviewAccessRequest } from './quarterlyReview/entities/quarterly-review-access-request.entity';
import { ReviewAssignment } from './quarterlyReview/entities/review-assignment.entity';
import { QuarterlyReviewController } from './quarterlyReview/controllers/quarterly-review.controller';
import { QuarterlyReviewService } from './quarterlyReview/services/quarterly-review.service';
import { QuarterlyReviewCronService } from './quarterlyReview/services/quarterly-review-cron.service';
import { ManagerQuarterlyReviewModule } from './ManagerQuaterlyReview/manager-quarterly-review.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FileService } from '../common/core/utils/fileType.utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuarterlyReview, QuarterlyReviewAccessRequest, ReviewAssignment]),
    ManagerQuarterlyReviewModule,
    NotificationsModule,
  ],
  controllers: [QuarterlyReviewController],
  providers: [QuarterlyReviewService, QuarterlyReviewCronService, FileService],
  exports: [QuarterlyReviewService, QuarterlyReviewCronService, TypeOrmModule],
})
export class AppraisalModule {}