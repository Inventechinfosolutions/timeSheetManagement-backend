import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThan } from 'typeorm';
import { ReviewAssignment, AssignmentStatus } from '../entities/review-assignment.entity';
import { QuarterlyReview } from '../entities/quarterly-review.entity';
import { QuarterlyReviewAccessRequest, AccessRequestStatus } from '../entities/quarterly-review-access-request.entity';
import { ReviewStatus } from '../enums/quarterly-review.enum';
import { NotificationsService } from '../../../notifications/Services/notifications.service';
import { MailService } from '../../../common/mail/mail.service';
import {
  getAppraisalQuarterDeadlineApproachingTemplate,
  getAppraisalQuarterDeadlineExpiredTemplate,
} from '../../../common/mail/templates';
import { EmployeeDetails } from '../../../employeeTimeSheet/entities/employeeDetails.entity';
import {
  reminderCopy,
  resolveApproachingReminder,
  type DeadlineReminderKind,
} from '../utils/assignment-deadline.utils';

const OPEN_ASSIGNMENT_STATUSES = [
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.IN_PROGRESS,
  AssignmentStatus.DRAFT,
];

@Injectable()
export class QuarterlyReviewCronService {
  private readonly logger = new Logger(QuarterlyReviewCronService.name);

  constructor(
    @InjectRepository(ReviewAssignment)
    private readonly assignmentRepo: Repository<ReviewAssignment>,
    @InjectRepository(QuarterlyReview)
    private readonly reviewRepo: Repository<QuarterlyReview>,
    @InjectRepository(QuarterlyReviewAccessRequest)
    private readonly accessRequestRepo: Repository<QuarterlyReviewAccessRequest>,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  /** Every 15 minutes: approaching reminders, expired auto-submit, stale access requests. */
  @Cron('*/15 * * * *')
  async handleQuarterlyReviewCron() {
    this.logger.log('[QuarterlyReviewCron] Running deadline reminder and expiry check...');
    await this.sendDeadlineApproachingReminders();
    await this.autoSubmitExpiredAssignments();
    await this.expireOldAccessRequests();
  }

  /**
   * Warn employees whose review is still open and whose deadline is within 72 / 48 / 24 hours.
   * Each tier is sent at most once per assignment (flagged on review_assignments).
   */
  async sendDeadlineApproachingReminders(): Promise<void> {
    const now = new Date();
    try {
      const openAssignments = await this.assignmentRepo.find({
        where: {
          isAccessOpen: 1,
          deadlineAt: MoreThan(now),
          status: In(OPEN_ASSIGNMENT_STATUSES),
        },
      });

      if (openAssignments.length === 0) {
        return;
      }

      let sentCount = 0;
      for (const assignment of openAssignments) {
        const kind = resolveApproachingReminder(assignment.deadlineAt, {
          reminder2dSentAt: assignment.reminder2dSentAt,
          reminder1dSentAt: assignment.reminder1dSentAt,
          reminderTodaySentAt: assignment.reminderTodaySentAt,
        }, now);

        if (!kind) {
          continue;
        }

        try {
          await this.dispatchApproachingReminder(assignment, kind);
          sentCount += 1;
        } catch (itemErr: any) {
          this.logger.error(
            `[QuarterlyReviewCron] Approaching reminder failed for assignment ${assignment.id}: ${itemErr.message}`,
            itemErr.stack,
          );
        }
      }

      if (sentCount > 0) {
        this.logger.log(`[QuarterlyReviewCron] Sent ${sentCount} deadline-approaching reminder(s).`);
      }
    } catch (err: any) {
      this.logger.error(`[QuarterlyReviewCron] Error during approaching reminders: ${err.message}`, err.stack);
    }
  }

  private async resolveEmployeeContact(employeeId: string): Promise<{ name: string; email: string | null }> {
    const empRepo = this.assignmentRepo.manager.getRepository(EmployeeDetails);
    let employee = await empRepo.findOne({ where: { employeeId } });
    if (!employee) {
      employee = await empRepo
        .createQueryBuilder('e')
        .where('LOWER(TRIM(e.employee_id)) = LOWER(TRIM(:id))', { id: employeeId })
        .getOne();
    }

    const email = employee?.email?.trim() || null;
    if (!email) {
      this.logger.warn(
        `[QuarterlyReviewCron] No email on employee_details for ${employeeId}. Inbox notification sent, mail skipped.`,
      );
    }
    return {
      name: employee?.fullName || employeeId,
      email,
    };
  }

  private async sendDeadlineMail(to: string | null, subject: string, text: string, html: string): Promise<void> {
    if (!to) {
      return;
    }
    try {
      // Send over SMTP immediately. Queue-only send was dropping these when Redis/worker lagged.
      await this.mailService.sendMail(to, subject, text, html);
      this.logger.log(`[QuarterlyReviewCron] Email sent to ${to}: ${subject}`);
    } catch (err: any) {
      this.logger.warn(`[QuarterlyReviewCron] Direct SMTP failed for ${to}: ${err.message}. Queuing fallback...`);
      await this.mailService.sendMailAsync(to, subject, text, html);
    }
  }

  private async dispatchApproachingReminder(
    assignment: ReviewAssignment,
    kind: DeadlineReminderKind,
  ): Promise<void> {
    const copy = reminderCopy(kind);
    const { name: employeeName, email } = await this.resolveEmployeeContact(assignment.employeeId);
    const deadline = new Date(assignment.deadlineAt);
    const deadlineLabel = `${deadline.toLocaleDateString('en-IN')} ${deadline.toLocaleTimeString('en-IN')}`;
    const title = `Quarterly Review ${copy.titleSuffix}: ${assignment.quarter}`;
    const message =
      `Your ${assignment.quarter} review deadline is completing ${copy.urgencyLabel} (${deadlineLabel}). ` +
      `Please submit now. If the deadline completes, you will need to request access again.`;

    await this.notificationsService.createNotification({
      employeeId: assignment.employeeId,
      title,
      message,
      type: 'alert',
    });

    const htmlBody = getAppraisalQuarterDeadlineApproachingTemplate({
      employeeName,
      quarter: assignment.quarter,
      deadlineAt: deadline,
      startDate: assignment.startDate || undefined,
      remainingLabel: copy.remainingLabel,
      urgencyLabel: copy.urgencyLabel,
    });
    await this.sendDeadlineMail(email, title, message, htmlBody);

    const sentAt = new Date();
    if (kind === 'today') assignment.reminderTodaySentAt = sentAt;
    if (kind === '1d') assignment.reminder1dSentAt = sentAt;
    if (kind === '2d') assignment.reminder2dSentAt = sentAt;
    assignment.updatedBy = 'SYSTEM_CRON';
    await this.assignmentRepo.save(assignment);
  }

  async autoSubmitExpiredAssignments(): Promise<void> {
    const now = new Date();
    try {
      const expiredAssignments = await this.assignmentRepo.find({
        where: {
          isAccessOpen: 1,
          deadlineAt: LessThanOrEqual(now),
          status: In(OPEN_ASSIGNMENT_STATUSES),
        },
      });

      if (expiredAssignments.length === 0) {
        return;
      }

      this.logger.log(`[QuarterlyReviewCron] Found ${expiredAssignments.length} expired review assignments to auto-submit.`);

      for (const assignment of expiredAssignments) {
        try {
          const eligibleUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

          assignment.status = AssignmentStatus.AUTO_SUBMITTED;
          assignment.isAccessOpen = 0;
          assignment.accessRequestEligibleUntil = eligibleUntil;
          assignment.deadlineExpiredNotifiedAt = now;
          assignment.updatedBy = 'SYSTEM_CRON';
          await this.assignmentRepo.save(assignment);

          let review = await this.reviewRepo.findOne({
            where: [
              { employeeId: assignment.employeeId, quarter: assignment.quarter },
            ],
          });

          if (review) {
            if (
              review.status !== ReviewStatus.SUBMITTED &&
              review.status !== ReviewStatus.APPROVED &&
              review.status !== ReviewStatus.COMPLETED
            ) {
              review.status = ReviewStatus.AUTO_SUBMITTED;
              review.autoSubmitted = 1;
              review.submissionType = 'AUTO';
              review.submittedDate = now;
              review.isReopened = 0;
              review.accessUntil = null;
              review.accessRequestEligibleUntil = eligibleUntil;
              review.updatedBy = 'SYSTEM_CRON';
              await this.reviewRepo.save(review);
            }
          } else {
            review = this.reviewRepo.create({
              employeeId: assignment.employeeId,
              quarter: assignment.quarter,
              status: ReviewStatus.AUTO_SUBMITTED,
              autoSubmitted: 1,
              submissionType: 'AUTO',
              submittedDate: now,
              isReopened: 0,
              accessRequestEligibleUntil: eligibleUntil,
              createdBy: 'SYSTEM_CRON',
              updatedBy: 'SYSTEM_CRON',
              managerName: assignment.assignedByName || 'Manager / Admin',
            } as any) as unknown as QuarterlyReview;
            await this.reviewRepo.save(review as any);
          }

          const { name: employeeName, email } = await this.resolveEmployeeContact(assignment.employeeId);
          const deadline = new Date(assignment.deadlineAt);
          const deadlineLabel = `${deadline.toLocaleDateString('en-IN')} ${deadline.toLocaleTimeString('en-IN')}`;
          const emailTitle = `Quarterly Review Deadline Completed: ${assignment.quarter}`;
          const emailMsg =
            `Hello ${employeeName}, the deadline for your ${assignment.quarter} review is completed (${deadlineLabel}). ` +
            `The form is locked. Please request access again from your Appraisal Dashboard within 24 hours if you still need to complete it.`;

          await this.notificationsService.createNotification({
            employeeId: assignment.employeeId,
            title: emailTitle,
            message:
              `The deadline for your ${assignment.quarter} review is completed. ` +
              `The form is locked. Request access again within 24 hours if you still need to complete it.`,
            type: 'alert',
          });

          const htmlBody = getAppraisalQuarterDeadlineExpiredTemplate({
            employeeName,
            quarter: assignment.quarter,
            deadlineAt: deadline,
            accessEligibleUntil: eligibleUntil,
          });
          await this.sendDeadlineMail(email, emailTitle, emailMsg, htmlBody);

          if (assignment.assignedById && assignment.assignedById !== assignment.employeeId) {
            await this.notificationsService.createNotification({
              employeeId: assignment.assignedById,
              title: 'Employee Review Deadline Completed',
              message:
                `Quarterly review for ${assignment.employeeName || assignment.employeeId} (${assignment.quarter}) ` +
                `was locked after the deadline. The employee can request access again within 24 hours.`,
              type: 'alert',
            });
          }

          this.logger.log(`[QuarterlyReviewCron] Auto-submitted assignment ${assignment.id} for employee ${assignment.employeeId}.`);
        } catch (itemErr: any) {
          this.logger.error(`[QuarterlyReviewCron] Error processing expired assignment ${assignment.id}: ${itemErr.message}`, itemErr.stack);
        }
      }
    } catch (err: any) {
      this.logger.error(`[QuarterlyReviewCron] Error during auto-submit batch: ${err.message}`, err.stack);
    }
  }

  async expireOldAccessRequests(): Promise<void> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pendingOldRequests = await this.accessRequestRepo.find({
        where: {
          status: AccessRequestStatus.PENDING,
          createdAt: LessThanOrEqual(twentyFourHoursAgo),
        },
      });

      for (const req of pendingOldRequests) {
        req.status = 'EXPIRED' as any;
        req.rejectionReason = 'Request expired without action within 24 hours.';
        req.updatedBy = 'SYSTEM_CRON';
        await this.accessRequestRepo.save(req);
      }
    } catch (err: any) {
      this.logger.warn(`[QuarterlyReviewCron] Error expiring old access requests: ${err.message}`);
    }
  }
}
