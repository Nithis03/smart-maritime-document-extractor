import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '../queue/queue.module';
import { Job } from './entities/job.entity';
import { JobService } from './job.service';
import { JobController } from './job.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    QueueModule,
  ],
  controllers: [JobController],
  providers: [JobService],
  exports: [TypeOrmModule, JobService, QueueModule],
})
export class JobModule {}
