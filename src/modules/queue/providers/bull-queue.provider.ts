import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IQueueProvider } from '../queue.interface';

@Injectable()
export class BullQueueProvider implements IQueueProvider {
  constructor(@InjectQueue('extractionQueue') private readonly queue: Queue) {}

  async addExtractionJob(jobId: string, data: any): Promise<void> {
    await this.queue.add('extractDocument', data, { jobId });
  }

  async jobExists(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    return !!job;
  }

  async getJobState(jobId: string): Promise<string | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    return await job.getState();
  }

  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  }

  async hardRestartJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      const data = job.data;
      await job.remove();
      await this.queue.add('extractDocument', data, { jobId });
    }
  }
}
