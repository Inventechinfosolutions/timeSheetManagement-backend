import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmployeePerformance } from '../entities/employee_performance.entity';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { AppraisalNoticeService } from './appraisal_notice.service';

const OPEN_PERFORMANCE_STATUSES: EmployeePerformanceStatus[] = [
  EmployeePerformanceStatus.NOT_STARTED,
  EmployeePerformanceStatus.DRAFT,
  EmployeePerformanceStatus.PENDING,
  EmployeePerformanceStatus.IN_PROGRESS,
];

@Injectable()
export class AppraisalDeadlineCronService {
  private readonly logger = new Logger(AppraisalDeadlineCronService.name);

  constructor(
    @InjectRepository(EmployeePerformance)
    private readonly performanceRepository: Repository<EmployeePerformance>,
    @InjectRepository(QuarterlyReview)
    private readonly reviewRepository: Repository<QuarterlyReview>,
    private readonly noticeService: AppraisalNoticeService,
  ) {}

  @Cron('0 8 * * *')
  async remindOrCloseOpenReviews(): Promise<void> {
    const openRows = await this.performanceRepository.find({
      where: { status: In(OPEN_PERFORMANCE_STATUSES) },
    });
    const today = this.datePart(new Date());

    for (const row of openRows) {
      const review = await this.reviewRepository.findOne({
        where: {
          employeeId: row.employeeId,
          quarter: row.quarter,
          financialYear: row.financialYear,
        },
      });
      if (!review?.deadlineDate) {
        continue;
      }
      const deadline = this.datePart(new Date(review.deadlineDate));
      if (!deadline) {
        continue;
      }
      if (today <= deadline) {
        await this.noticeService.notifyDeadlineReminder({
          employeeId: row.employeeId,
          employeeName: review.employeeName || row.employeeId,
          quarter: row.quarter,
          financialYear: row.financialYear,
          deadlineDate: review.deadlineDate,
        });
        continue;
      }
      row.status = EmployeePerformanceStatus.NOT_UPDATED;
      row.lastModifiedDate = new Date();
      await this.performanceRepository.save(row);
      this.logger.log(
        `Marked ${row.employeeId} ${row.quarter} ${row.financialYear} as not updated after the deadline.`,
      );
    }
  }

  private datePart(value: Date): string {
    if (Number.isNaN(value.getTime())) {
      return '';
    }
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
}
