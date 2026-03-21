import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { Extraction } from '../extract/entities/extraction.entity';
import { Validation } from './entities/validation.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { LlmModule } from '../../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Extraction, Validation]),
    LlmModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
