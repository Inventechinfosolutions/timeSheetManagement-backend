import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';
import { NotesService } from './services/notes.service';
import { NotesController } from './controllers/notes.controller';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Note]),
    DocumentUploaderModule,
  ],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}

