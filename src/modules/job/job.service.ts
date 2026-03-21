import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus } from './entities/job.entity';

@Injectable()
export class JobService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) { }

  async createJob(sessionId: string, webhookUrl?: string): Promise<Job> {
    const job = this.jobRepository.create({
      sessionId,
      status: JobStatus.QUEUED,
      webhookUrl: webhookUrl || null,
    });
    return this.jobRepository.save(job);
  }

  async getJob(jobId: string): Promise<Job> {
    const job = await this.jobRepository.findOne({
      where: { id: jobId },
      relations: ['session', 'extraction'],
    });
    if (!job) throw new NotFoundException(`Job with ID ${jobId} not found`);
    return job;
  }

  async updateJobStatus(jobId: string, status: JobStatus, updates: Partial<Job> = {}): Promise<void> {
    await this.jobRepository.update(jobId, { status, ...updates });
  }

  async getQueuePosition(jobId: string, createdAt: Date): Promise<number> {
    const count = await this.jobRepository.createQueryBuilder('job')
      .where('job.status = :status', { status: JobStatus.QUEUED })
      .andWhere('job.createdAt < :createdAt', { createdAt })
      .getCount();
    return count + 1;
  }
}
