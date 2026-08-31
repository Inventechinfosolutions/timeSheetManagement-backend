import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from './quarterlyReview/entities/quarterly-review.entity';
import { QuarterlyReviewController } from './quarterlyReview/controllers/quarterly-review.controller';
import { QuarterlyReviewService } from './quarterlyReview/services/quarterly-review.service';
import { ManagerQuarterlyReviewModule } from './ManagerQuaterlyReview/manager-quarterly-review.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuarterlyReview]),
    ManagerQuarterlyReviewModule,
  ],
  controllers: [QuarterlyReviewController],
  providers: [QuarterlyReviewService],
  exports: [QuarterlyReviewService, TypeOrmModule],
})
export class AppraisalModule {}

