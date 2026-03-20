export interface ExtractionResult {
  documentType: string;
  applicableRole: string | null;
  confidence: number;
  holderName: string | null;
  passportNumber: string | null;
  sirbNumber: string | null;
  fieldsJson: Record<string, unknown> | null;
  validityJson: Record<string, unknown> | null;
  medicalDataJson: Record<string, unknown> | null;
  flagsJson: Record<string, unknown> | null;
  rawLlmResponse: string;
}

export interface IGeminiService {
  extractDocumentData(base64File: string, mimeType: string): Promise<ExtractionResult>;
}
