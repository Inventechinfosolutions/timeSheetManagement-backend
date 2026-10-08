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
  buildEditRequestNotice,
  buildEmployeeSubmissionNotice,
  buildReviewCompletedNotice,
  buildSubmissionNotice,
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
    input: AppraisalNoticeInput & { deadlineDate: Date | string | null },
  ): Promise<void> {
    const marker = `${input.quarter} ${input.financialYear}`;
    const sent = await this.notificationRepository.find({
      where: { employeeId: input.employeeId, type: AppraisalNoticeType.DEADLINE_REMINDER },
    });
    if (sent.some((row) => row.message.includes(marker))) {
      return;
    }
    const employee = await this.employeeDetailsRepository.findOne({
      where: { employeeId: input.employeeId },
    });
    await this.deliver(
      input.employeeId,
      employee?.email,
      employee?.fullName || input.employeeName,
      buildDeadlineReminderNotice(input),
      AppraisalNoticeType.DEADLINE_REMINDER,
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

  private async notifyManager(
    input: AppraisalNoticeInput,
    content: AppraisalNoticeContent,
    type: AppraisalNoticeType,
  ): Promise<void> {
    const mapping = await this.managerMappingRepository.findOne({
      where: { employeeId: input.employeeId },
    });
    const managerId = mapping?.managerId;
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
    try {
      await this.notificationRepository.save({
        employeeId: recipientEmployeeId,
        title: content.title,
        message: content.message,
        type,
      });
    } catch (error) {
      this.logger.error(
        `In-app notice failed for ${recipientEmployeeId}: ${error.message}`,
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
