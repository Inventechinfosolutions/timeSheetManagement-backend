import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';
import { NoteRecipient, MasterNotePermission } from './entities/note-recipient.entity';
import { NotesService } from './services/notes.service';
import { NotesController } from './controllers/notes.controller';
import { NotePermissionGuard } from './guards/note-permission.guard';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { DocumentMetaInfo } from '../common/document-uploader/models/documentmetainfo.model';
import { InboxModule } from '../inbox/inbox.module';
import { Inbox } from '../inbox/entities/inbox.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Note, DocumentMetaInfo, NoteRecipient, MasterNotePermission, Inbox]),
    DocumentUploaderModule,
    forwardRef(() => InboxModule),
  ],
  controllers: [NotesController],
  providers: [NotesService, NotePermissionGuard],
  exports: [NotesService, NotePermissionGuard],
})
export class NotesModule {}
