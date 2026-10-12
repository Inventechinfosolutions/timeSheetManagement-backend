import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmployeePerformance } from '../entities/employee_performance.entity';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { QuarterlyReviewStatus } from '../enums/quarterly_review.enums';
import { AppraisalNoticeService } from './appraisal_notice.service';

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

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 Hours (2 Days) Grace Period

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
  async remindOrCloseOpenReviews(): Promise<void> {
    this.logger.log('Starting daily 5:00 AM appraisal deadline & lock verification...');
    const now = Date.now();

    // 1. Process Unsubmitted Reviews (Parent QuarterlyReview table)
    const openReviews = await this.reviewRepository.find({
      where: { status: In(OPEN_REVIEW_STATUSES) },
    });

    for (const review of openReviews) {
      if (!review.deadlineDate) {
        continue;
      }

      const deadlineDateObj = new Date(review.deadlineDate);
      if (Number.isNaN(deadlineDateObj.getTime())) {
        continue;
      }

      // Deadline completes at the end of that day (23:59:59.999)
      const deadlineEndTime = new Date(
        deadlineDateObj.getFullYear(),
        deadlineDateObj.getMonth(),
        deadlineDateObj.getDate(),
        23,
        59,
        59,
        999,
      ).getTime();

      const gracePeriodEndTime = deadlineEndTime + GRACE_PERIOD_MS;

      // Case A: 48-Hour grace period has expired -> Lock BOTH tables to NOT_UPDATED
      if (now > gracePeriodEndTime) {
        review.status = QuarterlyReviewStatus.NOT_UPDATED;
        await this.reviewRepository.save(review);

        const perf = await this.performanceRepository.findOne({
          where: {
            employeeId: review.employeeId,
            quarter: review.quarter,
            financialYear: review.financialYear,
          },
        });

        if (perf && perf.status !== EmployeePerformanceStatus.NOT_UPDATED) {
          perf.status = EmployeePerformanceStatus.NOT_UPDATED;
          perf.lastModifiedDate = new Date();
          await this.performanceRepository.save(perf);
        }

        this.logger.log(
          `[CRON 5AM] Review #${review.id} for ${review.employeeId} (${review.quarter} ${review.financialYear}) LOCKED to NOT_UPDATED after deadline + 48h grace expired.`,
        );
      } else if (now > deadlineEndTime) {
        // Case B: Deadline passed but still within 48h grace period -> Send reminder notice
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

      const deadlineDateObj = new Date(review.deadlineDate);
      if (Number.isNaN(deadlineDateObj.getTime())) {
        continue;
      }

      const deadlineEndTime = new Date(
        deadlineDateObj.getFullYear(),
        deadlineDateObj.getMonth(),
        deadlineDateObj.getDate(),
        23,
        59,
        59,
        999,
      ).getTime();

      const gracePeriodEndTime = deadlineEndTime + GRACE_PERIOD_MS;

      if (now > gracePeriodEndTime) {
        if (row.status !== EmployeePerformanceStatus.NOT_UPDATED) {
          row.status = EmployeePerformanceStatus.NOT_UPDATED;
          row.lastModifiedDate = new Date();
          await this.performanceRepository.save(row);
        }

        if (review.status !== QuarterlyReviewStatus.NOT_UPDATED) {
          review.status = QuarterlyReviewStatus.NOT_UPDATED;
          await this.reviewRepository.save(review);
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
        review.status = QuarterlyReviewStatus.NOT_UPDATED;
        await this.reviewRepository.save(review);

        perf.status = EmployeePerformanceStatus.NOT_UPDATED;
        perf.lastModifiedDate = new Date();
        await this.performanceRepository.save(perf);

        this.logger.log(
          `[CRON 5AM] Edit-granted review #${review.id} for ${review.employeeId} (${review.quarter} ${review.financialYear}) LOCKED to NOT_UPDATED after editAllowedUntil + 48h expired.`,
        );
      }
    }

    this.logger.log('Completed daily 5:00 AM appraisal deadline & lock verification.');
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
