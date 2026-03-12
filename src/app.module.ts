import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NoCacheInterceptor } from './common/interceptors/no-cache.interceptor';
import { SlidingSessionInterceptor } from './common/interceptors/sliding-session.interceptor';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeeTimeSheetModule } from './employeeTimeSheet/employeeTimeSheet.module';
import { MasterModule } from './master/master.module';
import { ProjectModule } from './projects/project.module';
import { ManagerMappingModule } from './managerMapping/managerMapping.module';
import * as fs from 'fs';
import * as path from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceCronService } from './cron/attendance.cron.service';
import { EmployeeAttendance } from './employeeTimeSheet/entities/employeeAttendance.entity';
import { EmployeeDetails } from './employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping } from './managerMapping/entities/managerMapping.entity';
import { MailModule } from './common/mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { CachingUtil } from './common/utils/caching.util';

function getEnvFiles(): string[] {
  const envPath = path.join(process.cwd(), '.env');
  let profile = 'local'; // default
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const profileMatch = envContent.match(/^PROFILE\s*=\s*(.+)$/m);
    if (profileMatch) {
      profile = profileMatch[1].trim();
    }
  }
  
  // Load profile-specific env file first, then .env as fallback
  return [`.env.${profile}`, '.env'];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFiles(),
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    EmployeeTimeSheetModule,
    MasterModule,
    ProjectModule,
    ManagerMappingModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([EmployeeAttendance, EmployeeDetails, ManagerMapping]),
    MailModule,
    NotificationsModule,
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST');
        if (redisHost && redisHost.trim() !== '') {
          return {
            store: redisStore,
            host: redisHost,
            port: configService.get<number>('REDIS_PORT') || 6379,
            ttl: 600,
          };
        }
        // No Redis: use in-memory store so app works and we avoid stale cache issues
        return { ttl: 0 };
      },
      inject: [ConfigService],
    }),
    ManagerMappingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AttendanceCronService,
    CachingUtil,
    {
      provide: APP_INTERCEPTOR,
      useClass: NoCacheInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SlidingSessionInterceptor,
    },
  ],
})
// Registered ManagerMappingModule
export class AppModule {}
