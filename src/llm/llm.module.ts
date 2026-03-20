import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';

export const LLM_PROVIDER = 'LLM_PROVIDER';

@Module({
  imports: [ConfigModule],
  providers: [
    GeminiService,
    {
      provide: LLM_PROVIDER,
      useFactory: (configService: ConfigService, geminiService: GeminiService) => {
        const providerName = configService.get<string>('LLM_PROVIDER', 'gemini');
        
        switch (providerName.toLowerCase()) {
          case 'gemini':
            return geminiService;
          default:
            throw new Error(`Unsupported LLM_PROVIDER: ${providerName}`);
        }
      },
      inject: [ConfigService, GeminiService],
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
