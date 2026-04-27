import { Injectable } from '@nestjs/common';
import { MailService } from '../common/mail/mail.service';

@Injectable()
export class EmailService {
  constructor(private readonly mailService: MailService) {}

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    htmlContent: string,
    replyTo?: string,
    cc?: string[],
  ) {
    // Forward to MailService which uses the Bull queue
    await this.mailService.sendMailAsync(
      to,
      subject,
      text,
      htmlContent,
      cc,
      replyTo,
    );
  }
}
