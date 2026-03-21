import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Job } from './entities/job.entity';
import { JobService } from './job.service';
import { JobController } from './job.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    BullModule.registerQueue({
      name: 'extractionQueue',
    }),
  ],
  controllers: [JobController],
  providers: [JobService],
  exports: [TypeOrmModule, JobService, BullModule],
})
export class JobModule {}
