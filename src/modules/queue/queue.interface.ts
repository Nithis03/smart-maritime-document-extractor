export const QUEUE_PROVIDER = Symbol('QUEUE_PROVIDER');

export interface IQueueProvider {
  addExtractionJob(jobId: string, data: any): Promise<void>;
  jobExists(jobId: string): Promise<boolean>;
  getJobState(jobId: string): Promise<string | null>;
  retryJob(jobId: string): Promise<void>;
  hardRestartJob(jobId: string): Promise<void>;
}
