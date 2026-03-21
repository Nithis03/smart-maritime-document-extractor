import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Extraction } from './entities/extraction.entity';
import { ExtractController } from './extract.controller';
import { ExtractService } from './extract.service';
import { SessionModule } from '../session/session.module';
import { LlmModule } from '../../llm/llm.module';
import { JobModule } from '../job/job.module';
import { ExtractionProcessor } from './extraction.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Extraction]),
    BullModule.registerQueue({
      name: 'extractionQueue',
    }),
    SessionModule,
    LlmModule,
    JobModule,
  ],
  controllers: [ExtractController],
  providers: [ExtractService, ExtractionProcessor],
  exports: [ExtractService],
})
export class ExtractModule {}
