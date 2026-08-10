import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from './quarterlyReview/entities/quarterly-review.entity';
import { QuarterlyReviewController } from './quarterlyReview/controllers/quarterly-review.controller';
import { QuarterlyReviewService } from './quarterlyReview/services/quarterly-review.service';
import { FileService } from '../common/core/utils/fileType.utils';

@Module({
  imports: [TypeOrmModule.forFeature([QuarterlyReview])],
  controllers: [QuarterlyReviewController],
  providers: [QuarterlyReviewService, FileService],
  exports: [QuarterlyReviewService, TypeOrmModule],
})
export class AppraisalModule {}

