import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('health')
export class AppController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectQueue('extractionQueue') private readonly extractionQueue: Queue,
  ) {}

  @Get()
  async checkHealth() {
    let databaseStatus = 'FAILED';
    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        databaseStatus = 'OK';
      }
    } catch {
      databaseStatus = 'FAILED';
    }

    let queueStatus = 'FAILED';
    try {
      const client = await this.extractionQueue.client;
      const pingResult = await client.ping();
      if (pingResult === 'PONG') {
        queueStatus = 'OK';
      }
    } catch {
      queueStatus = 'FAILED';
    }

    const llmApiKey = this.configService.get<string>('LLM_API_KEY');
    const llmProviderStatus = typeof llmApiKey === 'string' && llmApiKey.length > 5 ? 'OK' : 'FAILED';
    
    const isHealthy = databaseStatus === 'OK' && queueStatus === 'OK' && llmProviderStatus === 'OK';

    return {
      status: isHealthy ? 'OK' : 'ERROR',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      dependencies: {
        database: databaseStatus,
        llmProvider: llmProviderStatus,
        queue: queueStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
