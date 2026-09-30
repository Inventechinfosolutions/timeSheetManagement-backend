import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';
import { NoteRecipient } from './entities/note-recipient.entity';
import { NotesService } from './services/notes.service';
import { NotesController } from './controllers/notes.controller';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { DocumentMetaInfo } from '../common/document-uploader/models/documentmetainfo.model';
import { InboxModule } from '../inbox/inbox.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Note, DocumentMetaInfo, NoteRecipient]),
    DocumentUploaderModule,
    forwardRef(() => InboxModule),
  ],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}

