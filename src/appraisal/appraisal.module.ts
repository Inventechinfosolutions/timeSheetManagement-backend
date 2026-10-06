import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from './entities/quarterly_review.entities';
import { EmployeePerformance } from './entities/employee_performance.entity';
import { QuarterlyReviewService } from './services/quarterly_review.service';
import { EmployeePerformanceService } from './services/employee_performance.service';
import { QuarterlyReviewController } from './controller/quarterly_review.controller';
import { EmployeePerformanceController } from './controller/employee_performance.controller';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';

@Module({
  imports: [TypeOrmModule.forFeature([QuarterlyReview, EmployeePerformance, EmployeeDetails])],
  controllers: [QuarterlyReviewController, EmployeePerformanceController],
  providers: [QuarterlyReviewService, EmployeePerformanceService],
  exports: [QuarterlyReviewService, EmployeePerformanceService, TypeOrmModule],
})
export class AppraisalModule { }
