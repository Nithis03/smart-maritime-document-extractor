import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { SessionModule } from './modules/session/session.module';
import { ExtractModule } from './modules/extract/extract.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'maritime_user'),
        password: configService.get<string>('DB_PASSWORD', 'maritime_password'),
        database: configService.get<string>('DB_NAME', 'maritime_db'),
        autoLoadEntities: true,
        synchronize: true, // For development Phase 1 only
      }),
    }),
    SessionModule,
    ExtractModule,
    LlmModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
