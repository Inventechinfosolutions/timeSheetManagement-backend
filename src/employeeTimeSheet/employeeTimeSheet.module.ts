import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeAttendanceController } from './controllers/employeeAttendance.controller';
import { EmployeeAttendanceService } from './services/employeeAttendance.service';
import { EmployeeAttendance } from './entities/employeeAttendance.entity';
import { EmployeeDetailsController } from './controllers/employeeDetails.controller';
import { EmployeeDetailsService } from './services/employeeDetails.service';
import { EmployeeDetails } from './entities/employeeDetails.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeAttendance, EmployeeDetails]),
  ],
  controllers: [EmployeeAttendanceController, EmployeeDetailsController],
  providers: [EmployeeAttendanceService, EmployeeDetailsService],
})
export class EmployeeTimeSheetModule {}
