import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  // Enable CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN') ||
                     configService.get<string>('CORS_ORIGIN_URL') ||
                     '*';
  app.enableCors({
    origin: corsOrigin.split(',').map(origin => origin.trim()),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  // Enable validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(
    configService.get<string>('APP_PORT') ||
      configService.get<string>('PORT') ||
      3900,
  );
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);

  // Log DB connection info last, once the app is fully up.
  const profile = process.env.PROFILE || 'local';
  const dbType = (configService.get<string>('DB_TYPE') || 'postgres').toLowerCase();
  const dbHost = configService.get<string>('DB_HOST') || 'localhost';
  const dbPort = configService.get<string>('DB_PORT') || '';
  const dbUser = configService.get<string>('DB_USERNAME') || '';
  const dbName =
    configService.get<string>('DB_NAME') ||
    configService.get<string>('DB_DATABASE') ||
    'timesheet_db';
  Logger.log(
    `Connected to database [profile="${profile}"] -> ${dbType}://${dbUser}@${dbHost}:${dbPort}/${dbName}`,
    'DatabaseModule',
  );
}
bootstrap();
