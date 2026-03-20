export interface LLMProvider {
  extractDocument(base64: string, mimeType: string): Promise<string>;
  repairDocumentJSON(rawResponse: string): Promise<string>;
}
