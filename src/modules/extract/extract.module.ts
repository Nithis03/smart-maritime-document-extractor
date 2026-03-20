import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Extraction } from './entities/extraction.entity';
import { ExtractController } from './extract.controller';
import { ExtractService } from './extract.service';
import { SessionModule } from '../session/session.module';
import { LlmModule } from '../../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Extraction]),
    SessionModule,
    LlmModule,
  ],
  controllers: [ExtractController],
  providers: [ExtractService],
  exports: [ExtractService],
})
export class ExtractModule {}
