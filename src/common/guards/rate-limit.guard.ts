import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request, Response } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @InjectQueue('extractionQueue') private readonly queue: Queue,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const key = `rate_limit:extract:${ip}`;

    const client = await this.queue.client;
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const uniqueValue = `${now}:${Math.random()}`;

    await client.zremrangebyscore(key, 0, windowStart);
    await client.zadd(key, now, uniqueValue);
    const requestCount = await client.zcard(key);
    await client.pexpire(key, WINDOW_MS);

    response.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - requestCount));

    if (requestCount > MAX_REQUESTS) {
      const oldestEntries = await client.zrange(key, 0, 0);
      let retryAfterMs = WINDOW_MS;

      if (oldestEntries.length > 0) {
        const oldestScore = await client.zscore(key, oldestEntries[0]);
        if (oldestScore) {
          retryAfterMs = Math.ceil((Number(oldestScore) + WINDOW_MS) - now);
        }
      }

      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      response.setHeader('Retry-After', retryAfterSeconds);
      response.setHeader('X-RateLimit-Remaining', 0);

      throw new HttpException({
        error: 'RATE_LIMITED',
        message: `Rate limit exceeded. Maximum ${MAX_REQUESTS} requests per minute. Try again in ${retryAfterSeconds} seconds.`,
        retryAfterMs,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
