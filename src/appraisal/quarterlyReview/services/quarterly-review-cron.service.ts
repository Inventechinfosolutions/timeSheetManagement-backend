import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual } from 'typeorm';
import { ReviewAssignment, AssignmentStatus } from '../entities/review-assignment.entity';
import { QuarterlyReview } from '../entities/quarterly-review.entity';
import { QuarterlyReviewAccessRequest, AccessRequestStatus } from '../entities/quarterly-review-access-request.entity';
import { ReviewStatus } from '../enums/quarterly-review.enum';
import { NotificationsService } from '../../../notifications/Services/notifications.service';
import { MailService } from '../../../common/mail/mail.service';
import { EmployeeDetails } from '../../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../../managerMapping/entities/managerMapping.entity';

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

  /** Run every 15 minutes to check for expired assignment deadlines and 24-hr access request windows */
  @Cron('*/15 * * * *')
  async handleQuarterlyReviewCron() {
    this.logger.log('[QuarterlyReviewCron] Running periodic check for expired assignments and access windows...');
    await this.autoSubmitExpiredAssignments();
    await this.expireOldAccessRequests();
  }

  async autoSubmitExpiredAssignments(): Promise<void> {
    const now = new Date();
    try {
      const expiredAssignments = await this.assignmentRepo.find({
        where: {
          isAccessOpen: 1,
          deadlineAt: LessThanOrEqual(now),
          status: In([AssignmentStatus.ASSIGNED, AssignmentStatus.IN_PROGRESS, AssignmentStatus.DRAFT]),
        },
      });

      if (expiredAssignments.length === 0) {
        return;
      }

      this.logger.log(`[QuarterlyReviewCron] Found ${expiredAssignments.length} expired review assignments to auto-submit.`);

      for (const assignment of expiredAssignments) {
        try {
          const eligibleUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h request access window

          // 1. Update assignment
          assignment.status = AssignmentStatus.AUTO_SUBMITTED;
          assignment.isAccessOpen = 0;
          assignment.accessRequestEligibleUntil = eligibleUntil;
          assignment.updatedBy = 'SYSTEM_CRON';
          await this.assignmentRepo.save(assignment);

          // 2. Find or create quarterly review record
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

          // 3. Send Notification & Email to Employee
          const empRepo = this.assignmentRepo.manager.getRepository(EmployeeDetails);
          const employee = await empRepo.findOne({ where: { employeeId: assignment.employeeId } });

          await this.notificationsService.createNotification({
            employeeId: assignment.employeeId,
            title: 'Quarterly Review Auto-Submitted',
            message: `Your quarterly review for ${assignment.quarter} was automatically submitted because the 3-day deadline expired. You have 24 hours to request access if needed.`,
            type: 'alert',
          });

          if (employee?.email) {
            const emailTitle = `Quarterly Review Auto-Submitted: ${assignment.quarter}`;
            const emailMsg = `Hello ${employee.fullName || 'Employee'},\n\nYour quarterly review for ${assignment.quarter} has been automatically submitted as the deadline has passed.\n\nIf you still need to make changes, you may request an access extension within 24 hours directly from your Appraisal Dashboard.\n\nRegards,\nWorkSphere HR Team`;
            await this.mailService.sendMailAsync(employee.email, emailTitle, emailMsg);
          }

          // 4. Notify Assigner (Manager / Admin / CEO)
          if (assignment.assignedById && assignment.assignedById !== assignment.employeeId) {
            await this.notificationsService.createNotification({
              employeeId: assignment.assignedById,
              title: 'Employee Review Auto-Submitted',
              message: `Quarterly review for ${assignment.employeeName || assignment.employeeId} (${assignment.quarter}) was automatically submitted upon deadline expiry.`,
              type: 'info',
            });
          }

          this.logger.log(`[QuarterlyReviewCron] Successfully auto-submitted assignment ${assignment.id} for employee ${assignment.employeeId}.`);
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