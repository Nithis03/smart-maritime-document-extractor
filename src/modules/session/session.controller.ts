import { Controller, Get, Post, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get(':sessionId')
  async getSessionSummary(@Param('sessionId') sessionId: string) {
    return this.sessionService.getSessionSummary(sessionId);
  }

  @Get(':sessionId/expiring')
  async getExpiringDocuments(
    @Param('sessionId') sessionId: string,
    @Query('withinDays', new DefaultValuePipe(90), ParseIntPipe) withinDays: number,
  ) {
    return this.sessionService.getExpiringDocuments(sessionId, withinDays);
  }

  @Get(':sessionId/report')
  async getSessionReport(@Param('sessionId') sessionId: string) {
    return this.sessionService.getSessionReport(sessionId);
  }

  @Post(':sessionId/validate')
  async validateSession(@Param('sessionId') sessionId: string) {
    return this.sessionService.validateSessionData(sessionId);
  }
}
