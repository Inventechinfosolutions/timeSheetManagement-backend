import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.createTransporter();
  }

  private createTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USERNAME');
    const pass = this.configService.get<string>('SMTP_PASSWORD');
    const secure = this.configService.get<boolean>('SMTP_SECURE', false);

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP configuration is missing. MailService will not send emails.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false, // Mailtrap requires false for ports 2525, 587, 25 
      auth: {
        user,
        pass,
      },
    });
  }

  async sendMail(to: string, subject: string, text: string, html?: string) {
    if (!this.transporter) {
      this.logger.warn('Transporter not initialized. Cannot send email.');
      return;
    }

    const from =
      this.configService.get<string>('mail.FROM') ||
      'noreply@timesheet.com';

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error.stack);
    }
  }
}
