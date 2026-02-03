import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { RolePermission } from './entities/rolePermission.entity';
import { UsersService } from './service/user.service';
import { RolePermissionService } from './service/rolePermission.service';
import { UsersController } from './controller/user.controller';
import { RolePermissionController } from './controller/rolePermission.controller';
import { AuthModule } from '../auth/auth.module';
import { PublicController } from './controller/public.controller';
import { PublicService } from './service/public.service';
import { EmployeeLinkService } from './service/employee-link.service';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmployeeDetails, RolePermission]), 
    forwardRef(() => AuthModule)
  ],
  controllers: [UsersController, PublicController, RolePermissionController],
  providers: [UsersService, PublicService, EmployeeLinkService, RolePermissionService],
  exports: [UsersService, PublicService, EmployeeLinkService, RolePermissionService],
})
export class UsersModule {}
