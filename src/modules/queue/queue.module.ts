import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullQueueProvider } from './providers/bull-queue.provider';
import { QUEUE_PROVIDER } from './queue.interface';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'extractionQueue',
    }),
  ],
  providers: [
    {
      provide: QUEUE_PROVIDER,
      useClass: BullQueueProvider,
    },
  ],
  exports: [QUEUE_PROVIDER, BullModule],
})
export class QueueModule {}
