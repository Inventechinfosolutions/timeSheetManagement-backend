import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailService } from './mail.service';

@Processor('mail-queue')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {}

  @Process('send-email')
  async handleSendEmail(job: Job<any>) {
    this.logger.debug(`Processing email job ${job.id}...`);
    const { to, subject, text, html, cc, replyTo } = job.data;
    
    try {
      await this.mailService.sendMail(to, subject, text, html, cc, replyTo);
      this.logger.debug(`Email job ${job.id} completed.`);
    } catch (error) {
      this.logger.error(`Email job ${job.id} failed: ${error.message}`);
      throw error;
    }
  }
}
