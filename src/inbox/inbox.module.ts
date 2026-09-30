import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inbox } from './entities/inbox.entity';
import { Note } from '../notes/entities/note.entity';
import { NoteRecipient } from '../notes/entities/note-recipient.entity';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { DocumentMetaInfo } from '../common/document-uploader/models/documentmetainfo.model';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { MailModule } from '../common/mail/mail.module';
import { InboxService } from './services/inbox.service';
import { InboxController } from './controllers/inbox.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inbox, Note, NoteRecipient, EmployeeDetails, DocumentMetaInfo]),
    DocumentUploaderModule,
    MailModule,
  ],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
