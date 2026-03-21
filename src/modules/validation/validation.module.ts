import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Validation } from './entities/validation.entity';
import { Extraction } from '../extract/entities/extraction.entity';
import { ValidationService } from './validation.service';
import { ValidationController } from './validation.controller';
import { SessionModule } from '../session/session.module';
import { LlmModule } from '../../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Validation, Extraction]),
    SessionModule,
    LlmModule,
  ],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [TypeOrmModule, ValidationService],
})
export class ValidationModule {}
