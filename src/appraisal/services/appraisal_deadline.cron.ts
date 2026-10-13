import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmployeePerformance } from '../entities/employee_performance.entity';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { QuarterlyReviewStatus } from '../enums/quarterly_review.enums';
import { AppraisalNoticeService } from './appraisal_notice.service';
import { deadlineHasArrived, isLockedReviewStatus } from '../utils/review-access';

const OPEN_REVIEW_STATUSES: QuarterlyReviewStatus[] = [
  QuarterlyReviewStatus.ASSIGNED,
  QuarterlyReviewStatus.NOT_STARTED,
  QuarterlyReviewStatus.DRAFT,
  QuarterlyReviewStatus.PENDING,
  QuarterlyReviewStatus.IN_PROGRESS,
];

const OPEN_PERFORMANCE_STATUSES: EmployeePerformanceStatus[] = [
  EmployeePerformanceStatus.NOT_STARTED,
  EmployeePerformanceStatus.DRAFT,
  EmployeePerformanceStatus.PENDING,
  EmployeePerformanceStatus.IN_PROGRESS,
];

const EDIT_WINDOW_STATUSES: QuarterlyReviewStatus[] = [
  QuarterlyReviewStatus.ALLOWED_TO_EDIT,
  QuarterlyReviewStatus.EDIT_GRANTED,
  QuarterlyReviewStatus.APPROVED_FOR_EDITING,
];

const GRACE_PERIOD_MS = 0;

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

  @Cron('0 5 * * *')
  async remindOrCloseOpenReviews(): Promise<{ locked: number; reminded: number }> {
    this.logger.log('Starting daily 5:00 AM appraisal deadline & lock verification...');
    const now = Date.now();
    let locked = 0;
    let reminded = 0;

    // 1. Process Unsubmitted Reviews (Parent QuarterlyReview table)
    const openReviews = await this.reviewRepository.find({
      where: { status: In(OPEN_REVIEW_STATUSES) },
    });

    for (const review of openReviews) {
      if (!review.deadlineDate) {
        continue;
      }

      if (!deadlineHasArrived(review.deadlineDate)) {
        continue;
      }

      const renewed = (review.reassignCount || 0) >= 1;
      review.status = QuarterlyReviewStatus.LOCKED;
      await this.reviewRepository.save(review);

      const perf = await this.performanceRepository.findOne({
        where: {
          employeeId: review.employeeId,
          quarter: review.quarter,
          financialYear: review.financialYear,
        },
      });

      if (perf && !isLockedReviewStatus(perf.status)) {
        perf.status = EmployeePerformanceStatus.LOCKED;
        perf.lastModifiedDate = new Date();
        await this.performanceRepository.save(perf);
      }

      locked += 1;
      this.logger.log(
        `[CRON 5AM] Review #${review.id} for ${review.employeeId} (${review.quarter} ${review.financialYear}) set to LOCKED because the deadline day has arrived.`,
      );

      if (!renewed) {
        reminded += 1;
        try {
          await this.noticeService.notifyDeadlineReminder({
            employeeId: review.employeeId,
            employeeName: review.employeeName || review.employeeId,
            quarter: review.quarter,
            financialYear: review.financialYear,
            deadlineDate: review.deadlineDate,
          });
        } catch (noticeErr) {
          this.logger.warn(`Could not send reminder notice: ${noticeErr}`);
        }
      }
    }

    // 2. Check open EmployeePerformance rows and ensure sync with parent
    const openPerfRows = await this.performanceRepository.find({
      where: { status: In(OPEN_PERFORMANCE_STATUSES) },
    });

    for (const row of openPerfRows) {
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

      if (deadlineHasArrived(review.deadlineDate)) {
        if (!isLockedReviewStatus(row.status)) {
          row.status = EmployeePerformanceStatus.LOCKED;
          row.lastModifiedDate = new Date();
          await this.performanceRepository.save(row);
        }

        if (!isLockedReviewStatus(review.status)) {
          review.status = QuarterlyReviewStatus.LOCKED;
          await this.reviewRepository.save(review);
          locked += 1;
        }
      }
    }

    // 3. Process Reviews Granted Edit Access (ALLOWED_TO_EDIT / EDIT_GRANTED)
    const editReviews = await this.reviewRepository.find({
      where: { status: In(EDIT_WINDOW_STATUSES) },
    });

    for (const review of editReviews) {
      const perf = await this.performanceRepository.findOne({
        where: {
          employeeId: review.employeeId,
          quarter: review.quarter,
          financialYear: review.financialYear,
        },
      });

      if (!perf?.editAllowedUntil) {
        continue;
      }

      const editUntilTime = new Date(perf.editAllowedUntil).getTime();
      if (Number.isNaN(editUntilTime)) {
        continue;
      }

      const editGracePeriodEndTime = editUntilTime + GRACE_PERIOD_MS;

      // If the 48-hour window past editAllowedUntil has expired without re-submission -> Lock both
      if (now > editGracePeriodEndTime) {
        review.status = QuarterlyReviewStatus.LOCKED;
        await this.reviewRepository.save(review);

        perf.status = EmployeePerformanceStatus.LOCKED;
        perf.lastModifiedDate = new Date();
        await this.performanceRepository.save(perf);

        locked += 1;
        this.logger.log(
          `[CRON 5AM] Edit-granted review #${review.id} for ${review.employeeId} (${review.quarter} ${review.financialYear}) set to LOCKED after the edit window expired.`,
        );
      }
    }

    this.logger.log('Completed daily 5:00 AM appraisal deadline & lock verification.');
    return { locked, reminded };
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
