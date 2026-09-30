import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('mail-queue') private readonly mailQueue: Queue,
  ) {
    this.createTransporter();
  }

  async sendMailAsync(
    to: string,
    subject: string,
    text: string,
    html?: string,
    cc?: string[],
    replyTo?: string,
    attachments?: Array<{ filename: string; content?: any; path?: string; encoding?: string; contentType?: string }>,
  ) {
    this.logger.debug(`Adding email job to queue for ${to}...`);
    this.mailQueue.add('send-email', {
      to,
      subject,
      text,
      html,
      cc,
      replyTo,
      attachments,
    }).catch(err => {
      this.logger.error(`Failed to add email job to queue for ${to}: ${err.message}`);
    });
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
      secure: false, // Mailtrap/Office365 often require false for 587
      auth: {
        user,
        pass,
      },
    });
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    cc?: string[],
    replyTo?: string,
    attachments?: Array<{ filename: string; content?: any; path?: string; encoding?: string; contentType?: string }>,
  ) {
    if (!this.transporter) {
      this.logger.warn('Transporter not initialized. Cannot send email.');
      return;
    }

    const from =
      this.configService.get<string>('mail.FROM') ||
      this.configService.get<string>('SMTP_USERNAME') ||
      'noreply@timesheet.com';

    const finalAttachments: any[] = attachments ? [...attachments] : [];
    if (html && (html.includes('cid:inventech-logo') || html.includes('cid:in-logo'))) {
      const alreadyHasLogo = finalAttachments.some(
        (a) => a.cid === 'inventech-logo' || a.cid === 'in-logo',
      );
      if (!alreadyHasLogo) {
        const logoCandidates = [
          path.join(process.cwd(), 'assets/in-logo.png'),
          path.join(process.cwd(), 'src/assets/in-logo.png'),
          path.join(__dirname, '../../../assets/in-logo.png'),
          path.join(__dirname, '../../assets/in-logo.png'),
          'c:\\Timesheet\\timeSheetManagement-backend\\assets\\in-logo.png',
        ];
        for (const lp of logoCandidates) {
          if (fs.existsSync(lp)) {
            finalAttachments.push({
              filename: 'in-logo.png',
              path: lp,
              cid: 'inventech-logo',
              contentType: 'image/png',
            });
            break;
          }
        }
      }
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
        cc,
        replyTo,
        attachments: finalAttachments.length > 0 ? finalAttachments : undefined,
      });
      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error.stack);
      throw error; // Re-throw to allow queue retry/failure tracking
    }
  }
}
