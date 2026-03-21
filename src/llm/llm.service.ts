import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './llm-provider.interface';
import { withTimeout } from '../common/utils/timeout.util';
import { EXTRACT_PROMPT, EXTRACT_PROMPT_VERSION } from './prompts/extract';
import { buildValidatePrompt, VALIDATE_PROMPT_VERSION } from './prompts/validate';

@Injectable()
export class LlmService implements LLMProvider {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly configService: ConfigService) { }

  getPromptVersion(): string {
    return EXTRACT_PROMPT_VERSION;
  }

  async extractDocument(base64: string, mimeType: string, context?: string): Promise<string> {
    let prompt = EXTRACT_PROMPT;

    if (context) {
      prompt += `\n\nAdditional Context:\n${context}`;
    }

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
    };

    this.logger.log(`Calling LLM API for extraction (MimeType: ${mimeType}, PromptVersion: ${EXTRACT_PROMPT_VERSION})`);
    return this.callLlmApi(payload);
  }

  async repairDocumentJSON(rawResponse: string): Promise<string> {
    const prompt = `The following response is invalid JSON. Fix it and return ONLY valid JSON:\n\n${rawResponse}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
          ],
        },
      ],
    };

    this.logger.log(`Calling LLM API for JSON repair`);
    return this.callLlmApi(payload);
  }

  async validateSession(extractionsData: string): Promise<string> {
    const prompt = buildValidatePrompt(extractionsData);

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    this.logger.log(`Calling LLM API for session validation (PromptVersion: ${VALIDATE_PROMPT_VERSION})`);
    return this.callLlmApi(payload);
  }

  private async callLlmApi(payload: Record<string, unknown>): Promise<string> {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    const model = this.configService.get<string>('LLM_MODEL');
    const baseUrl = this.configService.get<string>('LLM_BASE_URL');

    if (!apiKey || !model || !baseUrl) {
      throw new InternalServerErrorException('LLM_API_KEY, LLM_MODEL, or LLM_BASE_URL is not configured in the environment.');
    }

    const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();

    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal as AbortSignal,
    });

    const response = await withTimeout(fetchPromise, 30000, controller);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API returned status ${response.status}: ${errorText}`);
    }

    const json = await response.json();

    const candidates = json.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('LLM API returned no candidates in the response payload.');
    }

    const content = candidates[0].content;
    if (!content || !content.parts || content.parts.length === 0) {
      throw new Error('LLM API returned empty content.parts in the response payload.');
    }

    return String(content.parts[0].text);
  }
}
