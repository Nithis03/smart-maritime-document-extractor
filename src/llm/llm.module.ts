import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';

export const LLM_PROVIDER = 'LLM_PROVIDER';

@Module({
  imports: [ConfigModule],
  providers: [
    LlmService,
    {
      provide: LLM_PROVIDER,
      useFactory: (configService: ConfigService, llmService: LlmService) => {
        const providerName = configService.get<string>('LLM_PROVIDER', 'generic');
        return llmService;
      },
      inject: [ConfigService, LlmService],
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule { }
