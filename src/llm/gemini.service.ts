import { Injectable, Logger } from '@nestjs/common';
import { IGeminiService, ExtractionResult } from './gemini.interface';

@Injectable()
export class GeminiService implements IGeminiService {
  private readonly logger = new Logger(GeminiService.name);

  async extractDocumentData(base64File: string, mimeType: string): Promise<ExtractionResult> {
    this.logger.log(`Mocking LLM call for document parsing. MimeType: ${mimeType}, Size: ${base64File.length} chars (base64)`);
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulated structured LLM response matching our schema
    const mockStructuredData = {
      documentType: 'PASSPORT',
      applicableRole: 'DECK_OFFICER',
      confidence: 98.5,
      holderName: 'JOHN DOE',
      passportNumber: 'A12345678',
      sirbNumber: 'S-987654321',
      fieldsJson: {
        nationality: 'US',
        dateOfBirth: '1990-01-01',
        gender: 'M',
        placeOfBirth: 'NEW YORK',
      },
      validityJson: {
        issueDate: '2020-01-01',
        expiryDate: '2030-01-01',
      },
      medicalDataJson: null as Record<string, unknown> | null,
      flagsJson: {
        hasMissingSignatures: false,
        isExpired: false,
      },
    };

    const rawLlmResponse = JSON.stringify(mockStructuredData, null, 2);

    return {
      documentType: mockStructuredData.documentType,
      applicableRole: mockStructuredData.applicableRole,
      confidence: mockStructuredData.confidence,
      holderName: mockStructuredData.holderName,
      passportNumber: mockStructuredData.passportNumber,
      sirbNumber: mockStructuredData.sirbNumber,
      fieldsJson: mockStructuredData.fieldsJson,
      validityJson: mockStructuredData.validityJson,
      medicalDataJson: mockStructuredData.medicalDataJson,
      flagsJson: mockStructuredData.flagsJson,
      rawLlmResponse,
    };
  }
}
