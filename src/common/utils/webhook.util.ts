import { createHmac } from 'crypto';
import { Logger } from '@nestjs/common';

const logger = new Logger('WebhookDispatcher');

export interface WebhookPayload {
  event: 'job.completed' | 'job.failed';
  jobId: string;
  sessionId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export async function dispatchWebhook(
  webhookUrl: string,
  payload: WebhookPayload,
  secret: string,
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn(`Webhook delivery to ${webhookUrl} returned status ${response.status}`);
    } else {
      logger.log(`Webhook delivered successfully to ${webhookUrl} for event ${payload.event}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Webhook delivery to ${webhookUrl} failed: ${msg}`);
  }
}
