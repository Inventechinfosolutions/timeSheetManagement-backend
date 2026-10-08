import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuarterlyReview } from './entities/quarterly_review.entities';
import { EmployeePerformance } from './entities/employee_performance.entity';
import { AnnualAppraisalSummary } from './entities/annual_appraisal.entity';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping } from '../managerMapping/entities/managerMapping.entity';
import { QuarterlyReviewService } from './services/quarterly_review.service';
import { EmployeePerformanceService } from './services/employee_performance.service';
import { AnnualAppraisalService } from './services/annual_appraisal.service';
import { QuarterlyReviewController, QuarterlyReviewPerformanceController } from './controller/quarterly_review.controller';
import { EmployeePerformanceController } from './controller/employee_performance.controller';
import { AnnualAppraisalController } from './controller/annual_appraisal.controller';
import { AppraisalNoticeService } from './services/appraisal_notice.service';
import { AppraisalDeadlineCronService } from './services/appraisal_deadline.cron';
import { Notification } from '../notifications/entities/notification.entity';
import { MailModule } from '../common/mail/mail.module';
import { UsersModule } from '../users/users.module';
import { MasterModule } from '../master/master.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuarterlyReview,
      EmployeePerformance,
      AnnualAppraisalSummary,
      EmployeeDetails,
      ManagerMapping,
      Notification,
    ]),
    MailModule,
    UsersModule,
    MasterModule,
  ],
  controllers: [
    QuarterlyReviewController,
    QuarterlyReviewPerformanceController,
    EmployeePerformanceController,
    AnnualAppraisalController,
  ],
  providers: [
    QuarterlyReviewService,
    EmployeePerformanceService,
    AnnualAppraisalService,
    AppraisalNoticeService,
    AppraisalDeadlineCronService,
  ],
  exports: [
    QuarterlyReviewService,
    EmployeePerformanceService,
    AnnualAppraisalService,
    TypeOrmModule,
  ],
})
export class AppraisalModule {}
