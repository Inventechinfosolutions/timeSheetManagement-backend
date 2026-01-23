import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeAttendanceController } from './controllers/employeeAttendance.controller';
import { EmployeeAttendanceService } from './services/employeeAttendance.service';
import { EmployeeAttendance } from './entities/employeeAttendance.entity';
import { EmployeeDetailsController } from './controllers/employeeDetails.controller';
import { EmployeeLinkController } from './controllers/employeeLink.controller';
import { EmployeeDetailsService } from './services/employeeDetails.service';
import { EmployeeLinkService } from './services/employeeLink.service';
import { EmployeeDetails } from './entities/employeeDetails.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { MasterModule } from '../master/master.module';
import { DocumentUploaderModule } from '../common/document-uploader/document-uploader.module';
import { TimesheetBlocker } from './entities/timesheetBlocker.entity';
import { TimesheetBlockerController } from './controllers/timesheetBlocker.controller';
import { TimesheetBlockerService } from './services/timesheetBlocker.service';
import { EmailModule } from '../email/email.module';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveRequestsController } from './controllers/leave-requests.controller';
import { LeaveRequestsService } from './services/leave-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeAttendance, 
      EmployeeDetails, 
      User, 
      TimesheetBlocker,
      LeaveRequest,
    ]),
    UsersModule,
    AuthModule,
    MasterModule,
    DocumentUploaderModule,
    EmailModule,
    NotificationsModule,
  ],
  controllers: [
    EmployeeAttendanceController, 
    EmployeeDetailsController, 
    EmployeeLinkController, 
    TimesheetBlockerController,
    LeaveRequestsController,
  ],
  providers: [
    EmployeeAttendanceService, 
    EmployeeDetailsService, 
    EmployeeLinkService, 
    TimesheetBlockerService,
    LeaveRequestsService,
  ],
  exports: [EmployeeDetailsService, EmployeeLinkService],
})
export class EmployeeTimeSheetModule {}
