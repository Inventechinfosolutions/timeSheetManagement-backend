import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmployeePerformance } from '../entities/employee_performance.entity';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { QuarterlyReviewStatus } from '../enums/quarterly_review.enums';
import { AppraisalNoticeService } from './appraisal_notice.service';
import { deadlineHasArrived, isLockedReviewStatus, isOneDayBeforeDeadline } from '../utils/review-access';
import { SUBMITTABLE_PERFORMANCE_STATUSES } from '../constants/appraisal.constants';

const OPEN_REVIEW_STATUSES: QuarterlyReviewStatus[] = [
  QuarterlyReviewStatus.ASSIGNED,
  QuarterlyReviewStatus.NOT_STARTED,
  QuarterlyReviewStatus.DRAFT,
  QuarterlyReviewStatus.PENDING,
  QuarterlyReviewStatus.IN_PROGRESS,
  QuarterlyReviewStatus.EDIT_GRANTED,
  QuarterlyReviewStatus.ALLOWED_TO_EDIT,
  QuarterlyReviewStatus.APPROVED_FOR_EDITING,
];

const OPEN_PERFORMANCE_STATUSES: readonly EmployeePerformanceStatus[] = SUBMITTABLE_PERFORMANCE_STATUSES;

const EDIT_WINDOW_STATUSES: QuarterlyReviewStatus[] = [
  QuarterlyReviewStatus.ALLOWED_TO_EDIT,
  QuarterlyReviewStatus.EDIT_GRANTED,
  QuarterlyReviewStatus.APPROVED_FOR_EDITING,
];

const GRACE_PERIOD_MS = 0;

@Injectable()
export class AppraisalDeadlineCronService implements OnModuleInit {
  private readonly logger = new Logger(AppraisalDeadlineCronService.name);

  constructor(
    @InjectRepository(EmployeePerformance)
    private readonly performanceRepository: Repository<EmployeePerformance>,
    @InjectRepository(QuarterlyReview)
    private readonly reviewRepository: Repository<QuarterlyReview>,
    private readonly noticeService: AppraisalNoticeService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Running startup appraisal deadline & 1-day reminder check...');
    try {
      await this.remindOrCloseOpenReviews();
    } catch (err) {
      this.logger.warn(`Startup appraisal deadline check failed: ${err.message}`);
    }
  }

