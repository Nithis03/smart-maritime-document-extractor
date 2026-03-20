import { BadRequestException } from '@nestjs/common';

/**
 * Safely extracts a JSON string from a larger block of text by locating the first
 * and last curly braces. Throws an error if no valid boundaries are found.
 * 
 * @param text The raw response text
 * @returns The extracted JSON string
 */
export function extractJsonFromText(text: string): string {
  if (!text) {
    throw new BadRequestException('Empty response provided for JSON extraction.');
  }

  const firstBraceIndex = text.indexOf('{');
  const lastBraceIndex = text.lastIndexOf('}');

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || firstBraceIndex > lastBraceIndex) {
    throw new BadRequestException('Could not locate valid JSON boundaries in the response.');
  }

  return text.substring(firstBraceIndex, lastBraceIndex + 1);
}
