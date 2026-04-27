import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { MailProcessor } from './mail.processor';

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'mail-queue',
    }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService, BullModule],
})
export class MailModule {}
