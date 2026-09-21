import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeNote } from './entities/employee-note.entity';
import { EmployeeNotesService } from './employee-notes.service';
import { EmployeeNotesController } from './employee-notes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeNote])],
  controllers: [EmployeeNotesController],
  providers: [EmployeeNotesService],
  exports: [EmployeeNotesService],
})
export class EmployeeNotesModule {}