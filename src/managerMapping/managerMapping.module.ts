import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagerMapping } from './entities/managerMapping.entity';
import { User } from '../users/entities/user.entity';
import { ManagerMappingService } from './services/managerMapping.service';
import { ManagerMappingController } from './controllers/managerMapping.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ManagerMapping, User])],
  controllers: [ManagerMappingController],
  providers: [ManagerMappingService],
  exports: [ManagerMappingService, TypeOrmModule],
})
export class ManagerMappingModule {}
