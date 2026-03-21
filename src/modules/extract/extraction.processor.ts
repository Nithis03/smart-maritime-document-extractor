import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { ExtractService } from './extract.service';
import { JobService } from '../job/job.service';
import { JobStatus } from '../job/entities/job.entity';

export interface ExtractionJobData {
  jobId: string;
  sessionId: string;
  fileData: {
    originalname: string;
    mimetype: string;
    bufferBase64: string;
  };
}

@Processor('extractionQueue')
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);

  constructor(
    private readonly extractService: ExtractService,
    private readonly jobService: JobService,
  ) {
    super();
  }

  async process(job: BullJob<ExtractionJobData, any, string>): Promise<any> {
    const { jobId, sessionId, fileData } = job.data;
    
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
      } else {
         await this.jobService.updateJobStatus(jobId, JobStatus.FAILED, { 
           errorCode: extraction.errorCode || 'UNKNOWN_ERROR',
           errorMessage: extraction.errorMessage || 'No distinct message provided.',
           extractionId: extraction.id,
           completedAt: new Date() 
         });
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
      throw error;
    }
  }
}
