import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './llm-provider.interface';
import { withTimeout } from '../common/utils/timeout.util';

@Injectable()
export class GeminiService implements LLMProvider {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly configService: ConfigService) { }

  async extractDocument(base64: string, mimeType: string, context?: string): Promise<string> {
    let prompt = `Extract the structured information from this maritime document. Return ONLY valid JSON matching the required schema.`;

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

    this.logger.log(`Calling Gemini API for extraction (MimeType: ${mimeType})`);
    return this.callGeminiApi(payload);
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

    this.logger.log(`Calling Gemini API for JSON repair`);
    return this.callGeminiApi(payload);
  }

  private async callGeminiApi(payload: Record<string, unknown>): Promise<string> {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    const model = this.configService.get<string>('LLM_MODEL', 'gemini-1.5-flash');

    if (!apiKey) {
      throw new InternalServerErrorException('LLM_API_KEY is not configured in the environment.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();

    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal as any,
    });

    const response = await withTimeout(fetchPromise, 30000, controller);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API returned status ${response.status}: ${errorText}`);
    }

    const json = await response.json();

    const candidates = json.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Gemini API returned no candidates in the response payload.');
    }

    const content = candidates[0].content;
    if (!content || !content.parts || content.parts.length === 0) {
      throw new Error('Gemini API returned empty content.parts in the response payload.');
    }

    return String(content.parts[0].text);
  }
}
