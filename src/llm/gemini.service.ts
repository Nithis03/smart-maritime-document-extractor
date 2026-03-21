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

  async validateSession(extractionsData: string): Promise<string> {
    const prompt = `You are an expert maritime document compliance auditor with deep knowledge of STCW, MARINA, IMO, and international seafarer certification standards.

A seafarer has uploaded multiple documents to their session. I am providing you the extracted data for each document in JSON format.

Your task is to perform a comprehensive cross-document compliance assessment:

1. BUILD A UNIFIED HOLDER PROFILE
   - Consolidate the holder's full name, date of birth, and nationality from all documents.
   - If there are discrepancies (e.g., name spelled differently across documents), note them.

2. CONSISTENCY CHECKS
   - Compare holder name across all documents — are they consistent?
   - Compare nationality, date of birth, passport number, SIRB number across overlapping docs.
   - Cross-reference issuing authorities with document types.
   - Flag any mismatch as inconsistent with a clear explanation.

3. MISSING DOCUMENTS
   - Based on the seafarer's detected role (DECK or ENGINE), identify any STCW-required documents that are missing from the session.
   - Common required documents: COC, SIRB, Passport, PEME, Drug Test, Basic Safety Training (COP_BT), PSCRB (COP_PSCRB), Advanced Firefighting (COP_AFF), MEFA/MECA, SSO, Yellow Fever.

4. EXPIRING DOCUMENTS
   - Identify any documents expiring within 90 days from today's date.
   - Include documents that are already expired.

5. MEDICAL FLAGS
   - Identify any medical concerns from PEME, Drug Test, or other medical documents.
   - Flag fitness restrictions, positive drug tests, or special medical conditions.

6. OVERALL STATUS
   - APPROVED: All required documents present, consistent, valid, no critical flags.
   - CONDITIONAL: Minor issues found (expiring soon, minor inconsistencies) but generally acceptable.
   - REJECTED: Critical issues (expired required certs, failed drug test, major inconsistencies, missing required documents).

7. OVERALL SCORE
   - Assign a numeric score from 0-100 representing the overall compliance health of this seafarer's document set.

Return ONLY a valid JSON object with NO markdown, NO code fences, NO preamble. Match this exact schema:

{
  "holderProfile": {
    "fullName": "string",
    "dateOfBirth": "string or null",
    "nationality": "string or null",
    "passportNumber": "string or null",
    "sirbNumber": "string or null",
    "detectedRole": "DECK | ENGINE | BOTH | N/A"
  },
  "consistencyChecks": [
    { "field": "string", "isConsistent": true, "documents": ["DOC_TYPE_A", "DOC_TYPE_B"], "details": "string" }
  ],
  "missingDocuments": [
    { "documentType": "string", "reason": "string", "severity": "CRITICAL | HIGH | MEDIUM" }
  ],
  "expiringDocuments": [
    { "documentType": "string", "expiryDate": "string", "daysRemaining": 0, "isExpired": true }
  ],
  "medicalFlags": [
    { "source": "PEME | DRUG_TEST | YELLOW_FEVER", "flag": "string", "severity": "CRITICAL | HIGH | MEDIUM | LOW" }
  ],
  "overallStatus": "APPROVED | CONDITIONAL | REJECTED",
  "overallScore": 0,
  "summary": "Two to three sentence summary of the compliance assessment.",
  "recommendations": ["string"]
}

Here is the document extraction data:
${extractionsData}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    this.logger.log(`Calling Gemini API for session validation`);
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
