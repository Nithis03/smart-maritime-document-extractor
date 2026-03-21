import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job as BullJob } from 'bullmq';
import { ExtractService } from './extract.service';
import { JobService } from '../job/job.service';
import { JobStatus } from '../job/entities/job.entity';
import { dispatchWebhook, WebhookPayload } from '../../common/utils/webhook.util';

export interface ExtractionJobData {
  jobId: string;
  sessionId: string;
  fileData: {
    originalname: string;
    mimetype: string;
    bufferBase64: string;
  };
  webhookUrl?: string | null;
}

@Processor('extractionQueue')
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);

  constructor(
    private readonly extractService: ExtractService,
    private readonly jobService: JobService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: BullJob<ExtractionJobData, unknown, string>): Promise<unknown> {
    const { jobId, sessionId, fileData, webhookUrl } = job.data;
    
    await this.jobService.updateJobStatus(jobId, JobStatus.PROCESSING, { startedAt: new Date() });
    
    const file = {
      originalname: fileData.originalname,
      mimetype: fileData.mimetype,
      buffer: Buffer.from(fileData.bufferBase64, 'base64'),
    } as Express.Multer.File;

    try {
      this.logger.log(`Processing async extraction for job ${jobId}`);
      const outcome = await this.extractService.extractDocument(file, sessionId);
      const extraction = outcome.extraction;
      
      if (extraction.status === 'COMPLETE') {
         await this.jobService.updateJobStatus(jobId, JobStatus.COMPLETE, { 
           extractionId: extraction.id, 
           completedAt: new Date() 
         });

         if (webhookUrl) {
           await this.sendWebhook(webhookUrl, 'job.completed', jobId, sessionId, {
             extractionId: extraction.id,
             documentType: extraction.documentType,
             holderName: extraction.holderName,
             confidence: extraction.confidence,
             fileName: extraction.fileName,
           });
         }
      } else {
         await this.jobService.updateJobStatus(jobId, JobStatus.FAILED, { 
           errorCode: extraction.errorCode || 'UNKNOWN_ERROR',
           errorMessage: extraction.errorMessage || 'No distinct message provided.',
           extractionId: extraction.id,
           completedAt: new Date() 
         });

         if (webhookUrl) {
           await this.sendWebhook(webhookUrl, 'job.failed', jobId, sessionId, {
             errorCode: extraction.errorCode,
             errorMessage: extraction.errorMessage,
             extractionId: extraction.id,
           });
         }
      }
      
      return { extractionId: extraction.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${jobId} failed dramatically: ${msg}`);
      await this.jobService.updateJobStatus(jobId, JobStatus.FAILED, { 
         errorCode: 'QUEUE_PROCESSOR_ERROR',
         errorMessage: msg,
         completedAt: new Date() 
      });

      if (webhookUrl) {
        await this.sendWebhook(webhookUrl, 'job.failed', jobId, sessionId, {
          errorCode: 'QUEUE_PROCESSOR_ERROR',
          errorMessage: msg,
        });
      }

      throw error;
    }
  }

  private async sendWebhook(
    url: string,
    event: 'job.completed' | 'job.failed',
    jobId: string,
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const secret = this.configService.get<string>('WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('WEBHOOK_SECRET is not configured. Skipping webhook delivery.');
      return;
    }
    const payload: WebhookPayload = {
      event,
      jobId,
      sessionId,
      timestamp: new Date().toISOString(),
      data,
    };
    await dispatchWebhook(url, payload, secret);
  }
}
