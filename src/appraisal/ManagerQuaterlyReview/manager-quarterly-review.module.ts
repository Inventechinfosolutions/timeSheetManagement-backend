import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from '../quarterlyReview/entities/quarterly-review.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerQuarterlyReviewController } from './controllers/manager-quarterly-review.controller';
import { ManagerQuarterlyReviewService } from './services/manager-quarterly-review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuarterlyReview, ManagerMapping, EmployeeDetails]),
  ],
  controllers: [ManagerQuarterlyReviewController],
  providers: [ManagerQuarterlyReviewService],
  exports: [ManagerQuarterlyReviewService],
})
export class ManagerQuarterlyReviewModule {}
