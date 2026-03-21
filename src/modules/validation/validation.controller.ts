import { Controller, Post, Get, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ValidationService } from './validation.service';

@Controller('sessions')
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Get(':sessionId')
  async getSessionSummary(@Param('sessionId') sessionId: string) {
    return this.validationService.getSessionSummary(sessionId);
  }

  @Get(':sessionId/expiring')
  async getExpiringDocuments(
    @Param('sessionId') sessionId: string,
    @Query('withinDays', new DefaultValuePipe(90), ParseIntPipe) withinDays: number,
  ) {
    return this.validationService.getExpiringDocuments(sessionId, withinDays);
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
