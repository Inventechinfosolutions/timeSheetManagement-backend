import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './service/user.service';
import { UsersController } from './controller/user.controller';
import { AuthModule } from '../auth/auth.module';
import { PublicController } from './controller/public.controller';
import { PublicService } from './service/public.service';
import { EmployeeLinkService } from './service/employee-link.service';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmployeeDetails]), 
    forwardRef(() => AuthModule)
  ],
  controllers: [UsersController, PublicController],
  providers: [UsersService, PublicService, EmployeeLinkService],
  exports: [UsersService, PublicService, EmployeeLinkService],
})
export class UsersModule {}
