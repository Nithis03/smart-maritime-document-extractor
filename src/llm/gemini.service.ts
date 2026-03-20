import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './llm-provider.interface';
import { withTimeout } from '../common/utils/timeout.util';

@Injectable()
export class GeminiService implements LLMProvider {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly configService: ConfigService) { }

  async extractDocument(base64: string, mimeType: string, context?: string): Promise<string> {
    let prompt = `You are an expert maritime document analyst with deep knowledge of STCW, MARINA, IMO, and international seafarer certification standards.

A document has been provided. Perform the following in a single pass:
1. IDENTIFY the document type from the taxonomy below
2. DETERMINE if this belongs to a DECK officer, ENGINE officer, BOTH, or is role-agnostic (N/A)
3. EXTRACT all fields that are meaningful for this specific document type
4. FLAG any compliance issues, anomalies, or concerns

Document type taxonomy (use these exact codes):
COC | COP_BT | COP_PSCRB | COP_AFF | COP_MEFA | COP_MECA | COP_SSO | COP_SDSD |
ECDIS_GENERIC | ECDIS_TYPE | SIRB | PASSPORT | PEME | DRUG_TEST | YELLOW_FEVER |
ERM | MARPOL | SULPHUR_CAP | BALLAST_WATER | HATCH_COVER | BRM_SSBT |
TRAIN_TRAINER | HAZMAT | FLAG_STATE | OTHER

Return ONLY a valid JSON object. No markdown. No code fences. No preamble.

{
  "detection": {
    "documentType": "SHORT_CODE",
    "documentName": "Full human-readable document name",
    "category": "IDENTITY | CERTIFICATION | STCW_ENDORSEMENT | MEDICAL | TRAINING | FLAG_STATE | OTHER",
    "applicableRole": "DECK | ENGINE | BOTH | N/A",
    "isRequired": true,
    "confidence": "HIGH | MEDIUM | LOW",
    "detectionReason": "One sentence explaining how you identified this document"
  },
  "holder": {
    "fullName": "string or null",
    "dateOfBirth": "DD/MM/YYYY or null",
    "nationality": "string or null",
    "passportNumber": "string or null",
    "sirbNumber": "string or null",
    "rank": "string or null",
    "photo": "PRESENT | ABSENT"
  },
  "fields": [
    {
      "key": "snake_case_key",
      "label": "Human-readable label",
      "value": "extracted value as string",
      "importance": "CRITICAL | HIGH | MEDIUM | LOW",
      "status": "OK | EXPIRED | WARNING | MISSING | N/A"
    }
  ],
  "validity": {
    "dateOfIssue": "string or null",
    "dateOfExpiry": "string | 'No Expiry' | 'Lifetime' | null",
    "isExpired": false,
    "daysUntilExpiry": null,
    "revalidationRequired": null
  },
  "compliance": {
    "issuingAuthority": "string",
    "regulationReference": "e.g. STCW Reg VI/1 or null",
    "imoModelCourse": "e.g. IMO 1.22 or null",
    "recognizedAuthority": true,
    "limitations": "string or null"
  },
  "medicalData": {
    "fitnessResult": "FIT | UNFIT | N/A",
    "drugTestResult": "NEGATIVE | POSITIVE | N/A",
    "restrictions": "string or null",
    "specialNotes": "string or null",
    "expiryDate": "string or null"
  },
  "flags": [
    {
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "message": "Description of issue or concern"
    }
  ],
  "summary": "Two-sentence plain English summary of what this document confirms about the holder."
}`;

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
