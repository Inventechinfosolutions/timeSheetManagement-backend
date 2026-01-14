import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbType = (configService.get<string>('DB_TYPE', 'postgres') || 'postgres').toLowerCase();
        const synchronize = configService.get('DB_SYNCHRONIZE', 'true') === 'true' || 
                           configService.get('DB_SYNCHRON', 'true') === 'true';
        const dbName = configService.get<string>('DB_NAME') || 
                       configService.get<string>('DB_DATABASE') || 
                       'timesheet_db';
        const dbEntities = configService.get<string>('DB_ENTITIES');
        
        // Set default port based on database type
        const defaultPort = dbType === 'mysql' ? 3306 : 5432;
        const defaultUsername = dbType === 'mysql' ? 'root' : 'postgres';
        
        const config: any = {
          type: dbType,
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', defaultPort),
          username: configService.get<string>('DB_USERNAME', defaultUsername),
          password: configService.get<string>('DB_PASSWORD', ''),
          database: dbName,
          synchronize,
          logging: configService.get('DB_LOGGING', 'false') === 'true',
          autoLoadEntities: true,
        };

        // Set entities path
        if (dbEntities) {
          config.entities = [dbEntities];
        } else {
          config.entities = [__dirname + '/../**/*.entity{.ts,.js}'];
        }

        return config;
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}

