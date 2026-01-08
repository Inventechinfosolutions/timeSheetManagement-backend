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
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeAttendance, EmployeeDetails]),
    AuthModule,
  ],
  controllers: [EmployeeAttendanceController, EmployeeDetailsController, EmployeeLinkController],
  providers: [EmployeeAttendanceService, EmployeeDetailsService, EmployeeLinkService],
})
export class EmployeeTimeSheetModule {}
