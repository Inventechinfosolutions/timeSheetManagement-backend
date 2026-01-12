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

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeAttendance, EmployeeDetails, User]),
    UsersModule,
    AuthModule,
  ],
  controllers: [
    EmployeeAttendanceController, 
    EmployeeDetailsController, 
    EmployeeLinkController, 
    PublicController
  ],
  providers: [
    EmployeeAttendanceService, 
    EmployeeDetailsService, 
    EmployeeLinkService, 
    PublicService
  ],
  exports: [EmployeeDetailsService, EmployeeLinkService],
})
export class EmployeeTimeSheetModule {}
