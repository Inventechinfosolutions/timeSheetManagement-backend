import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeAttendanceController } from './controllers/employeeAttendance.controller';
import { EmployeeAttendanceService } from './services/employeeAttendance.service';
import { EmployeeAttendance } from './entities/employeeAttendance.entity';
import { EmployeeDetailsController } from './controllers/employeeDetails.controller';
import { EmployeeLinkController } from './controllers/employeeLink.controller';
import { PublicController } from './controllers/public.controller';
import { EmployeeDetailsService } from './services/employeeDetails.service';
import { EmployeeLinkService } from './services/employeeLink.service';
import { PublicService } from './services/public.service';
import { EmployeeDetails } from './entities/employeeDetails.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { MasterModule } from '../master/master.module';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { TimesheetBlocker } from './entities/timesheetBlocker.entity';
import { TimesheetBlockerController } from './controllers/timesheetBlocker.controller';
import { TimesheetBlockerService } from './services/timesheetBlocker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeAttendance, EmployeeDetails, User, TimesheetBlocker]),
    UsersModule,
    AuthModule,
    MasterModule,
    DocumentUploaderModule,
  ],
  controllers: [
    EmployeeAttendanceController, 
    EmployeeDetailsController, 
    EmployeeLinkController, 
    PublicController,
    TimesheetBlockerController
  ],
  providers: [
    EmployeeAttendanceService, 
    EmployeeDetailsService, 
    EmployeeLinkService, 
    PublicService,
    TimesheetBlockerService
  ],
  exports: [EmployeeDetailsService, EmployeeLinkService],
})
export class EmployeeTimeSheetModule {}
