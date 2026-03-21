export interface LLMProvider {
  extractDocument(base64: string, mimeType: string, context?: string): Promise<string>;
  repairDocumentJSON(rawResponse: string): Promise<string>;
  validateSession(extractionsData: string): Promise<string>;
}
