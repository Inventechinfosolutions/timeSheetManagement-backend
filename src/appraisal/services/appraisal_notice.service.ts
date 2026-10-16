import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../../common/mail/mail.service';
import { getGeneralNotificationTemplate } from '../../common/mail/templates';
import { Notification } from '../../notifications/entities/notification.entity';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { QuaterlyEnum, AppraisalNoticeType } from '../enums/quarterly_review.enums';
import {
  AppraisalNoticeContent,
  buildAssignmentNotice,
  buildDeadlineReminderNotice,
  buildEditGrantedNotice,
  buildEditRejectedNotice,
  buildEditRequestNotice,
  buildEmployeeEditRequestSentNotice,
  buildEmployeeSubmissionNotice,
  buildOneDayDeadlineReminderNotice,
  buildReassignmentNotice,
  buildReviewCompletedNotice,
  buildSubmissionNotice,
  formatAppraisalNoticeDate,
} from '../constants/appraisal.constants';

export interface AppraisalNoticeInput {
  employeeId: string;
  employeeName: string;
  quarter: QuaterlyEnum;
  financialYear: string;
}

@Injectable()
export class AppraisalNoticeService {
  private readonly logger = new Logger(AppraisalNoticeService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    private readonly mailService: MailService,
  ) {}

  async notifyDeadlineReminder(
    input: AppraisalNoticeInput & { deadlineDate: Date | string | null; force?: boolean },
  ): Promise<void> {
    const formattedDeadline = formatAppraisalNoticeDate(input.deadlineDate);
    const marker = `${input.quarter} ${input.financialYear}`;
    if (!input.force) {
      const sent = await this.notificationRepository.find({
        where: { employeeId: input.employeeId.trim(), type: AppraisalNoticeType.DEADLINE_REMINDER },
      });
      if (sent.some((row) => row.message.includes(marker) && (formattedDeadline === 'not set' || row.message.includes(formattedDeadline)))) {
        return;
      }
    }
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId.trim() },
    });
    await this.deliver(
      input.employeeId.trim(),
      employee?.email,
      employee?.fullName || input.employeeName,
      buildDeadlineReminderNotice(input),
      AppraisalNoticeType.DEADLINE_REMINDER,
    );
  }

  async notifyOneDayDeadlineReminder(
    input: AppraisalNoticeInput & { deadlineDate: Date | string | null; force?: boolean },
  ): Promise<void> {
    const formattedDeadline = formatAppraisalNoticeDate(input.deadlineDate);
    const marker = `${input.quarter} ${input.financialYear}`;
    if (!input.force) {
      const sent = await this.notificationRepository.find({
        where: {
          employeeId: input.employeeId.trim(),
          type: AppraisalNoticeType.ONE_DAY_DEADLINE_REMINDER,
        },
      });
      if (sent.some((row) => row.message.includes(marker) && (formattedDeadline === 'not set' || row.message.includes(formattedDeadline)))) {
        return;
      }
    }
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId.trim() },
    });
    await this.deliver(
      input.employeeId.trim(),
      employee?.email,
      employee?.fullName || input.employeeName,
      buildOneDayDeadlineReminderNotice(input),
      AppraisalNoticeType.ONE_DAY_DEADLINE_REMINDER,
    );
  }

  async notifyEmployeeOfAssignment(
    input: AppraisalNoticeInput & { deadlineDate: Date | string | null },
  ): Promise<void> {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId },
    });
    await this.deliver(
      input.employeeId,
      employee?.email,
      employee?.fullName || input.employeeName,
      buildAssignmentNotice(input),
      AppraisalNoticeType.QUARTER_ASSIGNED,
    );
  }

  async notifyEmployeeOfReassignment(
    input: AppraisalNoticeInput & { deadlineDate: Date | string | null },
  ): Promise<void> {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId },
    });
    await this.deliver(
      input.employeeId,
      employee?.email,
      employee?.fullName || input.employeeName,
      buildReassignmentNotice(input),
      AppraisalNoticeType.QUARTER_REASSIGNED,
    );
  }

  async notifyEmployeeOfSubmission(input: AppraisalNoticeInput): Promise<void> {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId },
    });
    await this.deliver(
      input.employeeId,
      employee?.email,
      employee?.fullName || input.employeeName,
      buildEmployeeSubmissionNotice(input),
      AppraisalNoticeType.SUBMISSION_CONFIRMED,
    );
  }

  async notifyManagerOfSubmission(input: AppraisalNoticeInput): Promise<void> {
    await this.notifyManager(input, buildSubmissionNotice(input), AppraisalNoticeType.SUBMISSION_RECEIVED);
  }

  async notifyManagerOfEditRequest(input: AppraisalNoticeInput): Promise<void> {
    await this.notifyManager(input, buildEditRequestNotice(input), AppraisalNoticeType.EDIT_REQUESTED);
  }

  async notifyEmployeeOfEditRequestSent(input: AppraisalNoticeInput): Promise<void> {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId },
    });
    await this.deliver(
      input.employeeId,
      employee?.email,
      employee?.fullName || input.employeeName,
      buildEmployeeEditRequestSentNotice(input),
      AppraisalNoticeType.EDIT_REQUEST_SENT,
    );
  }

  async notifyEmployeeOfEditGrant(
    input: AppraisalNoticeInput & { editAllowedUntil: Date | string | null },
  ): Promise<void> {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId },
    });
    await this.deliver(
      input.employeeId,
      employee?.email,
      employee?.fullName || input.employeeName,
      buildEditGrantedNotice(input),
      AppraisalNoticeType.EDIT_GRANTED,
    );
  }

  async notifyEmployeeOfEditReject(
    input: AppraisalNoticeInput & { reason?: string | null },
  ): Promise<void> {
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId.trim() },
    });
    await this.deliver(
      input.employeeId.trim(),
      employee?.email,
      employee?.fullName || input.employeeName,
      buildEditRejectedNotice(input),
      AppraisalNoticeType.EDIT_REJECTED,
    );
  }

  private async notifyManager(
    input: AppraisalNoticeInput,
    content: AppraisalNoticeContent,
    type: AppraisalNoticeType,
  ): Promise<void> {
    const trimmedEmpId = input.employeeId?.trim();
    const mapping = await this.managerMappingRepository.findOne({
      where: [
        { employeeId: trimmedEmpId, status: 'ACTIVE' as any },
        { employeeId: trimmedEmpId },
      ],
    });
    const managerId = mapping?.managerId?.trim();
    if (!managerId) {
      this.logger.warn(`No reporting manager mapped for ${input.employeeId}`);
      return;
    }

    const manager = await this.employeeDetailsRepository.findOne({
      where: { employeeId: managerId },
    });

    await this.deliver(
      managerId,
      manager?.email,
      manager?.fullName || mapping?.managerName || managerId,
      content,
      type,
    );
  }

  async notifyEmployeeReviewCompleted(input: AppraisalNoticeInput): Promise<void> {
    const content = buildReviewCompletedNotice(input);
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId },
    });

    await this.deliver(
      input.employeeId,
      employee?.email,
      employee?.fullName || input.employeeName,
      content,
      AppraisalNoticeType.REVIEW_COMPLETED,
    );
  }

  private async deliver(
    recipientEmployeeId: string,
    email: string | null | undefined,
    recipientName: string,
    content: AppraisalNoticeContent,
    type: AppraisalNoticeType,
  ): Promise<void> {
    const cleanId = recipientEmployeeId?.trim();
    if (!cleanId) {
      this.logger.warn('Skipping deliver notice: recipientEmployeeId is empty');
      return;
    }
    try {
      await this.notificationRepository.save({
        employeeId: cleanId,
        title: content.title,
        message: content.message,
        type,
      });
    } catch (error) {
      this.logger.error(
        `In-app notice failed for ${cleanId}: ${error.message}`,
        error.stack,
      );
    }

    if (!email) {
      this.logger.warn(`No email for ${recipientEmployeeId}. Mail was skipped.`);
      return;
    }

    try {
      const html = getGeneralNotificationTemplate({
        recipientName: recipientName || 'Employee',
        title: content.title,
        message: content.message,
      });
      await this.mailService.sendMailAsync(email, content.title, content.message, html);
    } catch (error) {
      this.logger.error(
        `Mail failed for ${recipientName} <${email}>: ${error.message}`,
        error.stack,
      );
    }
  }
}
