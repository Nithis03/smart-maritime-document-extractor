import { Controller, Post, Get, Param } from '@nestjs/common';
import { ValidationService } from './validation.service';

@Controller('sessions')
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Get(':sessionId')
  async getSessionSummary(@Param('sessionId') sessionId: string) {
    return this.validationService.getSessionSummary(sessionId);
  }

  @Post(':sessionId/validate')
  async validateSession(@Param('sessionId') sessionId: string) {
    return this.validationService.validateSessionData(sessionId);
  }

  @Get(':sessionId/report')
  async getSessionReport(@Param('sessionId') sessionId: string) {
    return this.validationService.getSessionReport(sessionId);
  }
}
