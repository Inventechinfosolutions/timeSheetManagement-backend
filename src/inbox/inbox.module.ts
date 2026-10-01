import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inbox } from './entities/inbox.entity';
import { Note } from '../notes/entities/note.entity';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { DocumentMetaInfo } from '../common/document-uploader/models/documentmetainfo.model';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { MailModule } from '../common/mail/mail.module';
import { User } from '../users/entities/user.entity';
import { InboxService } from './services/inbox.service';
import { InboxController } from './controllers/inbox.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inbox, Note, EmployeeDetails, DocumentMetaInfo, User]),
    DocumentUploaderModule,
    MailModule,
  ],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
