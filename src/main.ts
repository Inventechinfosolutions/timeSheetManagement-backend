import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Enable CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN') || 
                     configService.get<string>('CORS_ORIGIN_URL') || 
                     '*';
  app.enableCors({
    origin: corsOrigin.split(',').map(origin => origin.trim()),
    credentials: true,
  });

  // Enable validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('PORT') || 
               configService.get<number>('APP_PORT') || 
               3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
