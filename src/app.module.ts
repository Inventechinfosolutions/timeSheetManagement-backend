import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NoCacheInterceptor } from './common/interceptors/no-cache.interceptor';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeeTimeSheetModule } from './employeeTimeSheet/employeeTimeSheet.module';
import { MasterModule } from './master/master.module';
import * as fs from 'fs';
import * as path from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceCronService } from './cron/attendance.cron.service';
import { EmployeeAttendance } from './employeeTimeSheet/entities/employeeAttendance.entity';
import { EmployeeDetails } from './employeeTimeSheet/entities/employeeDetails.entity';
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
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([EmployeeAttendance, EmployeeDetails]),
    MailModule,
    NotificationsModule,
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('REDIS_HOST'),
        port: configService.get('REDIS_PORT'),
        ttl: 600,
      }),
      inject: [ConfigService],
    }),
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
  ],
})
export class AppModule {}
