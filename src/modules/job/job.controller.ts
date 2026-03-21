import { Controller, Get, Post, Param, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobService } from './job.service';
import { JobStatus } from './entities/job.entity';
import { Extraction } from '../extract/entities/extraction.entity';

@Controller('jobs')
export class JobController {
  constructor(
    private readonly jobService: JobService,
    @InjectQueue('extractionQueue') private readonly extractionQueue: Queue,
  ) { }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    const job = await this.jobService.getJob(id);
    let status = job.status;

    if (status === JobStatus.QUEUED || status === JobStatus.PROCESSING) {
      const bullJob = await this.extractionQueue.getJob(id);
      if (!bullJob) {
        await this.jobService.updateJobStatus(id, JobStatus.FAILED, {
          errorCode: 'LOST_IN_QUEUE',
          errorMessage: 'Job was lost natively due to node restart or desync.'
        });
        status = JobStatus.FAILED;
        job.errorCode = 'LOST_IN_QUEUE';
      }
    }

    if (status === JobStatus.QUEUED) {
      const queuePosition = await this.jobService.getQueuePosition(job.id, job.createdAt);
      return {
        jobId: job.id,
        status: 'QUEUED',
        queuePosition,
        startedAt: job.createdAt,
        estimatedCompleteMs: queuePosition * 3000,
      };
    }

    if (status === JobStatus.PROCESSING) {
      return {
        jobId: job.id,
        status: 'PROCESSING',
        queuePosition: 0,
        startedAt: job.startedAt,
        estimatedCompleteMs: 3200,
      };
    }

    if (status === JobStatus.COMPLETE) {
      return {
        jobId: job.id,
        status: 'COMPLETE',
        extractionId: job.extraction?.id,
        result: job.extraction,
        completedAt: job.completedAt,
      };
    }

    if (status === JobStatus.FAILED) {
      return {
        jobId: job.id,
        status: 'FAILED',
        error: job.errorCode,
        message: job.errorMessage,
        extractionId: job.extractionId,
        retryAfterMs: null as number | null,
      };
    }
  }

  @Post(':id/retry')
  async retryJob(@Param('id') id: string) {
    const job = await this.jobService.getJob(id);
    if (job.status !== JobStatus.FAILED) {
      throw new BadRequestException('Job must be in FAILED status to be retried');
    }

    const bullJob = await this.extractionQueue.getJob(id);
    if (!bullJob) {
      throw new BadRequestException('Original job payload has expired from queue memory');
    }

    await this.jobService.updateJobStatus(id, JobStatus.QUEUED, {
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      extraction: null as unknown as Extraction,
      extractionId: null,
    });

    const state = await bullJob.getState();
    if (state === 'failed') {
      await bullJob.retry();
    } else {
      const data = bullJob.data;
      await bullJob.remove();
      await this.extractionQueue.add('extractDocument', data, { jobId: id });
    }

    const queuePosition = await this.jobService.getQueuePosition(id, job.createdAt);
    return {
      jobId: id,
      sessionId: job.sessionId,
      status: 'QUEUED',
      queuePosition,
      estimatedWaitMs: queuePosition * 3000,
      pollUrl: `/api/jobs/${id}`,
    };
  }
}
