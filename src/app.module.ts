import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeeTimeSheetModule } from './employeeTimeSheet/employeeTimeSheet.module';
import * as fs from 'fs';
import * as path from 'path';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
