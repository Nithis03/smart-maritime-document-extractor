import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  checkHealth() {
    return {
      status: 'ok',
      message: 'Smart Maritime Document Extractor API is up and running!',
      timestamp: new Date().toISOString(),
    };
  }
}
