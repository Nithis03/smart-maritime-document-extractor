import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './llm-provider.interface';

@Injectable()
export class GeminiService implements LLMProvider {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly configService: ConfigService) {}

  async extractDocument(base64: string, mimeType: string): Promise<string> {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    const model = this.configService.get<string>('LLM_MODEL', 'gemini-1.5-flash');

    if (!apiKey) {
      throw new InternalServerErrorException('LLM_API_KEY is not configured in the environment.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `Extract the structured information from this maritime document. Return ONLY valid JSON matching the required schema.`;

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

    this.logger.log(`Calling Gemini API (Model: ${model}, MimeType: ${mimeType})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

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
