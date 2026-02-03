import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  
  // Create uploads directories if they don't exist
  const uploadDirs = [
    'uploads/projects/photos',
    'uploads/projects/files'
  ];
  
  uploadDirs.forEach(dir => {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  });
  
  // Serve static files
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
  
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

  const port:any  = process.env.APP_PORT ;
  await app.listen(port);
  //console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
