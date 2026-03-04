import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    htmlContent: string,
    replyTo?: string,
    cc?: string[],
  ) {
    const mailOptions: Record<string, unknown> = {
      from: process.env.MAIL_FROM || process.env['mail.FROM'],
      to,
      subject,
      text,
      html: htmlContent,
      replyTo,
    };
    if (cc && cc.length > 0) {
      mailOptions.cc = cc;
    }
    await this.transporter.sendMail(mailOptions);
  }
}