  @Cron('*/2 * * * *')
  async remindOrCloseOpenReviews(): Promise<{ locked: number; reminded: number; oneDayReminded: number }> {
    this.logger.log('Starting appraisal deadline & 1-day reminder check...');
    const now = Date.now();
    const previousDate = new Date(now);
    previousDate.setDate(previousDate.getDate() - 1);

    let locked = 0;
    let reminded = 0;
    let oneDayReminded = 0;

    // 1. Process Unsubmitted Reviews (Parent QuarterlyReview table)
    const openReviews = await this.reviewRepository.find({
      where: { status: In(OPEN_REVIEW_STATUSES) },
    });

    for (const review of openReviews) {
      if (!review.deadlineDate) {
        continue;
      }

      const perf = await this.performanceRepository.findOne({
        where: {
          employeeId: review.employeeId,
          quarter: review.quarter,
          financialYear: review.financialYear,
        },
      });

      const isPerfOpen = perf && SUBMITTABLE_PERFORMANCE_STATUSES.includes(perf.status);
      const isSubmitted =
        !isPerfOpen &&
        (perf?.status === EmployeePerformanceStatus.SUBMITTED ||
        perf?.status === EmployeePerformanceStatus.RE_SUBMITTED ||
        perf?.status === EmployeePerformanceStatus.COMPLETED ||
        perf?.status === EmployeePerformanceStatus.REVIEWED ||
        review.status === QuarterlyReviewStatus.SUBMITTED ||
        review.status === QuarterlyReviewStatus.RE_SUBMITTED ||
        review.status === QuarterlyReviewStatus.COMPLETED ||
        review.status === QuarterlyReviewStatus.REVIEWED);

      if (isSubmitted) {
        continue;
      }

      // 1.1 Check if only 1 day is left to submit appraisal
      const effectiveDeadline = perf?.editAllowedUntil || review.deadlineDate;
      if (isOneDayBeforeDeadline(effectiveDeadline, new Date(now))) {
        try {
          await this.noticeService.notifyOneDayDeadlineReminder({
            employeeId: review.employeeId,
            employeeName: review.employeeName || review.employeeId,
            quarter: review.quarter,
            financialYear: review.financialYear,
            deadlineDate: effectiveDeadline,
          });
          oneDayReminded += 1;
          this.logger.log(
            `Dispatched 1-day deadline reminder to ${review.employeeId} for review #${review.id} (${review.quarter} ${review.financialYear})`,
          );
        } catch (noticeErr) {
          this.logger.warn(`Could not send 1-day reminder notice for ${review.employeeId}: ${noticeErr}`);
        }
      }

      // 1.2 Check if deadline has arrived (compare with previous date, not today)
      if (!deadlineHasArrived(review.deadlineDate, previousDate)) {
        continue;
      }

      const renewed = (review.reassignCount || 0) >= 1;
      review.status = QuarterlyReviewStatus.LOCKED;
      await this.reviewRepository.save(review);

      if (perf && !isLockedReviewStatus(perf.status)) {
        perf.status = EmployeePerformanceStatus.LOCKED;
        perf.lastModifiedDate = new Date();
        await this.performanceRepository.save(perf);
      }

      locked += 1;
      this.logger.log(
        `Review #${review.id} for ${review.employeeId} (${review.quarter} ${review.financialYear}) set to LOCKED because the deadline day has arrived.`,
      );

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

      const effectiveDeadline = row.editAllowedUntil || review?.deadlineDate;
      if (effectiveDeadline && isOneDayBeforeDeadline(effectiveDeadline, new Date(now))) {
        try {
          await this.noticeService.notifyOneDayDeadlineReminder({
            employeeId: row.employeeId,
            employeeName: review?.employeeName || row.employeeId,
            quarter: row.quarter,
            financialYear: row.financialYear,
            deadlineDate: effectiveDeadline,
          });
          oneDayReminded += 1;
        } catch (noticeErr) {
          this.logger.warn(`Could not send 1-day reminder for open performance: ${noticeErr}`);
        }
      }

      if (!review?.deadlineDate) {
        continue;
      }

      // Lock if deadline has arrived (compare with previous date, not today)
      if (deadlineHasArrived(review.deadlineDate, previousDate)) {
        if (!isLockedReviewStatus(row.status)) {
          row.status = EmployeePerformanceStatus.LOCKED;
          row.lastModifiedDate = new Date();
          await this.performanceRepository.save(row);
        }

        if (!isLockedReviewStatus(review.status)) {
          review.status = QuarterlyReviewStatus.LOCKED;
          await this.reviewRepository.save(review);
          locked += 1;

          reminded += 1;
          try {
            await this.noticeService.notifyDeadlineReminder({
              employeeId: row.employeeId,
              employeeName: review?.employeeName || row.employeeId,
              quarter: row.quarter,
              financialYear: row.financialYear,
              deadlineDate: review.deadlineDate,
            });
          } catch (noticeErr) {
            this.logger.warn(`Could not send reminder notice in section 2: ${noticeErr}`);
          }
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

      if (isOneDayBeforeDeadline(perf.editAllowedUntil, new Date(now))) {
        try {
          await this.noticeService.notifyOneDayDeadlineReminder({
            employeeId: review.employeeId,
            employeeName: review.employeeName || review.employeeId,
            quarter: review.quarter,
            financialYear: review.financialYear,
            deadlineDate: perf.editAllowedUntil,
          });
          oneDayReminded += 1;
        } catch (noticeErr) {
          this.logger.warn(`Could not send 1-day reminder notice for edit-granted review: ${noticeErr}`);
        }
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

    this.logger.log('Completed appraisal deadline & lock verification.');
    return { locked, reminded, oneDayReminded };
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
